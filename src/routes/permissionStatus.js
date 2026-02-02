const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');

/**
 * Check if user permissions have been updated since last check
 * GET /api/auth/permission-status?since=timestamp
 */
router.get('/permission-status', auth, async (req, res) => {
  try {
    const { since } = req.query;
    const userId = req.user.id;

    // Get current user data
    const user = await User.findById(userId)
      .populate('tenancy')
      .select('permissions features role updatedAt tenancy');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user data was updated since the provided timestamp
    const sinceDate = since ? new Date(since) : new Date(0);
    const hasUpdates = user.updatedAt > sinceDate;

    // Also check tenancy updates if user has a tenancy
    let tenancyUpdated = false;
    if (user.tenancy && user.tenancy.updatedAt) {
      tenancyUpdated = user.tenancy.updatedAt > sinceDate;
    }

    res.json({
      success: true,
      data: {
        hasUpdates: hasUpdates || tenancyUpdated,
        lastUpdated: user.updatedAt,
        tenancyLastUpdated: user.tenancy?.updatedAt,
        currentPermissions: user.permissions,
        currentFeatures: user.features,
        currentRole: user.role
      }
    });

  } catch (error) {
    console.error('Permission status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check permission status'
    });
  }
});

module.exports = router;