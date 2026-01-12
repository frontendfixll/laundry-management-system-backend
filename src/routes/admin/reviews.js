const express = require('express')
const router = express.Router()
const Review = require('../../models/Review')
const Branch = require('../../models/Branch')

// Note: Authentication is already applied via adminRoutes.js (protect middleware)

// Get all reviews for admin's tenancy
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, branchId, rating, flagged, search } = req.query
    
    const query = { tenancy: req.user.tenancy }
    
    if (status) query.status = status
    if (branchId) query.branch = branchId
    if (rating) query['ratings.overall'] = parseInt(rating)
    if (flagged === 'true') query.flagCount = { $gt: 0 }
    
    if (search) {
      query.$or = [
        { content: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { reviewId: { $regex: search, $options: 'i' } }
      ]
    }
    
    const reviews = await Review.find(query)
      .populate('customer', 'name email phone')
      .populate('branch', 'name code')
      .populate('order', 'orderNumber')
      .populate('moderatedBy', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean()
    
    const total = await Review.countDocuments(query)
    
    // Get stats
    const stats = await Review.aggregate([
      { $match: { tenancy: req.user.tenancy } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          hidden: { $sum: { $cond: [{ $eq: ['$status', 'hidden'] }, 1, 0] } },
          flagged: { $sum: { $cond: [{ $gt: ['$flagCount', 0] }, 1, 0] } },
          avgRating: { $avg: '$ratings.overall' }
        }
      }
    ])
    
    res.json({
      success: true,
      data: {
        reviews,
        stats: stats[0] || { total: 0, pending: 0, approved: 0, rejected: 0, hidden: 0, flagged: 0, avgRating: 0 },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    })
  } catch (error) {
    console.error('Error fetching reviews:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch reviews' })
  }
})

// Get single review details
router.get('/:reviewId', async (req, res) => {
  try {
    const review = await Review.findOne({
      _id: req.params.reviewId,
      tenancy: req.user.tenancy
    })
      .populate('customer', 'name email phone')
      .populate('branch', 'name code address')
      .populate('order', 'orderNumber status pricing')
      .populate('moderatedBy', 'name')
      .populate('flags.flaggedBy', 'name')
      .populate('reply.repliedBy', 'name')
    
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }
    
    res.json({ success: true, data: review })
  } catch (error) {
    console.error('Error fetching review:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch review' })
  }
})

// Moderate review (approve/reject/hide)
router.put('/:reviewId/moderate', async (req, res) => {
  try {
    const { status, reason } = req.body
    
    if (!['approved', 'rejected', 'hidden'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' })
    }
    
    const review = await Review.findOne({
      _id: req.params.reviewId,
      tenancy: req.user.tenancy
    })
    
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }
    
    review.status = status
    review.moderatedBy = req.user._id
    review.moderatedAt = new Date()
    review.moderationReason = reason
    review.isVisible = status === 'approved'
    
    await review.save()
    
    // Update branch average rating
    const stats = await Review.getBranchStats(review.branch)
    await Branch.findByIdAndUpdate(review.branch, {
      'metrics.averageRating': stats.avgOverall
    })
    
    res.json({
      success: true,
      message: `Review ${status} successfully`,
      data: review
    })
  } catch (error) {
    console.error('Error moderating review:', error)
    res.status(500).json({ success: false, message: 'Failed to moderate review' })
  }
})

// Clear flags on a review
router.put('/:reviewId/clear-flags', async (req, res) => {
  try {
    const review = await Review.findOneAndUpdate(
      { _id: req.params.reviewId, tenancy: req.user.tenancy },
      { $set: { flags: [], flagCount: 0 } },
      { new: true }
    )
    
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }
    
    res.json({
      success: true,
      message: 'Flags cleared successfully',
      data: review
    })
  } catch (error) {
    console.error('Error clearing flags:', error)
    res.status(500).json({ success: false, message: 'Failed to clear flags' })
  }
})

// Add reply to a review
router.post('/:reviewId/reply', async (req, res) => {
  try {
    const { content } = req.body
    
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Reply content is required' })
    }
    
    const review = await Review.findOne({
      _id: req.params.reviewId,
      tenancy: req.user.tenancy
    })
    
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }
    
    review.reply = {
      content: content.trim(),
      repliedBy: req.user._id,
      repliedAt: new Date(),
      isEdited: !!review.reply
    }
    
    await review.save()
    
    // Populate reply info
    await review.populate('reply.repliedBy', 'name')
    
    res.json({
      success: true,
      message: 'Reply added successfully',
      data: { reply: review.reply }
    })
  } catch (error) {
    console.error('Error adding reply:', error)
    res.status(500).json({ success: false, message: 'Failed to add reply' })
  }
})

// Update reply
router.put('/:reviewId/reply', async (req, res) => {
  try {
    const { content } = req.body
    
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Reply content is required' })
    }
    
    const review = await Review.findOne({
      _id: req.params.reviewId,
      tenancy: req.user.tenancy
    })
    
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }
    
    if (!review.reply) {
      return res.status(400).json({ success: false, message: 'No reply exists to update' })
    }
    
    review.reply.content = content.trim()
    review.reply.repliedBy = req.user._id
    review.reply.repliedAt = new Date()
    review.reply.isEdited = true
    
    await review.save()
    await review.populate('reply.repliedBy', 'name')
    
    res.json({
      success: true,
      message: 'Reply updated successfully',
      data: { reply: review.reply }
    })
  } catch (error) {
    console.error('Error updating reply:', error)
    res.status(500).json({ success: false, message: 'Failed to update reply' })
  }
})

// Delete reply
router.delete('/:reviewId/reply', async (req, res) => {
  try {
    const review = await Review.findOne({
      _id: req.params.reviewId,
      tenancy: req.user.tenancy
    })
    
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }
    
    review.reply = undefined
    await review.save()
    
    res.json({
      success: true,
      message: 'Reply deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting reply:', error)
    res.status(500).json({ success: false, message: 'Failed to delete reply' })
  }
})

// Get review analytics
router.get('/analytics/overview', async (req, res) => {
  try {
    const { startDate, endDate } = req.query
    
    const matchQuery = { tenancy: req.user.tenancy }
    if (startDate && endDate) {
      matchQuery.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    }
    
    // Overall stats
    const overallStats = await Review.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          avgRating: { $avg: '$ratings.overall' },
          avgServiceQuality: { $avg: '$ratings.serviceQuality' },
          avgDeliverySpeed: { $avg: '$ratings.deliverySpeed' },
          avgCleanliness: { $avg: '$ratings.cleanliness' },
          avgValueForMoney: { $avg: '$ratings.valueForMoney' },
          avgStaffBehavior: { $avg: '$ratings.staffBehavior' },
          totalHelpfulVotes: { $sum: '$helpfulVotes' }
        }
      }
    ])
    
    // Rating distribution
    const ratingDistribution = await Review.aggregate([
      { $match: { ...matchQuery, status: 'approved' } },
      {
        $group: {
          _id: '$ratings.overall',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } }
    ])
    
    // Reviews by branch
    const reviewsByBranch = await Review.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$branch',
          count: { $sum: 1 },
          avgRating: { $avg: '$ratings.overall' }
        }
      },
      {
        $lookup: {
          from: 'branches',
          localField: '_id',
          foreignField: '_id',
          as: 'branch'
        }
      },
      { $unwind: '$branch' },
      {
        $project: {
          branchName: '$branch.name',
          count: 1,
          avgRating: { $round: ['$avgRating', 1] }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ])
    
    // Reviews trend (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const reviewsTrend = await Review.aggregate([
      { 
        $match: { 
          tenancy: req.user.tenancy,
          createdAt: { $gte: thirtyDaysAgo }
        } 
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          avgRating: { $avg: '$ratings.overall' }
        }
      },
      { $sort: { _id: 1 } }
    ])
    
    res.json({
      success: true,
      data: {
        overall: overallStats[0] || {},
        ratingDistribution,
        reviewsByBranch,
        reviewsTrend
      }
    })
  } catch (error) {
    console.error('Error fetching analytics:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch analytics' })
  }
})

module.exports = router
