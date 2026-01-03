const express = require('express')
const router = express.Router()
const ServicePrice = require('../models/ServicePrice')
const { protect } = require('../middlewares/auth')
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple')

// @route   GET /api/service-prices
// @desc    Get all service prices (public)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { category } = req.query
    
    const query = { isActive: true }
    if (category) {
      query.category = category
    }
    
    const prices = await ServicePrice.find(query).sort({ category: 1, sortOrder: 1, garment: 1 })
    
    // Group by category
    const grouped = prices.reduce((acc, price) => {
      if (!acc[price.category]) {
        acc[price.category] = []
      }
      acc[price.category].push({
        _id: price._id,
        garment: price.garment,
        dryClean: price.dryClean,
        steamPress: price.steamPress,
        starch: price.starch,
        alteration: price.alteration
      })
      return acc
    }, {})
    
    res.json({
      success: true,
      data: grouped,
      prices: prices
    })
  } catch (error) {
    console.error('Get service prices error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// @route   GET /api/service-prices/all
// @desc    Get all service prices including inactive (admin)
// @access  Private (Admin/Center Admin)
router.get('/all', protect, async (req, res) => {
  try {
    const prices = await ServicePrice.find().sort({ category: 1, sortOrder: 1, garment: 1 })
    res.json({ success: true, data: prices })
  } catch (error) {
    console.error('Get all service prices error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// @route   POST /api/service-prices
// @desc    Create new service price
// @access  Private (Admin/Center Admin)
router.post('/', protect, async (req, res) => {
  try {
    const { category, garment, dryClean, steamPress, starch, alteration, sortOrder } = req.body
    
    // Check if already exists
    const existing = await ServicePrice.findOne({ category, garment })
    if (existing) {
      return res.status(400).json({ success: false, message: 'Price for this garment already exists in this category' })
    }
    
    const price = await ServicePrice.create({
      category,
      garment,
      dryClean: dryClean || 0,
      steamPress: steamPress || 0,
      starch: starch || 0,
      alteration: alteration || 0,
      sortOrder: sortOrder || 0
    })
    
    res.status(201).json({ success: true, data: price })
  } catch (error) {
    console.error('Create service price error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// @route   PUT /api/service-prices/:id
// @desc    Update service price
// @access  Private (Admin/Center Admin)
router.put('/:id', protect, async (req, res) => {
  try {
    const { category, garment, dryClean, steamPress, starch, alteration, isActive, sortOrder } = req.body
    
    const price = await ServicePrice.findByIdAndUpdate(
      req.params.id,
      { category, garment, dryClean, steamPress, starch, alteration, isActive, sortOrder },
      { new: true, runValidators: true }
    )
    
    if (!price) {
      return res.status(404).json({ success: false, message: 'Price not found' })
    }
    
    res.json({ success: true, data: price })
  } catch (error) {
    console.error('Update service price error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// @route   DELETE /api/service-prices/:id
// @desc    Delete service price
// @access  Private (Admin/Center Admin)
router.delete('/:id', protect, async (req, res) => {
  try {
    const price = await ServicePrice.findByIdAndDelete(req.params.id)
    
    if (!price) {
      return res.status(404).json({ success: false, message: 'Price not found' })
    }
    
    res.json({ success: true, message: 'Price deleted' })
  } catch (error) {
    console.error('Delete service price error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// @route   POST /api/service-prices/bulk
// @desc    Bulk create/update service prices
// @access  Private (Admin/Center Admin)
router.post('/bulk', protect, async (req, res) => {
  try {
    const { prices } = req.body
    
    if (!prices || !Array.isArray(prices)) {
      return res.status(400).json({ success: false, message: 'Prices array required' })
    }
    
    const results = []
    for (const priceData of prices) {
      const existing = await ServicePrice.findOne({ 
        category: priceData.category, 
        garment: priceData.garment 
      })
      
      if (existing) {
        // Update
        existing.dryClean = priceData.dryClean || 0
        existing.steamPress = priceData.steamPress || 0
        existing.starch = priceData.starch || 0
        existing.alteration = priceData.alteration || 0
        existing.sortOrder = priceData.sortOrder || 0
        existing.isActive = priceData.isActive !== false
        await existing.save()
        results.push(existing)
      } else {
        // Create
        const newPrice = await ServicePrice.create(priceData)
        results.push(newPrice)
      }
    }
    
    res.json({ success: true, data: results, count: results.length })
  } catch (error) {
    console.error('Bulk service price error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

module.exports = router
