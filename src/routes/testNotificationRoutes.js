const express = require('express');
const router = express.Router();
const NotificationService = require('../services/notificationService');
const PermissionSyncService = require('../services/permissionSyncService');
const User = require('../models/User');
const SuperAdmin = require('../models/SuperAdmin');
const { protect } = require('../middlewares/auth');

// Test endpoint to send permission granted notification
router.post('/test-permission-granted', protect, async (req, res) => {
  try {
    const { targetUserId, module = 'inventory', action = 'create' } = req.body;
    
    // Use current user if no target specified
    const userId = targetUserId || req.user._id;
    const user = await User.findById(userId).populate('tenancy');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Send permission granted notification
    await NotificationService.notifyPermissionGranted(
      userId,
      { module, action },
      user.tenancy?._id
    );

    // Also send permission sync notification (triggers WebSocket + refresh prompt)
    await PermissionSyncService.notifyPermissionUpdate(userId, {
      role: user.role,
      permissions: { [module]: { [action]: true } },
      features: [module],
      tenancy: user.tenancy?._id,
      recipientType: user.role === 'admin' ? 'admin' : 'branch_admin',
      module,
      action
    });

    res.json({
      success: true,
      message: `Permission granted notification sent to ${user.name}`,
      data: {
        userId,
        userName: user.name,
        permission: `${module}.${action}`,
        tenancy: user.tenancy?.name
      }
    });

  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Test endpoint to send permission revoked notification
router.post('/test-permission-revoked', protect, async (req, res) => {
  try {
    const { targetUserId, module = 'customers', action = 'delete' } = req.body;
    
    const userId = targetUserId || req.user._id;
    const user = await User.findById(userId).populate('tenancy');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Send permission revoked notification
    await NotificationService.notifyPermissionRevoked(
      userId,
      { module, action },
      user.tenancy?._id
    );

    // Send permission sync notification
    await PermissionSyncService.notifyPermissionUpdate(userId, {
      role: user.role,
      permissions: { [module]: { [action]: false } },
      tenancy: user.tenancy?._id,
      recipientType: user.role === 'admin' ? 'admin' : 'branch_admin',
      module,
      action
    });

    res.json({
      success: true,
      message: `Permission revoked notification sent to ${user.name}`,
      data: {
        userId,
        userName: user.name,
        permission: `${module}.${action}`,
        tenancy: user.tenancy?.name
      }
    });

  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Test endpoint to send security alert
router.post('/test-security-alert', protect, async (req, res) => {
  try {
    const { targetUserId, alertType = 'Multiple login attempts', details = 'Suspicious activity detected' } = req.body;
    
    const userId = targetUserId || req.user._id;
    const user = await User.findById(userId).populate('tenancy');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Send security alert notification
    await NotificationService.notifySecurityAlert(
      userId,
      alertType,
      details,
      user.tenancy?._id
    );

    res.json({
      success: true,
      message: `Security alert sent to ${user.name}`,
      data: {
        userId,
        userName: user.name,
        alertType,
        details
      }
    });

  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Test endpoint to send inventory request notification (to SuperAdmins)
router.post('/test-inventory-request', protect, async (req, res) => {
  try {
    const { itemName = 'Test Detergent', urgency = 'high' } = req.body;
    
    const user = await User.findById(req.user._id).populate('tenancy');
    const superAdmins = await SuperAdmin.find({ isActive: true });
    
    if (superAdmins.length === 0) {
      return res.status(404).json({ success: false, message: 'No active SuperAdmins found' });
    }

    // Send notification to all SuperAdmins
    const notifications = await Promise.all(
      superAdmins.map(sa => 
        NotificationService.notifyInventoryRequestSubmitted(
          sa._id,
          {
            _id: 'test-request-' + Date.now(),
            itemName,
            urgency
          },
          { businessName: user.tenancy?.name || 'Test Business' }
        )
      )
    );

    res.json({
      success: true,
      message: `Inventory request notification sent to ${superAdmins.length} SuperAdmin(s)`,
      data: {
        itemName,
        urgency,
        tenancy: user.tenancy?.name,
        notificationsSent: superAdmins.length
      }
    });

  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get current user info for testing
router.get('/test-user-info', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('tenancy');
    
    res.json({
      success: true,
      data: {
        userId: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenancy: user.tenancy?.name,
        permissions: user.permissions
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;