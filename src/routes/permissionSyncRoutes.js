const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const jwt = require('jsonwebtoken');

/**
 * @route GET /api/permissions/sync
 * @desc Get updated permissions and new JWT token
 * @access Private
 */
router.get('/sync', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const Tenancy = require('../models/Tenancy');
    
    // Fetch fresh user data from database with tenancy populated
    const user = await User.findById(req.user._id)
      .select('email name role tenancy permissions isActive')
      .populate('tenancy', 'name slug subdomain branding subscription')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is suspended',
        suspended: true
      });
    }

    // Extract features from tenancy subscription
    let features = {};
    if (user.tenancy && user.tenancy.subscription && user.tenancy.subscription.features) {
      features = user.tenancy.subscription.features;
    }

    console.log(`🔄 Permission sync for user ${user._id} (${user.email}):`, {
      permissions: Object.keys(user.permissions || {}),
      features: Object.keys(features),
      tenancyId: user.tenancy?._id,
      tenancyName: user.tenancy?.name
    });

    // Generate new JWT with updated permissions and features from tenancy
    const payload = {
      userId: user._id.toString(), // Match login token format
      email: user.email,
      role: user.role,
      type: 'access_token', // Add type field
      tenancyId: user.tenancy?._id, // Match login token format
      permissions: user.permissions || {},
      features: features,
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });

    res.json({
      success: true,
      message: 'Permissions synced successfully',
      data: {
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: user.permissions || {},
          features: features,
          tenancy: user.tenancy
        }
      }
    });
  } catch (error) {
    console.error('Permission sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync permissions'
    });
  }
});

/**
 * @route GET /api/permissions/check
 * @desc Check if permissions have changed
 * @access Private
 */
router.get('/check', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const Tenancy = require('../models/Tenancy');
    
    const user = await User.findById(req.user._id)
      .select('role tenancy permissions isActive updatedAt')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Fetch tenancy features
    let features = {};
    if (user.tenancy) {
      const tenancy = await Tenancy.findById(user.tenancy)
        .select('subscription.features')
        .lean();
      
      if (tenancy && tenancy.subscription && tenancy.subscription.features) {
        features = tenancy.subscription.features;
      }
    }

    // Compare current JWT permissions/features with database
    const hasChanged = 
      user.role !== req.user.role ||
      JSON.stringify(user.permissions) !== JSON.stringify(req.user.permissions) ||
      JSON.stringify(features) !== JSON.stringify(req.user.features);

    res.json({
      success: true,
      data: {
        hasChanged,
        isActive: user.isActive,
        currentRole: user.role,
        lastUpdated: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Permission check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check permissions'
    });
  }
});

module.exports = router;
