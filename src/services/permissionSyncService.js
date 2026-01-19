/**
 * Permission Sync Service
 * Handles real-time permission updates via WebSocket (when available)
 */

// Check if running on Vercel (serverless)
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;

// Import socket service only if not on Vercel
let socketService;
if (!isVercel) {
  socketService = require('./socketService');
}

const jwt = require('jsonwebtoken');

class PermissionSyncService {
  /**
   * Notify user that their permissions have been updated
   * @param {String} userId - User ID whose permissions changed
   * @param {Object} updates - What changed
   */
  static async notifyPermissionUpdate(userId, updates = {}) {
    try {
      console.log(`🔄 Notifying user ${userId} of permission changes`);
      console.log(`📦 Updates:`, JSON.stringify(updates, null, 2));

      // Send WebSocket event if available (non-serverless)
      if (socketService && !isVercel) {
        const sent = socketService.sendEventToUser(userId.toString(), 'permissionsUpdated', {
          message: 'Your permissions have been updated',
          updates: {
            role: updates.role,
            permissions: updates.permissions,
            features: updates.features,
            timestamp: new Date()
          }
        });
        
        console.log(`📤 WebSocket event sent: ${sent ? 'YES' : 'NO (user not connected)'}`);
      } else {
        console.log(`📧 Serverless mode: Permission update notification will be available on next page load`);
      }

      // Always send a notification (works in both environments)
      const NotificationService = require('./notificationService');
      await NotificationService.notifyPermissionGranted(userId, {
        module: updates.module || 'system',
        action: updates.action || 'updated'
      }, updates.tenancy);
      
      console.log(`✅ Permission notification sent to user ${userId}`);

      return true;
    } catch (error) {
      console.error('Error notifying permission update:', error);
      return false;
    }
  }

  /**
   * Notify user of role change
   */
  static async notifyRoleChange(userId, oldRole, newRole, tenancy) {
    try {
      console.log(`🔄 Notifying user ${userId} of role change: ${oldRole} → ${newRole}`);

      socketService.sendEventToUser(userId.toString(), 'roleChanged', {
        message: `Your role has been changed from ${oldRole} to ${newRole}`,
        oldRole,
        newRole,
        timestamp: new Date()
      });

      const NotificationService = require('./notificationService');
      await NotificationService.notifyRoleUpdated(userId, oldRole, newRole, tenancy);

      return true;
    } catch (error) {
      console.error('Error notifying role change:', error);
      return false;
    }
  }

  /**
   * Notify user of account suspension
   */
  static async notifyAccountSuspended(userId, reason, tenancy) {
    try {
      console.log(`🚫 Notifying user ${userId} of account suspension`);

      socketService.sendEventToUser(userId.toString(), 'accountSuspended', {
        message: 'Your account has been suspended',
        reason,
        timestamp: new Date()
      });

      const NotificationService = require('./notificationService');
      await NotificationService.createNotification({
        recipientId: userId,
        recipientType: 'admin',
        tenancy,
        type: 'system_alert',
        title: '🚫 Account Suspended',
        message: reason || 'Your account has been suspended. Please contact support.',
        severity: 'error',
        icon: 'alert-circle',
        data: { link: '/support' }
      });

      return true;
    } catch (error) {
      console.error('Error notifying account suspension:', error);
      return false;
    }
  }

  /**
   * Notify user of account activation
   */
  static async notifyAccountActivated(userId, tenancy) {
    try {
      console.log(`✅ Notifying user ${userId} of account activation`);

      socketService.sendEventToUser(userId.toString(), 'accountActivated', {
        message: 'Your account has been activated',
        timestamp: new Date()
      });

      const NotificationService = require('./notificationService');
      await NotificationService.createNotification({
        recipientId: userId,
        recipientType: 'admin',
        tenancy,
        type: 'system_alert',
        title: '✅ Account Activated',
        message: 'Your account has been activated. Welcome back!',
        severity: 'success',
        icon: 'check-circle',
        data: { link: '/dashboard' }
      });

      return true;
    } catch (error) {
      console.error('Error notifying account activation:', error);
      return false;
    }
  }

  /**
   * Notify user of subscription/plan change
   */
  static async notifyPlanChange(userId, oldPlan, newPlan, tenancy) {
    try {
      console.log(`📦 Notifying user ${userId} of plan change: ${oldPlan} → ${newPlan}`);

      socketService.sendEventToUser(userId.toString(), 'planChanged', {
        message: `Your subscription plan has been updated to ${newPlan}`,
        oldPlan,
        newPlan,
        timestamp: new Date()
      });

      const NotificationService = require('./notificationService');
      await NotificationService.notifyPlanUpgraded(userId, oldPlan, newPlan, tenancy);

      return true;
    } catch (error) {
      console.error('Error notifying plan change:', error);
      return false;
    }
  }

  /**
   * Generate new JWT token with updated permissions
   * @param {Object} user - User object with updated permissions
   */
  static generateUpdatedToken(user) {
    try {
      const payload = {
        id: user._id,
        email: user.email,
        role: user.role,
        tenancy: user.tenancy,
        permissions: user.permissions || [],
        features: user.features || []
      };

      const token = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: '7d'
      });

      return token;
    } catch (error) {
      console.error('Error generating updated token:', error);
      return null;
    }
  }

  /**
   * Broadcast permission update to all admins of a tenancy
   */
  static async notifyTenancyAdmins(tenancyId, message) {
    try {
      socketService.sendToTenancyRecipients(tenancyId, 'admin', {
        type: 'tenancyUpdate',
        message,
        timestamp: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error notifying tenancy admins:', error);
      return false;
    }
  }

  /**
   * Force logout user (for security reasons)
   */
  static async forceLogout(userId, reason) {
    try {
      console.log(`🚪 Forcing logout for user ${userId}: ${reason}`);

      socketService.sendEventToUser(userId.toString(), 'forceLogout', {
        message: reason || 'You have been logged out',
        reason,
        timestamp: new Date()
      });

      return true;
    } catch (error) {
      console.error('Error forcing logout:', error);
      return false;
    }
  }
}

module.exports = PermissionSyncService;
