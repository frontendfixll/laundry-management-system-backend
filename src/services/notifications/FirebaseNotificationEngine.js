/**
 * Firebase Notification Engine
 * 
 * Replaces Socket.IO Notification Engine with Firebase Realtime Database
 * Maintains same API for backward compatibility
 */

const { getDatabase } = require('../../config/firebase-admin-config');
const { NotificationPriorityClassifier } = require('./NotificationPriorityClassifier');
const { NotificationAuditLogger } = require('./NotificationAuditLogger');
const { NotificationSecurityGuard } = require('./NotificationSecurityGuard');
const { NotificationRateLimiter } = require('./NotificationRateLimiter');
const Notification = require('../../models/Notification');

class FirebaseNotificationEngine {
  constructor() {
    this.db = null;
    this.isInitialized = false;
    this.priorityClassifier = new NotificationPriorityClassifier();
    this.auditLogger = new NotificationAuditLogger();
    this.securityGuard = new NotificationSecurityGuard();
    this.rateLimiter = new NotificationRateLimiter();
  }

  /**
   * Initialize Firebase Notification Engine
   */
  async initialize() {
    try {
      console.log('🔄 Initializing Firebase Notification Engine...');

      this.db = getDatabase();
      this.isInitialized = true;

      console.log('✅ Firebase Notification Engine initialized successfully');
      console.log('🔥 Real-time notifications powered by Firebase');

      return this;
    } catch (error) {
      console.error('❌ Failed to initialize Firebase Notification Engine:', error);
      throw error;
    }
  }

  /**
   * Process notification through the engine
   * Main entry point for sending notifications
   */
  async processNotification(notificationData, context = {}) {
    try {
      if (!this.isInitialized) {
        throw new Error('Firebase Notification Engine not initialized');
      }

      // Security check (simplified for now)
      // TODO: Implement full security validation
      if (!notificationData.title && !notificationData.message) {
        console.warn('⚠️ Notification blocked: Missing title and message');
        return { success: false, error: 'Missing required fields' };
      }

      // Rate limiting check (simplified for now)
      // TODO: Implement full rate limiting
      
      // Classify priority
      const priority = await this.priorityClassifier.classifyPriority(
        notificationData.type || 'system_notification',
        context
      );
      notificationData.priority = priority;

      // Determine recipients
      const recipients = await this.resolveRecipients(notificationData, context);

      if (recipients.length === 0) {
        console.warn('⚠️ No recipients found for notification');
        return { success: false, error: 'No recipients' };
      }

      // Save to MongoDB (source of truth) - Skip if MongoDB not connected
      let notification;
      try {
        notification = await this.saveToDatabase(notificationData, recipients);
      } catch (dbError) {
        console.warn('⚠️ MongoDB save skipped (not connected):', dbError.message);
        // Create mock notification for Firebase
        notification = {
          _id: `mock-${Date.now()}`,
          ...notificationData,
          recipients
        };
      }

      // Mirror to Firebase for real-time delivery
      await this.mirrorToFirebase(notification, recipients);

      // Audit log (simplified)
      console.log(`✅ Notification processed: ${notification._id} to ${recipients.length} recipients`);

      return {
        success: true,
        notificationId: notification._id,
        recipientCount: recipients.length
      };

    } catch (error) {
      console.error('❌ Error processing notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Emit notification to specific user
   */
  async emitToUser(userId, event, data) {
    try {
      if (!this.isInitialized) return false;

      const notificationData = {
        title: data.title || event,
        message: data.message || JSON.stringify(data),
        type: event,
        priority: data.priority || 'P2',
        category: data.category || 'SYSTEM',
        action_url: data.action_url || data.actionUrl,
        entity_type: data.entity_type || data.entityType,
        entity_id: data.entity_id || data.entityId,
        metadata: data,
        scope: 'TENANT',
        tenant_id: data.tenantId || null
      };

      return await this.processNotification(notificationData, {
        userId,
        recipients: [userId]
      });

    } catch (error) {
      console.error(`❌ Error emitting to user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Emit notification to all users in a tenant
   */
  async emitToTenant(tenantId, event, data) {
    try {
      if (!this.isInitialized) return false;

      // Get all users in tenant
      const User = require('../../models/User');
      const users = await User.find({ tenancy: tenantId }).select('_id');
      const userIds = users.map(u => u._id.toString());

      const notificationData = {
        title: data.title || event,
        message: data.message || JSON.stringify(data),
        type: event,
        priority: data.priority || 'P2',
        category: data.category || 'SYSTEM',
        action_url: data.action_url || data.actionUrl,
        metadata: data,
        scope: 'TENANT',
        tenant_id: tenantId
      };

      return await this.processNotification(notificationData, {
        tenantId,
        recipients: userIds
      });

    } catch (error) {
      console.error(`❌ Error emitting to tenant ${tenantId}:`, error);
      return false;
    }
  }

  /**
   * Emit notification to specific role within tenant
   */
  async emitToTenantRole(tenantId, role, event, data) {
    try {
      if (!this.isInitialized) return false;

      // Get users with specific role in tenant
      const User = require('../../models/User');
      const users = await User.find({
        tenancy: tenantId,
        role: role
      }).select('_id');

      const userIds = users.map(u => u._id.toString());

      if (userIds.length === 0) {
        console.warn(`⚠️ No users found with role ${role} in tenant ${tenantId}`);
        return false;
      }

      const notificationData = {
        title: data.title || event,
        message: data.message || JSON.stringify(data),
        type: event,
        priority: data.priority || 'P2',
        category: data.category || 'SYSTEM',
        action_url: data.action_url || data.actionUrl,
        metadata: data,
        scope: 'TENANT',
        tenant_id: tenantId,
        target_role: role
      };

      return await this.processNotification(notificationData, {
        tenantId,
        role,
        recipients: userIds
      });

    } catch (error) {
      console.error(`❌ Error emitting to tenant role ${tenantId}/${role}:`, error);
      return false;
    }
  }

  /**
   * Resolve recipients based on notification data and context
   */
  async resolveRecipients(notificationData, context) {
    try {
      // If recipients explicitly provided
      if (context.recipients && Array.isArray(context.recipients)) {
        return context.recipients;
      }

      // If single user
      if (context.userId) {
        return [context.userId];
      }

      // If tenant-wide
      if (context.tenantId && !context.role) {
        const User = require('../../models/User');
        const users = await User.find({ tenancy: context.tenantId }).select('_id');
        return users.map(u => u._id.toString());
      }

      // If role-based
      if (context.tenantId && context.role) {
        const User = require('../../models/User');
        const users = await User.find({
          tenancy: context.tenantId,
          role: context.role
        }).select('_id');
        return users.map(u => u._id.toString());
      }

      return [];
    } catch (error) {
      console.error('❌ Error resolving recipients:', error);
      return [];
    }
  }

  /**
   * Save notification to MongoDB (source of truth)
   */
  async saveToDatabase(notificationData, recipients) {
    try {
      const recipientRecords = recipients.map(userId => ({
        userId,
        status: 'CREATED',
        deliveredAt: null,
        readAt: null,
        ackAt: null
      }));

      const notification = await Notification.create({
        scope: notificationData.scope || 'TENANT',
        tenant_id: notificationData.tenant_id,
        type: notificationData.type,
        category: notificationData.category || 'SYSTEM',
        priority: notificationData.priority || 'P2',
        title: notificationData.title,
        summary: notificationData.summary || notificationData.message?.substring(0, 100),
        message: notificationData.message,
        entity_type: notificationData.entity_type,
        entity_id: notificationData.entity_id,
        action_url: notificationData.action_url,
        requires_ack: notificationData.priority === 'P0',
        recipients: recipientRecords,
        metadata: notificationData.metadata || {},
        created_at: new Date(),
        expires_at: this.calculateExpiryDate(notificationData.priority)
      });

      return notification;
    } catch (error) {
      console.error('❌ Error saving notification to database:', error);
      throw error;
    }
  }

  /**
   * Mirror notification to Firebase for real-time delivery
   */
  async mirrorToFirebase(notification, recipients) {
    try {
      const promises = recipients.map(async (userId) => {
        const userNotifRef = this.db.ref(`notifications/${userId}/${notification._id}`);

        // Lightweight document for Firebase
        const firebaseDoc = {
          id: notification._id.toString(),
          title: notification.title,
          summary: notification.summary,
          priority: notification.priority,
          category: notification.category,
          actionUrl: notification.action_url,
          createdAt: Date.now(),
          read: false,
          acknowledged: false,
          scope: notification.scope,
          tenantId: notification.tenant_id,
          type: notification.type
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
      });

      await Promise.all(promises);
      console.log(`✅ Notification mirrored to Firebase for ${recipients.length} users`);

    } catch (error) {
      console.error('❌ Error mirroring to Firebase:', error);
      throw error;
    }
  }

  /**
   * Calculate expiry date based on priority
   */
  calculateExpiryDate(priority) {
    const now = new Date();
    switch (priority) {
      case 'P0':
        return null; // Never expire
      case 'P1':
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
      case 'P2':
        return new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days
      case 'P3':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
      default:
        return new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Get engine statistics
   */
  async getStatistics() {
    try {
      const stats = {
        engine: 'Firebase',
        initialized: this.isInitialized,
        timestamp: new Date().toISOString()
      };

      // Get notification counts from MongoDB
      const totalNotifications = await Notification.countDocuments();
      const activeNotifications = await Notification.countDocuments({
        expires_at: { $gt: new Date() }
      });

      stats.notifications = {
        total: totalNotifications,
        active: activeNotifications
      };

      return stats;
    } catch (error) {
      console.error('❌ Error getting statistics:', error);
      return null;
    }
  }

  /**
   * Shutdown the engine
   */
  async shutdown() {
    try {
      this.isInitialized = false;
      console.log('✅ Firebase Notification Engine shutdown complete');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }
}

module.exports = { FirebaseNotificationEngine };
