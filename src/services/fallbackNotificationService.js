/**
 * Fallback Notification Service for Serverless Environments
 * Provides notification functionality without WebSocket dependency
 */

const Notification = require('../models/Notification');

class FallbackNotificationService {
  /**
   * Create notification without WebSocket (for Vercel serverless)
   */
  static async createNotification({
    recipientId,
    recipientModel = 'User',
    recipientType,
    tenancy,
    type,
    title,
    message,
    icon = 'bell',
    severity = 'info',
    data = {},
    channels = { inApp: true }
  }) {
    try {
      const notification = await Notification.createNotification({
        recipient: recipientId,
        recipientModel,
        recipientType,
        tenancy,
        type,
        title,
        message,
        icon,
        severity,
        data,
        channels
      });

      console.log(`📧 Fallback notification created: ${title} for user ${recipientId}`);
      
      // In serverless environment, we can't use WebSocket
      // Notifications will be fetched via polling or on page refresh
      
      return notification;
    } catch (error) {
      console.error('Error creating fallback notification:', error);
      throw error;
    }
  }

  /**
   * Get notifications for polling-based updates
   */
  static async getRecentNotifications(userId, since = null) {
    try {
      const query = { recipient: userId };
      
      if (since) {
        query.createdAt = { $gt: new Date(since) };
      }
      
      const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
      
      return notifications;
    } catch (error) {
      console.error('Error fetching recent notifications:', error);
      return [];
    }
  }

  /**
   * Check if user has new notifications since last check
   */
  static async hasNewNotifications(userId, lastCheck) {
    try {
      const count = await Notification.countDocuments({
        recipient: userId,
        createdAt: { $gt: new Date(lastCheck) }
      });
      
      return count > 0;
    } catch (error) {
      console.error('Error checking new notifications:', error);
      return false;
    }
  }

  /**
   * Send permission update notification (fallback)
   */
  static async notifyPermissionUpdate(userId, updates = {}) {
    try {
      console.log(`🔄 Fallback permission notification for user ${userId}`);
      
      // Create notification in database
      await this.createNotification({
        recipientId: userId,
        recipientType: 'admin',
        tenancy: updates.tenancy,
        type: 'permission_updated',
        title: 'Permissions Updated',
        message: 'Your permissions have been updated. Please refresh the page to see changes.',
        icon: 'shield-check',
        severity: 'info',
        data: {
          updates,
          requiresRefresh: true,
          timestamp: new Date()
        }
      });
      
      return true;
    } catch (error) {
      console.error('Error sending fallback permission notification:', error);
      return false;
    }
  }
}

module.exports = FallbackNotificationService;