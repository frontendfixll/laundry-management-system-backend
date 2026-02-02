const rbacNotificationService = require('../../services/rbacNotificationService');
const SuperAdmin = require('../../models/SuperAdmin');
const SuperAdminRole = require('../../models/SuperAdminRole');

/**
 * RBAC Notification Controller
 * Handles API endpoints for RBAC real-time notifications
 */

/**
 * Test RBAC notification system
 * @route POST /api/superadmin/rbac/test-notification
 */
const testRBACNotification = async (req, res) => {
  try {
    const { userId, notificationType = 'permission_change' } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Find user
    const user = await SuperAdmin.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let result;

    if (notificationType === 'permission_change') {
      // Test permission change notification
      result = await rbacNotificationService.notifyPermissionChange({
        userId: user._id,
        userEmail: user.email,
        userName: user.name,
        permissionChanges: {
          'tenancies': { view: true, create: false },
          'superadmins': { view: true, create: true }
        },
        roleChanges: ['Platform Support'],
        changeType: 'updated',
        changedBy: req.user._id,
        reason: 'Test notification from API'
      });
    } else if (notificationType === 'role_change') {
      // Test role change notification
      result = await rbacNotificationService.notifyRoleChange({
        roleId: 'test_role_id',
        roleName: 'Test Role',
        affectedUsers: [userId],
        changeType: 'assigned',
        changes: { permissions: ['test.view', 'test.create'] },
        changedBy: req.user._id
      });
    }

    res.json({
      success: true,
      message: 'Test notification sent successfully',
      data: {
        userId,
        notificationType,
        result
      }
    });

  } catch (error) {
    console.error('❌ Error testing RBAC notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
      error: error.message
    });
  }
};

/**
 * Send bulk permission update notifications
 * @route POST /api/superadmin/rbac/bulk-notify
 */
const bulkNotifyPermissionChanges = async (req, res) => {
  try {
    const { changes } = req.body;

    if (!changes || !Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Changes array is required'
      });
    }

    // Validate each change object
    for (const change of changes) {
      if (!change.userId) {
        return res.status(400).json({
          success: false,
          message: 'Each change must include userId'
        });
      }
    }

    // Add changedBy to each change
    const changesWithMetadata = changes.map(change => ({
      ...change,
      changedBy: req.user._id,
      timestamp: new Date().toISOString()
    }));

    const result = await rbacNotificationService.notifyBulkPermissionChanges(changesWithMetadata);

    res.json({
      success: true,
      message: 'Bulk permission notifications sent successfully',
      data: result
    });

  } catch (error) {
    console.error('❌ Error sending bulk RBAC notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send bulk notifications',
      error: error.message
    });
  }
};

/**
 * Force user session refresh
 * @route POST /api/superadmin/rbac/force-refresh
 */
const forceUserSessionRefresh = async (req, res) => {
  try {
    const { userId, reason = 'Administrative action' } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Verify user exists
    const user = await SuperAdmin.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const result = await rbacNotificationService.forceUserSessionRefresh(userId, reason);

    res.json({
      success: true,
      message: 'Session refresh notification sent successfully',
      data: {
        userId,
        reason,
        result
      }
    });

  } catch (error) {
    console.error('❌ Error forcing session refresh:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to force session refresh',
      error: error.message
    });
  }
};

/**
 * Revoke user session
 * @route POST /api/superadmin/rbac/revoke-session
 */
const revokeUserSession = async (req, res) => {
  try {
    const { userId, reason = 'Security violation' } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Verify user exists
    const user = await SuperAdmin.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const result = await rbacNotificationService.revokeUserSession(userId, reason);

    // Also deactivate user for security
    await SuperAdmin.findByIdAndUpdate(userId, { 
      isActive: false,
      lastDeactivatedAt: new Date(),
      deactivatedBy: req.user._id,
      deactivationReason: reason
    });

    res.json({
      success: true,
      message: 'User session revoked and account deactivated',
      data: {
        userId,
        reason,
        result
      }
    });

  } catch (error) {
    console.error('❌ Error revoking user session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke user session',
      error: error.message
    });
  }
};

/**
 * Get RBAC notification statistics
 * @route GET /api/superadmin/rbac/notification-stats
 */
const getRBACNotificationStats = async (req, res) => {
  try {
    // This would typically come from a monitoring service or database
    // For now, return mock stats
    const stats = {
      totalNotificationsSent: 0,
      permissionChangeNotifications: 0,
      roleChangeNotifications: 0,
      sessionRefreshNotifications: 0,
      sessionRevocationNotifications: 0,
      activeConnections: 0,
      lastNotificationSent: null,
      systemHealth: 'healthy'
    };

    res.json({
      success: true,
      message: 'RBAC notification statistics retrieved successfully',
      data: stats
    });

  } catch (error) {
    console.error('❌ Error getting RBAC notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get notification statistics',
      error: error.message
    });
  }
};

/**
 * Send role assignment notification
 * @route POST /api/superadmin/rbac/notify-role-assignment
 */
const notifyRoleAssignment = async (req, res) => {
  try {
    const { userId, roleId, action = 'assigned' } = req.body;

    if (!userId || !roleId) {
      return res.status(400).json({
        success: false,
        message: 'User ID and Role ID are required'
      });
    }

    // Get user and role details
    const [user, role] = await Promise.all([
      SuperAdmin.findById(userId),
      SuperAdminRole.findById(roleId)
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!role) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Send role change notification
    const result = await rbacNotificationService.notifyRoleChange({
      roleId: role._id,
      roleName: role.name,
      affectedUsers: [userId],
      changeType: action,
      changes: {
        permissions: role.permissions || {},
        description: role.description
      },
      changedBy: req.user._id
    });

    // Also send permission change notification for immediate UI update
    await rbacNotificationService.notifyPermissionChange({
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      permissionChanges: role.permissions || {},
      roleChanges: [role.name],
      changeType: action,
      changedBy: req.user._id,
      reason: `Role ${action}: ${role.name}`
    });

    res.json({
      success: true,
      message: 'Role assignment notification sent successfully',
      data: {
        userId,
        roleId,
        roleName: role.name,
        action,
        result
      }
    });

  } catch (error) {
    console.error('❌ Error sending role assignment notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send role assignment notification',
      error: error.message
    });
  }
};

module.exports = {
  testRBACNotification,
  bulkNotifyPermissionChanges,
  forceUserSessionRefresh,
  revokeUserSession,
  getRBACNotificationStats,
  notifyRoleAssignment
};