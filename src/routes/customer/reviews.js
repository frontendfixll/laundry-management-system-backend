const express = require('express')
const router = express.Router()
const Review = require('../../models/Review')
const Branch = require('../../models/Branch')
const Order = require('../../models/Order')

// Note: Authentication is already applied via customerRoutes.js (protect middleware)

// Get all reviews for a branch (public - but accessed via authenticated customer route)
router.get('/branch/:branchId', async (req, res) => {
  try {
    const { branchId } = req.params
    const { page = 1, limit = 10, sort = 'recent', rating } = req.query
    
    const query = { 
      branch: branchId, 
      status: 'approved', 
      isVisible: true 
    }
    
    if (rating) {
      query['ratings.overall'] = parseInt(rating)
    }
    
    let sortOption = { createdAt: -1 }
    if (sort === 'helpful') {
      sortOption = { helpfulVotes: -1, createdAt: -1 }
    } else if (sort === 'highest') {
      sortOption = { 'ratings.overall': -1, createdAt: -1 }
    } else if (sort === 'lowest') {
      sortOption = { 'ratings.overall': 1, createdAt: -1 }
    }
    
    const reviews = await Review.find(query)
      .populate('customer', 'name')
      .populate('reply.repliedBy', 'name')
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean()
    
    const total = await Review.countDocuments(query)
    const stats = await Review.getBranchStats(branchId)
    
    res.json({
      success: true,
      data: {
        reviews,
        stats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    })
  } catch (error) {
    console.error('Error fetching branch reviews:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch reviews' })
  }
})

// Get branch review stats (public)
router.get('/branch/:branchId/stats', async (req, res) => {
  try {
    const { branchId } = req.params
    const stats = await Review.getBranchStats(branchId)
    
    res.json({ success: true, data: stats })
  } catch (error) {
    console.error('Error fetching review stats:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch stats' })
  }
})

// Get my reviews (authenticated - auth already applied)
// Supports tenancyId query param for tenant-specific filtering
router.get('/my-reviews', async (req, res) => {
  try {
    const { page = 1, limit = 10, tenancyId } = req.query
    
    // Build query
    const query = { customer: req.user._id }
    
    // If tenancyId provided, filter by tenancy
    if (tenancyId) {
      query.tenancy = tenancyId
    }
    
    const reviews = await Review.find(query)
      .populate('branch', 'name address')
      .populate('order', 'orderNumber')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean()
    
    const total = await Review.countDocuments(query)
    
    res.json({
      success: true,
      data: {
        reviews,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    })
  } catch (error) {
    console.error('Error fetching my reviews:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch reviews' })
  }
})

// Create a review (authenticated - auth already applied)
router.post('/', async (req, res) => {
  try {
    const { branchId, orderId, ratings, title, content, photos, tenancyId } = req.body
    
    // Validate branch exists
    const branch = await Branch.findById(branchId)
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' })
    }
    
    // Get tenancy - from branch or from request
    const tenancy = branch.tenancy || tenancyId
    if (!tenancy) {
      return res.status(400).json({ success: false, message: 'Tenancy information is required' })
    }
    
    // Check if user already reviewed this branch (one review per branch)
    const existingReview = await Review.findOne({
      customer: req.user._id,
      branch: branchId
    })
    
    if (existingReview) {
      return res.status(400).json({ 
        success: false, 
        message: 'You have already reviewed this branch. You can edit your existing review.' 
      })
    }
    
    // Validate order if provided
    let order = null
    if (orderId) {
      order = await Order.findOne({ 
        _id: orderId, 
        customer: req.user._id,
        branch: branchId,
        status: 'delivered'
      })
      if (!order) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid order or order not delivered yet' 
        })
      }
    }
    
    // Check if this is user's first review
    const reviewCount = await Review.countDocuments({ customer: req.user._id })
    const badges = []
    if (reviewCount === 0) {
      badges.push('first_review')
    }
    
    // Clean ratings - remove 0 values (only keep ratings that were actually given)
    const cleanRatings = {
      overall: ratings.overall
    }
    if (ratings.serviceQuality && ratings.serviceQuality > 0) {
      cleanRatings.serviceQuality = ratings.serviceQuality
    }
    if (ratings.deliverySpeed && ratings.deliverySpeed > 0) {
      cleanRatings.deliverySpeed = ratings.deliverySpeed
    }
    if (ratings.cleanliness && ratings.cleanliness > 0) {
      cleanRatings.cleanliness = ratings.cleanliness
    }
    if (ratings.valueForMoney && ratings.valueForMoney > 0) {
      cleanRatings.valueForMoney = ratings.valueForMoney
    }
    if (ratings.staffBehavior && ratings.staffBehavior > 0) {
      cleanRatings.staffBehavior = ratings.staffBehavior
    }
    
    const review = new Review({
      tenancy: tenancy,
      customer: req.user._id,
      branch: branchId,
      order: orderId || null,
      ratings: cleanRatings,
      title,
      content,
      photos: photos || [],
      badges
    })
    
    await review.save()
    
    // Update branch average rating
    const stats = await Review.getBranchStats(branchId)
    await Branch.findByIdAndUpdate(branchId, {
      'metrics.averageRating': stats.avgOverall
    })
    
    const populatedReview = await Review.findById(review._id)
      .populate('customer', 'name')
      .populate('branch', 'name')
    
    res.status(201).json({
      success: true,
      message: 'Review submitted successfully',
      data: populatedReview
    })
  } catch (error) {
    console.error('Error creating review:', error)
    res.status(500).json({ success: false, message: 'Failed to submit review' })
  }
})

// Update my review
router.put('/:reviewId', async (req, res) => {
  try {
    const { reviewId } = req.params
    const { ratings, title, content, photos } = req.body
    
    const review = await Review.findOne({
      _id: reviewId,
      customer: req.user._id
    })
    
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }
    
    // Save edit history
    review.editHistory.push({
      previousContent: review.content,
      previousRatings: review.ratings
    })
    
    // Clean ratings - remove 0 values
    const cleanRatings = {
      overall: ratings.overall
    }
    if (ratings.serviceQuality && ratings.serviceQuality > 0) {
      cleanRatings.serviceQuality = ratings.serviceQuality
    }
    if (ratings.deliverySpeed && ratings.deliverySpeed > 0) {
      cleanRatings.deliverySpeed = ratings.deliverySpeed
    }
    if (ratings.cleanliness && ratings.cleanliness > 0) {
      cleanRatings.cleanliness = ratings.cleanliness
    }
    if (ratings.valueForMoney && ratings.valueForMoney > 0) {
      cleanRatings.valueForMoney = ratings.valueForMoney
    }
    if (ratings.staffBehavior && ratings.staffBehavior > 0) {
      cleanRatings.staffBehavior = ratings.staffBehavior
    }
    
    review.ratings = cleanRatings
    review.title = title
    review.content = content
    review.photos = photos || review.photos
    review.isEdited = true
    
    await review.save()
    
    // Update branch average rating
    const stats = await Review.getBranchStats(review.branch)
    await Branch.findByIdAndUpdate(review.branch, {
      'metrics.averageRating': stats.avgOverall
    })
    
    res.json({
      success: true,
      message: 'Review updated successfully',
      data: review
    })
  } catch (error) {
    console.error('Error updating review:', error)
    res.status(500).json({ success: false, message: 'Failed to update review' })
  }
})

// Delete my review
router.delete('/:reviewId', async (req, res) => {
  try {
    const { reviewId } = req.params
    
    const review = await Review.findOneAndDelete({
      _id: reviewId,
      customer: req.user._id
    })
    
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }
    
    // Update branch average rating
    const stats = await Review.getBranchStats(review.branch)
    await Branch.findByIdAndUpdate(review.branch, {
      'metrics.averageRating': stats.avgOverall
    })
    
    res.json({
      success: true,
      message: 'Review deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting review:', error)
    res.status(500).json({ success: false, message: 'Failed to delete review' })
  }
})

// Vote on a review (helpful/not helpful)
router.post('/:reviewId/vote', async (req, res) => {
  try {
    const { reviewId } = req.params
    const { vote } = req.body // 'helpful' or 'not_helpful'
    
    if (!['helpful', 'not_helpful'].includes(vote)) {
      return res.status(400).json({ success: false, message: 'Invalid vote type' })
    }
    
    const review = await Review.findById(reviewId)
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }
    
    // Can't vote on own review
    if (review.customer.equals(req.user._id)) {
      return res.status(400).json({ success: false, message: 'Cannot vote on your own review' })
    }
    
    await review.addVote(req.user._id, vote)
    
    res.json({
      success: true,
      message: 'Vote recorded',
      data: {
        helpfulVotes: review.helpfulVotes,
        notHelpfulVotes: review.notHelpfulVotes
      }
    })
  } catch (error) {
    console.error('Error voting on review:', error)
    res.status(500).json({ success: false, message: 'Failed to record vote' })
  }
})

// Flag a review
router.post('/:reviewId/flag', async (req, res) => {
  try {
    const { reviewId } = req.params
    const { reason, description } = req.body
    
    const review = await Review.findById(reviewId)
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' })
    }
    
    await review.addFlag(req.user._id, reason, description)
    
    res.json({
      success: true,
      message: 'Review flagged for moderation'
    })
  } catch (error) {
    if (error.message === 'You have already flagged this review') {
      return res.status(400).json({ success: false, message: error.message })
    }
    console.error('Error flagging review:', error)
    res.status(500).json({ success: false, message: 'Failed to flag review' })
  }
})

// Get branches user can review (completed orders)
// Supports tenancyId query param for tenant-specific filtering
router.get('/reviewable-branches', async (req, res) => {
  try {
    const { tenancyId } = req.query
    
    // Build order query
    const orderQuery = {
      customer: req.user._id,
      status: 'delivered'
    }
    
    // If tenancyId provided, filter by tenancy
    if (tenancyId) {
      orderQuery.tenancy = tenancyId
    }
    
    // Get branches where user has completed orders but hasn't reviewed yet
    const completedOrders = await Order.find(orderQuery).populate('branch', 'name address tenancy')
    
    // Get branches user already reviewed
    const reviewedBranches = await Review.find({
      customer: req.user._id
    }).distinct('branch')
    
    // Filter out already reviewed branches
    const reviewableBranches = completedOrders
      .filter(order => order.branch && !reviewedBranches.some(rb => rb.equals(order.branch._id)))
      .map(order => ({
        branch: order.branch,
        orderId: order._id,
        orderNumber: order.orderNumber,
        deliveredAt: order.actualDeliveryDate || order.updatedAt
      }))
    
    // Remove duplicates (same branch from multiple orders)
    const uniqueBranches = []
    const seenBranches = new Set()
    for (const item of reviewableBranches) {
      if (!seenBranches.has(item.branch._id.toString())) {
        seenBranches.add(item.branch._id.toString())
        uniqueBranches.push(item)
      }
    }
    
    res.json({
      success: true,
      data: uniqueBranches
    })
  } catch (error) {
    console.error('Error fetching reviewable branches:', error)
    res.status(500).json({ success: false, message: 'Failed to fetch branches' })
  }
})

module.exports = router
