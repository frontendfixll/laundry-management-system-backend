/**
 * Firebase Notification Service
 * 
 * Replaces Socket.IO for real-time notifications
 * Uses Firebase Realtime Database as delivery layer
 * MongoDB remains the source of truth
 */

const { getDatabase, getRef } = require('../config/firebase-admin-config');
const Notification = require('../models/Notification');

class FirebaseNotificationService {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  /**
   * Initialize Firebase Notification Service
   */
  async initialize() {
    try {
      this.db = getDatabase();
      this.initialized = true;
      console.log('✅ Firebase Notification Service initialized');
      return true;
    } catch (error) {
      console.error('❌ Firebase Notification Service initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Send notification to user(s)
   * @param {Object} notificationData - Notification data
   * @param {string|Array} recipients - User ID(s)
   * @returns {Promise<Object>}
   */
  async sendNotification(notificationData, recipients) {
    if (!this.initialized) {
      throw new Error('Firebase Notification Service not initialized');
    }

    try {
      // Ensure recipients is an array
      const recipientList = Array.isArray(recipients) ? recipients : [recipients];

      // Save to MongoDB (source of truth)
      const notification = await Notification.create({
        ...notificationData,
        recipients: recipientList,
        status: 'CREATED',
        createdAt: new Date(),
      });

      // Mirror to Firebase for real-time delivery
      const firebasePromises = recipientList.map(async (userId) => {
        const userNotifRef = this.db.ref(`notifications/${userId}/${notification._id}`);
        
        // Lightweight document for Firebase
        const firebaseDoc = {
          id: notification._id.toString(),
          title: notificationData.title,
          summary: notificationData.summary || notificationData.message?.substring(0, 100),
          priority: notificationData.priority || 'P2',
          category: notificationData.category,
          actionUrl: notificationData.action_url,
          createdAt: Date.now(),
          read: false,
          scope: notificationData.scope || 'TENANT',
          tenantId: notificationData.tenant_id || null,
        };

        await userNotifRef.set(firebaseDoc);
        
        // Update delivery status in MongoDB
        await Notification.updateOne(
          { _id: notification._id, 'recipients.userId': userId },
          { 
            $set: { 
              'recipients.$.status': 'DELIVERED',
              'recipients.$.deliveredAt': new Date()
            }
          }
        );

        return { userId, notificationId: notification._id };
      });

      await Promise.all(firebasePromises);

      console.log(`✅ Notification sent to ${recipientList.length} user(s)`);
      
      return {
        success: true,
        notificationId: notification._id,
        recipientCount: recipientList.length,
      };
    } catch (error) {
      console.error('❌ Send notification failed:', error.message);
      throw error;
    }
  }

  /**
   * Mark notification as read
   * @param {string} userId - User ID
   * @param {string} notificationId - Notification ID
   */
  async markAsRead(userId, notificationId) {
    try {
      // Update Firebase
      const notifRef = this.db.ref(`notifications/${userId}/${notificationId}`);
      await notifRef.update({ read: true, readAt: Date.now() });

      // Update MongoDB
      await Notification.updateOne(
        { _id: notificationId, 'recipients.userId': userId },
        { 
          $set: { 
            'recipients.$.status': 'READ',
            'recipients.$.readAt': new Date()
          }
        }
      );

      return { success: true };
    } catch (error) {
      console.error('❌ Mark as read failed:', error.message);
      throw error;
    }
  }

  /**
   * Acknowledge notification (for P0 priority)
   * @param {string} userId - User ID
   * @param {string} notificationId - Notification ID
   */
  async acknowledgeNotification(userId, notificationId) {
    try {
      // Update Firebase
      const notifRef = this.db.ref(`notifications/${userId}/${notificationId}`);
      await notifRef.update({ 
        acknowledged: true, 
        acknowledgedAt: Date.now() 
      });

      // Update MongoDB
      await Notification.updateOne(
        { _id: notificationId, 'recipients.userId': userId },
        { 
          $set: { 
            'recipients.$.status': 'ACKNOWLEDGED',
            'recipients.$.ackAt': new Date()
          }
        }
      );

      return { success: true };
    } catch (error) {
      console.error('❌ Acknowledge notification failed:', error.message);
      throw error;
    }
  }

  /**
   * Delete notification
   * @param {string} userId - User ID
   * @param {string} notificationId - Notification ID
   */
  async deleteNotification(userId, notificationId) {
    try {
      // Remove from Firebase
      const notifRef = this.db.ref(`notifications/${userId}/${notificationId}`);
      await notifRef.remove();

      // Archive in MongoDB (don't delete)
      await Notification.updateOne(
        { _id: notificationId, 'recipients.userId': userId },
        { 
          $set: { 
            'recipients.$.archived': true,
            'recipients.$.archivedAt': new Date()
          }
        }
      );

      return { success: true };
    } catch (error) {
      console.error('❌ Delete notification failed:', error.message);
      throw error;
    }
  }

  /**
   * Get user notifications (from MongoDB)
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   */
  async getUserNotifications(userId, options = {}) {
    try {
      const {
        limit = 20,
        skip = 0,
        unreadOnly = false,
        priority = null,
        category = null,
      } = options;

      const query = {
        'recipients.userId': userId,
        'recipients.archived': { $ne: true },
      };

      if (unreadOnly) {
        query['recipients.status'] = { $in: ['CREATED', 'DELIVERED'] };
      }

      if (priority) {
        query.priority = priority;
      }

      if (category) {
        query.category = category;
      }

      const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .lean();

      return notifications;
    } catch (error) {
      console.error('❌ Get user notifications failed:', error.message);
      throw error;
    }
  }

  /**
   * Broadcast notification to all users in tenant
   * @param {string} tenantId - Tenant ID
   * @param {Object} notificationData - Notification data
   */
  async broadcastToTenant(tenantId, notificationData) {
    try {
      // Get all users in tenant
      const User = require('../models/User');
      const users = await User.find({ tenancy: tenantId }).select('_id');
      const userIds = users.map(u => u._id.toString());

      return await this.sendNotification(
        { ...notificationData, tenant_id: tenantId, scope: 'TENANT' },
        userIds
      );
    } catch (error) {
      console.error('❌ Broadcast to tenant failed:', error.message);
      throw error;
    }
  }

  /**
   * Send notification to users by role
   * @param {string} tenantId - Tenant ID
   * @param {string|Array} roles - Role name(s)
   * @param {Object} notificationData - Notification data
   */
  async sendToRole(tenantId, roles, notificationData) {
    try {
      const roleList = Array.isArray(roles) ? roles : [roles];
      
      // Get users with specified roles
      const User = require('../models/User');
      const users = await User.find({
        tenancy: tenantId,
        role: { $in: roleList }
      }).select('_id');

      const userIds = users.map(u => u._id.toString());

      return await this.sendNotification(
        { ...notificationData, tenant_id: tenantId, scope: 'TENANT' },
        userIds
      );
    } catch (error) {
      console.error('❌ Send to role failed:', error.message);
      throw error;
    }
  }

  /**
   * Clean up expired notifications
   */
  async cleanupExpired() {
    try {
      const now = new Date();
      
      // Find expired notifications
      const expiredNotifications = await Notification.find({
        expiresAt: { $lt: now },
        archived: { $ne: true }
      });

      for (const notification of expiredNotifications) {
        // Remove from Firebase for all recipients
        for (const recipient of notification.recipients) {
          const notifRef = this.db.ref(`notifications/${recipient.userId}/${notification._id}`);
          await notifRef.remove();
        }

        // Archive in MongoDB
        await Notification.updateOne(
          { _id: notification._id },
          { $set: { archived: true, archivedAt: now } }
        );
      }

      console.log(`✅ Cleaned up ${expiredNotifications.length} expired notifications`);
      return { cleaned: expiredNotifications.length };
    } catch (error) {
      console.error('❌ Cleanup expired failed:', error.message);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const testRef = this.db.ref('.info/connected');
      const snapshot = await testRef.once('value');
      return {
        connected: snapshot.val() === true,
        initialized: this.initialized,
      };
    } catch (error) {
      return {
        connected: false,
        initialized: this.initialized,
        error: error.message,
      };
    }
  }
}

// Export singleton instance
const firebaseNotificationService = new FirebaseNotificationService();
module.exports = firebaseNotificationService;
