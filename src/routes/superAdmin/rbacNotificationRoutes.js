const express = require('express');
const router = express.Router();
const { requireSuperAdminPermission } = require('../../middlewares/rbacMiddleware');
const {
  testRBACNotification,
  bulkNotifyPermissionChanges,
  forceUserSessionRefresh,
  revokeUserSession,
  getRBACNotificationStats,
  notifyRoleAssignment
} = require('../../controllers/superAdmin/rbacNotificationController');

/**
 * RBAC Notification Routes
 * All routes require SuperAdmin authentication and appropriate permissions
 */

// Test RBAC notification system
router.post('/test-notification', 
  requireSuperAdminPermission('superadmins', 'update'),
  testRBACNotification
);

// Send bulk permission update notifications
router.post('/bulk-notify', 
  requireSuperAdminPermission('superadmins', 'update'),
  bulkNotifyPermissionChanges
);

// Force user session refresh
router.post('/force-refresh', 
  requireSuperAdminPermission('superadmins', 'update'),
  forceUserSessionRefresh
);

// Revoke user session (security action)
router.post('/revoke-session', 
  requireSuperAdminPermission('superadmins', 'delete'),
  revokeUserSession
);

// Get RBAC notification statistics
router.get('/notification-stats', 
  requireSuperAdminPermission('superadmins', 'view'),
  getRBACNotificationStats
);

// Send role assignment notification
router.post('/notify-role-assignment', 
  requireSuperAdminPermission('roles', 'update'),
  notifyRoleAssignment
);

module.exports = router;