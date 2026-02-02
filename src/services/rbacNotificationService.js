const socketIOServer = require('./socketIOServer');
const NotificationService = require('./notificationService');

/**
 * RBAC Real-Time Notification Service
 * Handles real-time notifications for role and permission changes
 */
class RBACNotificationService {
  constructor() {
    this.io = null;
    this.init();
  }

  init() {
    try {
      // socketIOServer will be initialized by server.js
      this.io = socketIOServer;
      console.log('🔔 RBAC Notification Service configured');
    } catch (error) {
      console.error('❌ Failed to initialize RBAC Notification Service:', error);
    }
  }

  /**
   * Notify users about role changes
   * @param {Object} params - Notification parameters
   * @param {string} params.roleId - Role ID that was changed
   * @param {string} params.roleName - Role name
   * @param {Array} params.affectedUsers - Array of user IDs affected
   * @param {string} params.changeType - Type of change (created, updated, deleted, assigned, revoked)
   * @param {Object} params.changes - Specific changes made
   * @param {string} params.changedBy - ID of user who made the change
   */
  async notifyRoleChange({
    roleId,
    roleName,
    affectedUsers = [],
    changeType,
    changes = {},
    changedBy,
    tenantId = null
  }) {
    try {
      console.log('🔔 Sending role change notifications:', {
        roleId,
        roleName,
        changeType,
        affectedUsersCount: affectedUsers.length
      });

      // Prepare notification data
      const notificationData = {
        type: 'role_change',
        roleId,
        roleName,
        changeType,
        changes,
        changedBy,
        timestamp: new Date().toISOString(),
        tenantId
      };

      // Send notifications to affected users
      for (const userId of affectedUsers) {
        await this.sendRoleChangeNotification(userId, notificationData);
      }

      // Send notification to SuperAdmins (for audit)
      await this.notifySuperAdmins('role_change', notificationData);

      return { success: true, notifiedUsers: affectedUsers.length };
    } catch (error) {
      console.error('❌ Error sending role change notifications:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Notify users about permission changes
   * @param {Object} params - Notification parameters
   */
  async notifyPermissionChange({
    userId,
    userEmail,
    userName,
    permissionChanges = {},
    roleChanges = [],
    changeType,
    changedBy,
    tenantId = null,
    reason = null
  }) {
    try {
      console.log('🔔 Sending permission change notification:', {
        userId,
        userEmail,
        changeType,
        permissionCount: Object.keys(permissionChanges).length,
        roleCount: roleChanges.length
      });

      const notificationData = {
        type: 'permission_change',
        userId,
        userEmail,
        userName,
        permissionChanges,
        roleChanges,
        changeType,
        changedBy,
        reason,
        timestamp: new Date().toISOString(),
        tenantId
      };

      // Send real-time notification to the affected user
      await this.sendPermissionChangeNotification(userId, notificationData);

      // Create in-app notification
      await this.createInAppNotification(userId, notificationData);

      // Send audit notification to SuperAdmins
      await this.notifySuperAdmins('permission_change', notificationData);

      return { success: true };
    } catch (error) {
      console.error('❌ Error sending permission change notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send real-time role change notification to user
   */
  async sendRoleChangeNotification(userId, data) {
    try {
      if (!this.io) return;

      // Send Socket.IO notification
      await this.io.emitToUser(userId, 'rbac_role_change', {
        ...data,
        priority: this.getRoleChangePriority(data.changeType),
        message: this.getRoleChangeMessage(data)
      });

      // Also emit permissionsUpdated to trigger frontend refresh
      await this.io.emitToUser(userId, 'permissionsUpdated', {
        ...data,
        message: this.getRoleChangeMessage(data),
        type: 'role_change'
      });

      console.log(`✅ Role change notification sent to user ${userId}`);
    } catch (error) {
      console.error(`❌ Failed to send role change notification to user ${userId}:`, error);
    }
  }

  /**
   * Send real-time permission change notification to user
   */
  async sendPermissionChangeNotification(userId, data) {
    try {
      if (!this.io) return;

      // Send Socket.IO notification for real-time permission sync
      await this.io.emitToUser(userId, 'permission_sync', {
        type: 'permission_update',
        userId: data.userId,
        permissionChanges: data.permissionChanges,
        roleChanges: data.roleChanges,
        timestamp: data.timestamp,
        reason: data.reason,
        changedBy: data.changedBy
      });

      // Send user-friendly notification
      await this.io.emitToUser(userId, 'rbac_permission_change', {
        ...data,
        priority: this.getPermissionChangePriority(data.changeType),
        message: this.getPermissionChangeMessage(data)
      });

      // Standardize event for frontend useNotificationsWebSocket hook
      await this.io.emitToUser(userId, 'permissionsUpdated', {
        ...data,
        message: this.getPermissionChangeMessage(data)
      });

      // Also emit tenancy specific event if tenantId exists
      if (data.tenantId) {
        await this.io.emitToUser(userId, 'tenancyPermissionsUpdated', {
          ...data,
          message: this.getPermissionChangeMessage(data)
        });
      }

      console.log(`✅ Permission change notification sent to user ${userId}`);
    } catch (error) {
      console.error(`❌ Failed to send permission change notification to user ${userId}:`, error);
    }
  }

  /**
   * Create in-app notification for permission changes
   */
  async createInAppNotification(userId, data) {
    try {
      const notificationPayload = {
        userId,
        title: 'Permissions Updated',
        message: this.getPermissionChangeMessage(data),
        type: 'permission_change',
        priority: this.getPermissionChangePriority(data.changeType),
        metadata: {
          changeType: data.changeType,
          permissionCount: Object.keys(data.permissionChanges).length,
          roleCount: data.roleChanges.length,
          changedBy: data.changedBy,
          reason: data.reason
        },
        actionRequired: false,
        tenantId: data.tenantId
      };

      // Use existing notification service to create in-app notification
      if (NotificationService && NotificationService.createNotification) {
        await NotificationService.createNotification(notificationPayload);
      }

      console.log(`✅ In-app notification created for user ${userId}`);
    } catch (error) {
      console.error(`❌ Failed to create in-app notification for user ${userId}:`, error);
    }
  }

  /**
   * Notify SuperAdmins about RBAC changes (for audit)
   */
  async notifySuperAdmins(eventType, data) {
    try {
      if (!this.io) return;

      // Send to SuperAdmin audit channel
      await this.io.emitToTenantRole(data.tenantId || 'global', 'superadmin', 'rbac_audit', {
        eventType,
        data,
        timestamp: new Date().toISOString(),
        severity: this.getAuditSeverity(eventType, data.changeType)
      });

      console.log(`✅ RBAC audit notification sent to SuperAdmins: ${eventType}`);
    } catch (error) {
      console.error('❌ Failed to send audit notification to SuperAdmins:', error);
    }
  }

  /**
   * Notify about bulk permission changes
   */
  async notifyBulkPermissionChanges(changes) {
    try {
      console.log('🔔 Sending bulk permission change notifications:', {
        affectedUsers: changes.length
      });

      const results = [];

      for (const change of changes) {
        const result = await this.notifyPermissionChange(change);
        results.push({ userId: change.userId, result });
      }

      // Send bulk audit notification
      await this.notifySuperAdmins('bulk_permission_change', {
        changeCount: changes.length,
        affectedUsers: changes.map(c => c.userId),
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        totalChanges: changes.length,
        results
      };
    } catch (error) {
      console.error('❌ Error sending bulk permission change notifications:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Force user session refresh (for security updates)
   */
  async forceUserSessionRefresh(userId, reason = 'Security update') {
    try {
      if (!this.io) return;

      await this.io.emitToUser(userId, 'force_session_refresh', {
        reason,
        timestamp: new Date().toISOString(),
        action: 'refresh_required'
      });

      console.log(`✅ Force session refresh sent to user ${userId}: ${reason}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ Failed to force session refresh for user ${userId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Revoke user session (for security violations)
   */
  async revokeUserSession(userId, reason = 'Security violation') {
    try {
      if (!this.io) return;

      await this.io.emitToUser(userId, 'session_revoked', {
        reason,
        timestamp: new Date().toISOString(),
        action: 'logout_required'
      });

      console.log(`✅ Session revocation sent to user ${userId}: ${reason}`);
      return { success: true };
    } catch (error) {
      console.error(`❌ Failed to revoke session for user ${userId}:`, error);
      return { success: false, error: error.message };
    }
  }

  // Helper methods for message generation and priority
  getRoleChangeMessage(data) {
    const { changeType, roleName, userName } = data;

    switch (changeType) {
      case 'assigned':
        return `You have been assigned the "${roleName}" role`;
      case 'revoked':
        return `The "${roleName}" role has been removed from your account`;
      case 'updated':
        return `Your "${roleName}" role permissions have been updated`;
      case 'created':
        return `New role "${roleName}" has been created`;
      case 'deleted':
        return `Role "${roleName}" has been deleted`;
      default:
        return `Role "${roleName}" has been ${changeType}`;
    }
  }

  getPermissionChangeMessage(data) {
    const { changeType, permissionChanges, roleChanges } = data;
    const permissionCount = Object.keys(permissionChanges).length;
    const roleCount = roleChanges.length;

    if (roleCount > 0 && permissionCount > 0) {
      return `Your roles and permissions have been updated (${roleCount} roles, ${permissionCount} permissions)`;
    } else if (roleCount > 0) {
      return `Your roles have been updated (${roleCount} role${roleCount > 1 ? 's' : ''})`;
    } else if (permissionCount > 0) {
      return `Your permissions have been updated (${permissionCount} permission${permissionCount > 1 ? 's' : ''})`;
    } else {
      return 'Your access permissions have been updated';
    }
  }

  getRoleChangePriority(changeType) {
    switch (changeType) {
      case 'assigned':
      case 'revoked':
        return 'P1'; // High priority - affects user access
      case 'updated':
        return 'P2'; // Medium priority - permission changes
      case 'created':
      case 'deleted':
        return 'P3'; // Low priority - informational
      default:
        return 'P2';
    }
  }

  getPermissionChangePriority(changeType) {
    switch (changeType) {
      case 'revoked':
      case 'restricted':
        return 'P1'; // High priority - access removed
      case 'granted':
      case 'updated':
        return 'P2'; // Medium priority - access changed
      case 'bulk_update':
        return 'P2'; // Medium priority
      default:
        return 'P2';
    }
  }

  getAuditSeverity(eventType, changeType) {
    if (eventType === 'permission_change' && changeType === 'revoked') {
      return 'high';
    }
    if (eventType === 'role_change' && ['assigned', 'revoked'].includes(changeType)) {
      return 'medium';
    }
    return 'low';
  }
}

// Export singleton instance
const rbacNotificationService = new RBACNotificationService();
module.exports = rbacNotificationService;