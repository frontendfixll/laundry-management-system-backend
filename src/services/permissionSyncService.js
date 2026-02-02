/**
 * Permission Sync Service
 * Handles real-time permission updates via Socket.IO
 */

const socketIOServer = require('./socketIOServer');
const { NotificationAuditLogger } = require('./notifications/NotificationAuditLogger');
const User = require('../models/User');
const Tenancy = require('../models/Tenancy');
const { USER_ROLES } = require('../config/constants');

class PermissionSyncService {
  constructor() {
    this.auditLogger = new NotificationAuditLogger();
  }

  /**
   * Sync all admin users in a tenancy
   */
  async syncTenancyPermissions(tenancyId) {
    try {
      const tenancy = await Tenancy.findById(tenancyId);
      if (!tenancy) throw new Error('Tenancy not found');

      const users = await User.find({
        tenancy: tenancyId,
        role: { $in: [USER_ROLES.ADMIN, USER_ROLES.BRANCH_ADMIN] }
      });

      const updates = [];
      for (const user of users) {
        const result = await this.syncUserPermissions(user._id, { tenancy, user });
        if (result.success) updates.push(user._id);
      }

      return { success: true, updatedUsers: updates };
    } catch (error) {
      console.error('❌ Tenancy permission sync failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync a single user's permissions based on tenancy features
   */
  async syncUserPermissions(userId, context = {}) {
    try {
      let { user, tenancy } = context;

      if (!user) user = await User.findById(userId);
      if (!user) throw new Error('User not found');

      if (!tenancy) tenancy = await Tenancy.findById(user.tenancy);
      if (!tenancy) throw new Error('Tenancy not found');

      // Only sync admins and branch admins
      if (user.role !== USER_ROLES.ADMIN && user.role !== USER_ROLES.BRANCH_ADMIN) {
        return { success: true, skipped: true, reason: 'Not an admin role' };
      }

      const permissionsMap = this.getMappedPermissions(tenancy, user.role);

      // Update user document
      user.permissions = permissionsMap;
      await user.save({ validateBeforeSave: false });

      // Notify user in real-time
      await this.notifyPermissionUpdate(user._id, {
        permissions: permissionsMap,
        features: tenancy.subscription?.features || {},
        role: user.role
      });

      return { success: true };
    } catch (error) {
      console.error(`❌ User permission sync failed for ${userId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Map internal features to RBAC permissions
   */
  getMappedPermissions(tenancy, role) {
    // Start with default role permissions
    const basePermissions = role === USER_ROLES.ADMIN
      ? User.getDefaultAdminPermissions()
      : User.getDefaultBranchAdminPermissions();

    // Feature-to-Permission Mapping
    const mapping = [
      { feature: 'branch_management', module: 'branches' },
      { feature: 'branch_admin_rbac', module: 'branchAdmins' },
      { feature: 'staff_management', module: 'staff' },
      { feature: 'inventory_management', module: 'inventory' },
      { feature: 'service_management', module: 'services' },
      { feature: 'logistics_management', module: 'logistics' },
      { feature: 'payment_management', module: 'payments_earnings' },
      { feature: 'payment_management', module: 'refund_requests' },
      { feature: 'customer_management', module: 'customers' },
      { feature: 'campaigns', module: 'campaigns' },
      { feature: 'coupons', module: 'coupons' },
      { feature: 'banners', module: 'banners' },
      { feature: 'wallet', module: 'wallet' },
      { feature: 'referral_program', module: 'referrals' },
      { feature: 'loyalty_points', module: 'loyalty' },
      { feature: 'advanced_analytics', module: 'analytics' }
    ];

    const finalPermissions = { ...basePermissions };

    // Enforce feature gating
    mapping.forEach(({ feature, module }) => {
      const isEnabled = tenancy.hasFeature(feature);

      // If feature is disabled, strip all permissions for that module
      if (!isEnabled && finalPermissions[module]) {
        Object.keys(finalPermissions[module]).forEach(action => {
          finalPermissions[module][action] = false;
        });
      }
      // If feature is enabled, basePermissions already have the correct defaults for the role
    });

    return finalPermissions;
  }

  /**
   * Notify user of permission changes in real-time
   */
  async notifyPermissionUpdate(userId, updates) {
    try {
      console.log('🔄 Notifying permission update for user:', userId);

      // Send real-time permission sync event
      const syncPayload = {
        type: 'permission_sync',
        data: {
          permissions: updates.permissions,
          features: updates.features,
          role: updates.role,
          syncedAt: new Date(),
          requiresRefresh: true
        }
      };

      // Emit to specific user
      const emitted = await socketIOServer.emitToUser(userId, 'permission_sync', syncPayload);

      // Log the sync event
      await this.auditLogger.log({
        action: 'permission_sync_sent',
        userId,
        metadata: {
          emitted,
          updates,
          timestamp: new Date()
        }
      });

      console.log('✅ Permission sync notification sent:', { userId, emitted });
      return { success: true, emitted };

    } catch (error) {
      console.error('❌ Failed to notify permission update:', error);

      await this.auditLogger.log({
        action: 'permission_sync_failed',
        userId,
        error: error.message,
        metadata: { updates }
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Notify multiple users of permission changes
   */
  async notifyBulkPermissionUpdate(userUpdates) {
    const results = [];

    for (const { userId, updates } of userUpdates) {
      const result = await this.notifyPermissionUpdate(userId, updates);
      results.push({ userId, ...result });
    }

    return results;
  }

  /**
   * Force token refresh for a user
   */
  async forceTokenRefresh(userId, reason = 'permission_update') {
    try {
      const refreshPayload = {
        type: 'force_token_refresh',
        reason,
        timestamp: new Date()
      };

      const emitted = await socketIOServer.emitToUser(userId, 'force_token_refresh', refreshPayload);

      await this.auditLogger.log({
        action: 'force_token_refresh',
        userId,
        metadata: { reason, emitted }
      });

      return { success: true, emitted };

    } catch (error) {
      console.error('❌ Failed to force token refresh:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Revoke user session immediately (for security)
   */
  async revokeUserSession(userId, reason = 'permission_revoked') {
    try {
      const revokePayload = {
        type: 'session_revoked',
        reason,
        message: 'Your session has been revoked. Please log in again.',
        timestamp: new Date()
      };

      const emitted = await socketIOServer.emitToUser(userId, 'session_revoked', revokePayload);

      await this.auditLogger.log({
        action: 'session_revoked',
        userId,
        metadata: { reason, emitted }
      });

      console.log('🚨 User session revoked:', { userId, reason, emitted });
      return { success: true, emitted };

    } catch (error) {
      console.error('❌ Failed to revoke user session:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get permission sync statistics
   */
  async getStatistics() {
    // This would query audit logs for permission sync metrics
    return {
      totalSyncs: 0, // Would be calculated from audit logs
      successfulSyncs: 0,
      failedSyncs: 0,
      lastSyncAt: null
    };
  }
}

// Export singleton instance
const permissionSyncService = new PermissionSyncService();
module.exports = permissionSyncService;