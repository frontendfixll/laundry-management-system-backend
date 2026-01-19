const express = require('express');
const router = express.Router();
const InventoryRequest = require('../../models/InventoryRequest');
const { protect } = require('../../middlewares/auth');
const NotificationService = require('../../services/notificationService');

// @route   POST /api/admin/inventory/request
// @desc    Create new inventory item request
// @access  Private (Admin)
router.post('/request', protect, async (req, res) => {
  try {
    const { itemName, category, description, estimatedQuantity, unit, urgency, justification } = req.body;

    // Validation
    if (!itemName || !description) {
      return res.status(400).json({
        success: false,
        message: 'Item name and description are required'
      });
    }

    // Create inventory request
    const inventoryRequest = new InventoryRequest({
      tenancyId: req.user.tenancyId,
      requestedBy: req.user._id,
      itemName: itemName.trim(),
      category: category || 'Other',
      description: description.trim(),
      estimatedQuantity: estimatedQuantity || 'Not specified',
      unit: unit || 'units',
      urgency: urgency || 'normal',
      justification: justification || '',
      status: 'pending',
      requestDate: new Date()
    });

    await inventoryRequest.save();

    // Populate user details for response
    await inventoryRequest.populate('requestedBy', 'name email');

    // Notify all SuperAdmins about the new request
    try {
      const SuperAdmin = require('../../models/SuperAdmin');
      const Tenancy = require('../../models/Tenancy');
      const NotificationService = require('../../services/notificationService');
      
      const tenancy = await Tenancy.findById(req.user.tenancyId).select('businessName subdomain');
      const superAdmins = await SuperAdmin.find({ isActive: true }).select('_id');
      
      // Send notification to all SuperAdmins
      await Promise.all(
        superAdmins.map(sa => 
          NotificationService.notifyInventoryRequestSubmitted(sa._id, inventoryRequest, tenancy)
        )
      );
      
      console.log(`📢 Notified ${superAdmins.length} SuperAdmin(s) about inventory request`);
    } catch (error) {
      console.error('Failed to send inventory request notifications:', error);
    }

    res.status(201).json({
      success: true,
      message: 'Inventory request sent successfully',
      data: {
        request: inventoryRequest
      }
    });

  } catch (error) {
    console.error('Error creating inventory request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create inventory request'
    });
  }
});

// @route   GET /api/admin/inventory/requests
// @desc    Get inventory requests for current tenancy
// @access  Private (Admin)
router.get('/requests', protect, async (req, res) => {
  try {
    const { page = 1, limit = 10, status = 'all' } = req.query;
    
    const query = { tenancyId: req.user.tenancyId };
    if (status !== 'all') {
      query.status = status;
    }

    const requests = await InventoryRequest.find(query)
      .populate('requestedBy', 'name email')
      .populate('approvedBy', 'name email')
      .sort({ requestDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await InventoryRequest.countDocuments(query);

    res.json({
      success: true,
      data: {
        requests,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {
    console.error('Error fetching inventory requests:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory requests'
    });
  }
});

module.exports = router;