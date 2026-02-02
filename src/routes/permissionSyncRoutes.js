/**
 * Permission Sync API Routes
 * Endpoints for testing and managing real-time permission synchronization
 */

const express = require('express');
const router = express.Router();
const permissionSyncService = require('../services/permissionSyncService');
const { protect, protectSuperAdmin } = require('../middlewares/auth');

/**
 * Test permission sync notification
 * POST /api/permission-sync/test
 */
router.post('/test', protect, async (req, res) => {
  try {
    const { userId, permissions, features, role } = req.body;
    
    const targetUserId = userId || req.user.id;
    
    const result = await permissionSyncService.notifyPermissionUpdate(targetUserId, {
      permissions: permissions || { test: { view: true, create: true } },
      features: features || { testFeature: true },
      role: role || req.user.role
    });

    res.json({
      success: true,
      message: 'Test permission sync notification sent',
      result
    });

  } catch (error) {
    console.error('❌ Error sending test permission sync:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Force token refresh for user
 * POST /api/permission-sync/force-refresh
 */
router.post('/force-refresh', protectSuperAdmin, async (req, res) => {
  try {
    const { userId, reason } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const result = await permissionSyncService.forceTokenRefresh(userId, reason);

    res.json({
      success: true,
      message: 'Token refresh forced',
      result
    });

  } catch (error) {
    console.error('❌ Error forcing token refresh:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Revoke user session (security)
 * POST /api/permission-sync/revoke-session
 */
router.post('/revoke-session', protectSuperAdmin, async (req, res) => {
  try {
    const { userId, reason } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const result = await permissionSyncService.revokeUserSession(userId, reason);

    res.json({
      success: true,
      message: 'User session revoked',
      result
    });

  } catch (error) {
    console.error('❌ Error revoking user session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Bulk permission sync
 * POST /api/permission-sync/bulk
 */
router.post('/bulk', protectSuperAdmin, async (req, res) => {
  try {
    const { userUpdates } = req.body;
    
    if (!Array.isArray(userUpdates)) {
      return res.status(400).json({
        success: false,
        error: 'userUpdates must be an array'
      });
    }

    const results = await permissionSyncService.notifyBulkPermissionUpdate(userUpdates);

    res.json({
      success: true,
      message: 'Bulk permission sync completed',
      results
    });

  } catch (error) {
    console.error('❌ Error in bulk permission sync:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get permission sync statistics
 * GET /api/permission-sync/stats
 */
router.get('/stats', protectSuperAdmin, async (req, res) => {
  try {
    const stats = await permissionSyncService.getStatistics();
    
    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('❌ Error getting permission sync stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;