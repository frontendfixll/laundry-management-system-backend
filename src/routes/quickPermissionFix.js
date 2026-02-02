const express = require('express');
const router = express.Router();
const User = require('../models/User');

/**
 * Quick permission fix endpoint - can be called directly
 * @route POST /api/quick-permission-fix
 * @desc Grant basic permissions to a user by email
 */
router.post('/quick-permission-fix', async (req, res) => {
  try {
    const { userEmail, secretKey } = req.body;
    
    // Simple security check
    if (secretKey !== 'fix-permissions-2024') {
      return res.status(403).json({
        success: false,
        message: 'Invalid secret key'
      });
    }
    
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        message: 'User email is required'
      });
    }
    
    // Find user
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Grant basic permissions
    const basicPermissions = {
      orders: {
        view: true,
        create: true,
        update: true,
        delete: false,
        assign: false,
        cancel: false,
        process: false
      },
      customers: {
        view: true,
        create: true,
        update: true,
        delete: false
      },
      inventory: {
        view: true,
        create: true,
        update: true,
        delete: false,
        restock: false,
        writeOff: false
      },
      services: {
        view: true,
        create: true,
        update: true,
        delete: false,
        toggle: false,
        updatePricing: false
      },
      staff: {
        view: false,
        create: false,
        update: false,
        delete: false,
        assignShift: false,
        manageAttendance: false
      },
      logistics: {
        view: false,
        create: false,
        update: false,
        delete: false,
        assign: false,
        track: false
      },
      tickets: {
        view: false,
        create: false,
        update: false,
        delete: false,
        assign: false,
        resolve: false,
        escalate: false
      },
      performance: {
        view: true,
        create: false,
        update: false,
        delete: false,
        export: false
      },
      analytics: {
        view: true
      },
      settings: {
        view: true,
        create: false,
        update: false,
        delete: false
      },
      coupons: {
        view: false,
        create: false,
        update: false,
        delete: false
      },
      branches: {
        view: true,
        create: false,
        update: false,
        delete: false
      },
      branchAdmins: {
        view: false,
        create: false,
        update: false,
        delete: false
      }
    };
    
    // Update user permissions
    user.permissions = basicPermissions;
    await user.save();
    
    console.log(`✅ Granted basic permissions to user: ${userEmail}`);
    
    // Send WebSocket notification if available
    try {
      const socketService = require('../services/socketService');
      if (socketService) {
        socketService.sendEventToUser(user._id.toString(), 'permissionsUpdated', {
          message: 'Your permissions have been updated',
          updates: {
            permissions: basicPermissions,
            timestamp: new Date()
          }
        });
        console.log(`📢 Sent permission update notification to ${userEmail}`);
      }
    } catch (socketError) {
      console.log('⚠️ WebSocket notification failed:', socketError.message);
    }
    
    res.json({
      success: true,
      message: `Basic permissions granted to ${userEmail}`,
      data: {
        user: {
          _id: user._id,
          email: user.email,
          role: user.role
        },
        permissions: basicPermissions
      }
    });
    
  } catch (error) {
    console.error('Quick permission fix error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fix permissions',
      error: error.message
    });
  }
});

/**
 * Revoke all permissions endpoint
 * @route POST /api/revoke-all-permissions
 * @desc Revoke all permissions from a user by email
 */
router.post('/revoke-all-permissions', async (req, res) => {
  try {
    const { userEmail, secretKey } = req.body;
    
    // Simple security check
    if (secretKey !== 'fix-permissions-2024') {
      return res.status(403).json({
        success: false,
        message: 'Invalid secret key'
      });
    }
    
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        message: 'User email is required'
      });
    }
    
    // Find user
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Create empty permissions (all false)
    const emptyPermissions = {
      orders: {
        view: false, create: false, update: false, delete: false,
        assign: false, cancel: false, process: false
      },
      customers: {
        view: false, create: false, update: false, delete: false
      },
      inventory: {
        view: false, create: false, update: false, delete: false,
        restock: false, writeOff: false
      },
      services: {
        view: false, create: false, update: false, delete: false,
        toggle: false, updatePricing: false
      },
      staff: {
        view: false, create: false, update: false, delete: false,
        assignShift: false, manageAttendance: false
      },
      logistics: {
        view: false, create: false, update: false, delete: false,
        assign: false, track: false
      },
      tickets: {
        view: false, create: false, update: false, delete: false,
        assign: false, resolve: false, escalate: false
      },
      performance: {
        view: false, create: false, update: false, delete: false, export: false
      },
      analytics: { view: false },
      settings: {
        view: false, create: false, update: false, delete: false
      },
      coupons: {
        view: false, create: false, update: false, delete: false
      },
      branches: {
        view: false, create: false, update: false, delete: false
      },
      branchAdmins: {
        view: false, create: false, update: false, delete: false
      }
    };
    
    // Update user permissions
    user.permissions = emptyPermissions;
    await user.save();
    
    console.log(`🚫 Revoked ALL permissions from user: ${userEmail}`);
    
    // Send WebSocket notification if available
    try {
      const socketService = require('../services/socketService');
      if (socketService) {
        socketService.sendEventToUser(user._id.toString(), 'permissionsUpdated', {
          message: 'Your permissions have been revoked by an administrator',
          updates: {
            permissions: emptyPermissions,
            timestamp: new Date()
          }
        });
        console.log(`📢 Sent permission revocation notification to ${userEmail}`);
      }
    } catch (socketError) {
      console.log('⚠️ WebSocket notification failed:', socketError.message);
    }
    
    res.json({
      success: true,
      message: `All permissions revoked from ${userEmail}`,
      data: {
        user: {
          _id: user._id,
          email: user.email,
          role: user.role
        },
        permissions: emptyPermissions
      }
    });
    
  } catch (error) {
    console.error('Permission revocation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke permissions',
      error: error.message
    });
  }
});

module.exports = router;