const express = require('express')
const router = express.Router()
const Review = require('../../models/Review')
const Branch = require('../../models/Branch')
const { protect } = require('../../middlewares/auth')

// Apply authentication
router.use(protect)

// Helper function to get branch for current user
const getBranchForUser = async (user) => {
  // First try to find branch where user is manager
  let branch = await Branch.findOne({ manager: user._id })
  
  // If not found and user has assignedBranch, use that
  if (!branch && user.assignedBranch) {
    branch = await Branch.findById(user.assignedBranch)
  }
  
  return branch
}

// Get reviews for branch admin's branch
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, rating, hasReply, search } = req.query
    
    // Get branch admin's branch
    const branch = await getBranchForUser(req.user)
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' })
    }
    
    const query = { branch: branch._id, status: 'approved' }
    
    if (rating) query['ratings.overall'] = parseInt(rating)
    if (hasReply === 'true') query['reply.content'] = { $exists: true, $ne: null }
    if (hasReply === 'false') query['reply.content'] = { $exists: false }
    
    if (search) {
      query.$or = [
        { content: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } }
      ]
    }
    
    const reviews = await Review.find(query)
      .populate('customer', 'name')
      .populate('order', 'orderNumber')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean()
    
    const total = await Review.countDocuments(query)
    const stats = await Review.getBranchStats(branch._id)
    
    // Count reviews needing reply
    const needsReplyCount = await Review.countDocuments({
      branch: branch._id,
      status: 'approved',
      'reply.content': { $exists: false }
    })
    
    res.json({
      success: true,
      data: {
        reviews,
        stats: {
          ...stats,
          needsReply: needsReplyCount
        },
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

// Get single review
router.get('/:reviewId', async (req, res) => {
  try {
    const branch = await getBranchForUser(req.user)
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' })
    }
    
    const review = await Review.findOne({
      _id: req.params.reviewId,
      branch: branch._id
    })
      .populate('customer', 'name email')
      .populate('order', 'orderNumber status pricing createdAt')
    
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }
    
    res.json({ success: true, data: review })
  } catch (error) {
    console.error('Error fetching review:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch review' })
  }
})

// Reply to a review
router.post('/:reviewId/reply', async (req, res) => {
  try {
    const { content } = req.body
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Reply content is required' })
    }
    
    if (content.length > 500) {
      return res.status(400).json({ success: false, message: 'Reply must be under 500 characters' })
    }
    
    const branch = await getBranchForUser(req.user)
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' })
    }
    
    const review = await Review.findOne({
      _id: req.params.reviewId,
      branch: branch._id
    })
    
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }
    
    if (review.reply && review.reply.content) {
      return res.status(400).json({ success: false, message: 'Review already has a reply. Use edit instead.' })
    }
    
    await review.addReply(req.user._id, content.trim())
    
    res.json({
      success: true,
      message: 'Reply added successfully',
      data: review
    })
  } catch (error) {
    console.error('Error adding reply:', error)
    res.status(500).json({ success: false, message: 'Failed to add reply' })
  }
})

// Edit reply
router.put('/:reviewId/reply', async (req, res) => {
  try {
    const { content } = req.body
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Reply content is required' })
    }
    
    if (content.length > 500) {
      return res.status(400).json({ success: false, message: 'Reply must be under 500 characters' })
    }
    
    const branch = await getBranchForUser(req.user)
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' })
    }
    
    const review = await Review.findOne({
      _id: req.params.reviewId,
      branch: branch._id
    })
    
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }
    
    if (!review.reply || !review.reply.content) {
      return res.status(400).json({ success: false, message: 'No reply to edit' })
    }
    
    await review.editReply(content.trim())
    
    res.json({
      success: true,
      message: 'Reply updated successfully',
      data: review
    })
  } catch (error) {
    console.error('Error editing reply:', error)
    res.status(500).json({ success: false, message: 'Failed to edit reply' })
  }
})

// Delete reply
router.delete('/:reviewId/reply', async (req, res) => {
  try {
    const branch = await getBranchForUser(req.user)
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' })
    }
    
    const review = await Review.findOneAndUpdate(
      { _id: req.params.reviewId, branch: branch._id },
      { $unset: { reply: 1 } },
      { new: true }
    )
    
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }
    
    res.json({
      success: true,
      message: 'Reply deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting reply:', error)
    res.status(500).json({ success: false, message: 'Failed to delete reply' })
  }
})

// Get review analytics for branch
router.get('/analytics/overview', async (req, res) => {
  try {
    const branch = await getBranchForUser(req.user)
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' })
    }
    
    const stats = await Review.getBranchStats(branch._id)
    
    // Recent reviews
    const recentReviews = await Review.find({
      branch: branch._id,
      status: 'approved'
    })
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
    
    // Reviews needing reply
    const needsReply = await Review.find({
      branch: branch._id,
      status: 'approved',
      'reply.content': { $exists: false }
    })
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean()
    
    // Monthly trend
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    
    const monthlyTrend = await Review.aggregate([
      {
        $match: {
          branch: branch._id,
          status: 'approved',
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          count: { $sum: 1 },
          avgRating: { $avg: '$ratings.overall' }
        }
      },
      { $sort: { _id: 1 } }
    ])
    
    res.json({
      success: true,
      data: {
        stats,
        recentReviews,
        needsReply,
        monthlyTrend
      }
    })
  } catch (error) {
    console.error('Error fetching analytics:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch analytics' })
  }
})

module.exports = router
