const express = require('express')
const router = express.Router()
const ServiceItem = require('../models/ServiceItem')
const { protect, protectAny } = require('../middlewares/auth')

// @route   GET /api/service-items
// @desc    Get all service items (public - for order creation)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { service, branchId } = req.query
    
    const query = { isActive: true }
    if (service) {
      query.service = service
    }
    
    // If branchId provided, include branch-created items
    if (branchId) {
      query.$or = [
        { createdByBranch: { $exists: false } },
        { createdByBranch: null },
        { createdByBranch: branchId }
      ]
    } else {
      // Only global items (no branch-specific)
      query.$or = [
        { createdByBranch: { $exists: false } },
        { createdByBranch: null }
      ]
    }
    
    const items = await ServiceItem.find(query).sort({ service: 1, sortOrder: 1, name: 1 })
    
    // Group by service
    const grouped = items.reduce((acc, item) => {
      if (!acc[item.service]) {
        acc[item.service] = []
      }
      acc[item.service].push({
        id: item.itemId,
        name: item.name,
        basePrice: item.basePrice,
        category: item.category,
        description: item.description
      })
      return acc
    }, {})
    
    res.json({
      success: true,
      data: grouped,
      items: items
    })
  } catch (error) {
    console.error('Get service items error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// @route   GET /api/service-items/branch/:branchId
// @desc    Get service items for a specific branch (includes branch-created items)
// @access  Public
router.get('/branch/:branchId', async (req, res) => {
  try {
    const { branchId } = req.params
    const { service } = req.query
    const mongoose = require('mongoose')
    
    // Convert branchId to ObjectId for proper comparison
    let branchObjectId
    try {
      branchObjectId = new mongoose.Types.ObjectId(branchId)
    } catch (e) {
      return res.status(400).json({ success: false, message: 'Invalid branch ID' })
    }
    
    const query = { 
      isActive: true,
      $or: [
        { createdByBranch: { $exists: false } },
        { createdByBranch: null },
        { createdByBranch: branchObjectId }
      ]
    }
    
    if (service) {
      query.service = service
    }
    
    const items = await ServiceItem.find(query).sort({ service: 1, sortOrder: 1, name: 1 })
    
    console.log(`Found ${items.length} items for branch ${branchId}, branch-created: ${items.filter(i => i.createdByBranch).length}`)
    
    // Group by service
    const grouped = items.reduce((acc, item) => {
      if (!acc[item.service]) {
        acc[item.service] = []
      }
      acc[item.service].push({
        id: item.itemId,
        name: item.name,
        basePrice: item.basePrice,
        category: item.category,
        description: item.description
      })
      return acc
    }, {})
    
    res.json({
      success: true,
      data: grouped,
      items: items
    })
  } catch (error) {
    console.error('Get branch service items error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// @route   GET /api/service-items/all
// @desc    Get all service items including inactive (admin)
// @access  Private (Admin or Center Admin)
router.get('/all', protectAny, async (req, res) => {
  try {
    const items = await ServiceItem.find().sort({ service: 1, sortOrder: 1, name: 1 })
    res.json({ success: true, data: items })
  } catch (error) {
    console.error('Get all service items error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// @route   POST /api/service-items
// @desc    Create new service item
// @access  Private (Admin or Center Admin)
router.post('/', protectAny, async (req, res) => {
  try {
    const { name, itemId, service, category, basePrice, description, sortOrder } = req.body
    
    // Check if itemId already exists
    const existing = await ServiceItem.findOne({ itemId })
    if (existing) {
      return res.status(400).json({ success: false, message: 'Item ID already exists' })
    }
    
    const item = await ServiceItem.create({
      name,
      itemId: itemId || name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      service,
      category,
      basePrice,
      description,
      sortOrder: sortOrder || 0
    })
    
    res.status(201).json({ success: true, data: item })
  } catch (error) {
    console.error('Create service item error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// @route   PUT /api/service-items/:id
// @desc    Update service item
// @access  Private (Admin or Center Admin)
router.put('/:id', protectAny, async (req, res) => {
  try {
    const { name, itemId, service, category, basePrice, description, isActive, sortOrder } = req.body
    
    const item = await ServiceItem.findByIdAndUpdate(
      req.params.id,
      { name, itemId, service, category, basePrice, description, isActive, sortOrder },
      { new: true, runValidators: true }
    )
    
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' })
    }
    
    res.json({ success: true, data: item })
  } catch (error) {
    console.error('Update service item error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// @route   DELETE /api/service-items/:id
// @desc    Delete service item
// @access  Private (Admin or Center Admin)
router.delete('/:id', protectAny, async (req, res) => {
  try {
    const item = await ServiceItem.findByIdAndDelete(req.params.id)
    
    if (!item) {
      return res.status(404).json({ success: false, message: 'Item not found' })
    }
    
    res.json({ success: true, message: 'Item deleted' })
  } catch (error) {
    console.error('Delete service item error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// @route   POST /api/service-items/bulk
// @desc    Bulk create/update service items
// @access  Private (Admin or Center Admin)
router.post('/bulk', protectAny, async (req, res) => {
  try {
    const { items } = req.body
    
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ success: false, message: 'Items array required' })
    }
    
    const results = []
    for (const itemData of items) {
      const existing = await ServiceItem.findOne({ itemId: itemData.itemId })
      
      if (existing) {
        // Update
        Object.assign(existing, itemData)
        await existing.save()
        results.push(existing)
      } else {
        // Create
        const newItem = await ServiceItem.create(itemData)
        results.push(newItem)
      }
    }
    
    res.json({ success: true, data: results, count: results.length })
  } catch (error) {
    console.error('Bulk service items error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

module.exports = router
