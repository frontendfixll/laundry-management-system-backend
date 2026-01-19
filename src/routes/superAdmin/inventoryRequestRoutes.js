const express = require('express');
const router = express.Router();
const InventoryRequest = require('../../models/InventoryRequest');
const { protect } = require('../../middlewares/auth');
const NotificationService = require('../../services/notificationService');

// @route   GET /api/superadmin/inventory-requests
// @desc    Get all inventory requests from all tenancies
// @access  Private (SuperAdmin)
router.get('/', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'all', urgency = 'all', tenancyId = 'all' } = req.query;
    
    // Build query
    const query = {};
    if (status !== 'all') {
      query.status = status;
    }
    if (urgency !== 'all') {
      query.urgency = urgency;
    }
    if (tenancyId !== 'all') {
      query.tenancyId = tenancyId;
    }

    const requests = await InventoryRequest.find(query)
      .populate('requestedBy', 'name email')
      .populate('tenancyId', 'businessName subdomain')
      .populate('approvedBy', 'name email')
      .sort({ requestDate: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await InventoryRequest.countDocuments(query);

    // Get summary stats
    const stats = await InventoryRequest.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statusCounts = {
      pending: 0,
      approved: 0,
      rejected: 0,
      completed: 0
    };

    stats.forEach(stat => {
      statusCounts[stat._id] = stat.count;
    });

    res.json({
      success: true,
      data: {
        requests,
        stats: statusCounts,
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

// @route   GET /api/superadmin/inventory-requests/:requestId
// @desc    Get single inventory request details
// @access  Private (SuperAdmin)
router.get('/:requestId', protect, async (req, res) => {
  try {
    const request = await InventoryRequest.findById(req.params.requestId)
      .populate('requestedBy', 'name email')
      .populate('tenancyId', 'businessName subdomain contactEmail')
      .populate('approvedBy', 'name email');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Inventory request not found'
      });
    }

    res.json({
      success: true,
      data: { request }
    });

  } catch (error) {
    console.error('Error fetching inventory request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory request'
    });
  }
});

// @route   PUT /api/superadmin/inventory-requests/:requestId/approve
// @desc    Approve inventory request
// @access  Private (SuperAdmin)
router.put('/:requestId/approve', protect, async (req, res) => {
  try {
    const { estimatedCost, supplier, expectedDelivery, adminNotes } = req.body;

    const request = await InventoryRequest.findById(req.params.requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Inventory request not found'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending requests can be approved'
      });
    }

    // Update request
    request.status = 'approved';
    request.approvedBy = req.user._id;
    request.approvedDate = new Date();
    request.estimatedCost = estimatedCost;
    request.supplier = supplier;
    request.expectedDelivery = expectedDelivery;
    request.adminNotes = adminNotes;

    await request.save();

    // Populate for response
    await request.populate('requestedBy', 'name email');
    await request.populate('tenancyId', 'businessName subdomain');
    await request.populate('approvedBy', 'name email');

    // Notify the admin who made the request
    try {
      const NotificationService = require('../../services/notificationService');
      await NotificationService.notifyInventoryRequestApproved(
        request.requestedBy._id, 
        request, 
        request.tenancyId._id
      );
      console.log(`📢 Notified admin about inventory request approval`);
    } catch (error) {
      console.error('Failed to send approval notification:', error);
    }

    res.json({
      success: true,
      message: 'Inventory request approved successfully',
      data: { request }
    });

  } catch (error) {
    console.error('Error approving inventory request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve inventory request'
    });
  }
});

// @route   PUT /api/superadmin/inventory-requests/:requestId/reject
// @desc    Reject inventory request
// @access  Private (SuperAdmin)
router.put('/:requestId/reject', protect, async (req, res) => {
  try {
    const { rejectionReason, adminNotes } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const request = await InventoryRequest.findById(req.params.requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Inventory request not found'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending requests can be rejected'
      });
    }

    // Update request
    request.status = 'rejected';
    request.approvedBy = req.user._id;
    request.approvedDate = new Date();
    request.rejectionReason = rejectionReason;
    request.adminNotes = adminNotes;

    await request.save();

    // Populate for response
    await request.populate('requestedBy', 'name email');
    await request.populate('tenancyId', 'businessName subdomain');
    await request.populate('approvedBy', 'name email');

    // Notify the admin who made the request
    try {
      const NotificationService = require('../../services/notificationService');
      await NotificationService.notifyInventoryRequestRejected(
        request.requestedBy._id, 
        request, 
        request.tenancyId._id
      );
      console.log(`📢 Notified admin about inventory request rejection`);
    } catch (error) {
      console.error('Failed to send rejection notification:', error);
    }

    res.json({
      success: true,
      message: 'Inventory request rejected',
      data: { request }
    });

  } catch (error) {
    console.error('Error rejecting inventory request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject inventory request'
    });
  }
});

// @route   PUT /api/superadmin/inventory-requests/:requestId/complete
// @desc    Mark inventory request as completed
// @access  Private (SuperAdmin)
router.put('/:requestId/complete', protect, async (req, res) => {
  try {
    const { adminNotes } = req.body;

    const request = await InventoryRequest.findById(req.params.requestId);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Inventory request not found'
      });
    }

    if (request.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Only approved requests can be marked as completed'
      });
    }

    // Update request
    request.status = 'completed';
    request.adminNotes = adminNotes || request.adminNotes;

    await request.save();

    // Populate for response
    await request.populate('requestedBy', 'name email');
    await request.populate('tenancyId', 'businessName subdomain');
    await request.populate('approvedBy', 'name email');

    // Notify the admin who made the request
    try {
      const NotificationService = require('../../services/notificationService');
      await NotificationService.notifyInventoryRequestCompleted(
        request.requestedBy._id, 
        request, 
        request.tenancyId._id
      );
      console.log(`📢 Notified admin about inventory request completion`);
    } catch (error) {
      console.error('Failed to send completion notification:', error);
    }

    res.json({
      success: true,
      message: 'Inventory request marked as completed',
      data: { request }
    });

  } catch (error) {
    console.error('Error completing inventory request:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete inventory request'
    });
  }
});

module.exports = router;