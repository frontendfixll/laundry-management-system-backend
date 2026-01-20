const express = require('express');
const { protect } = require('../middlewares/auth');
const User = require('../models/User');
const socketService = require('../services/socketService');

const router = express.Router();

// Refresh user permissions (for testing and manual updates)
router.post('/refresh-permissions', protect, async (req, res) => {
  try {
    console.log('🔄 Refreshing permissions for user:', req.user.email);
    
    // Get fresh user data from database
    const freshUser = await User.findById(req.user._id)
      .select('-password')
      .populate('tenancy', 'name subdomain subscription')
      .populate('roleId', 'name slug permissions isActive color');
    
    if (!freshUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Emit socket event to update permissions in real-time
    if (socketService && socketService.emitToUser) {
      socketService.emitToUser(req.user._id, 'permissionsUpdated', {
        permissions: freshUser.permissions,
        role: freshUser.role,
        message: 'Your permissions have been updated'
      });
      
      console.log('✅ Permission update event emitted to user');
    }
    
    res.json({
      success: true,
      message: 'Permissions refreshed successfully',
      data: {
        permissions: freshUser.permissions,
        role: freshUser.role
      }
    });
    
  } catch (error) {
    console.error('❌ Error refreshing permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh permissions'
    });
  }
});

module.exports = router;