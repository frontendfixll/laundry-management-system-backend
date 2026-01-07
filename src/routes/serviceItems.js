const express = require('express')
const router = express.Router()
const ServiceItem = require('../models/ServiceItem')
const { protect, protectAny } = require('../middlewares/auth')

// @route   GET /api/service-items
// @desc    Get all service items (public - for order creation)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const { service } = req.query
    
    const query = { 
      isActive: true,
      // Only global items (no branch-specific)
      $or: [
        { createdByBranch: { $exists: false } },
        { createdByBranch: null }
      ]
    }
    
    if (service) {
      query.service = service
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
// @desc    Get service items for a specific branch (includes global + branch-specific items)
// @access  Public
router.get('/branch/:branchId', async (req, res) => {
  try {
    const { branchId } = req.params
    const { service } = req.query
    
    const query = { 
      isActive: true,
      // Include both global items and branch-specific items
      $or: [
        { createdByBranch: { $exists: false } },
        { createdByBranch: null },
        { createdByBranch: branchId }
      ]
    }
    
    if (service) {
      query.service = service
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
      items: items,
      branchId: branchId
    })
  } catch (error) {
    console.error('Get branch service items error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

module.exports = router