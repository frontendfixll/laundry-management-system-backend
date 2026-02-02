/**
 * DeepNoti Engine
 * Core notification processing engine with business rules
 * Uses simple in-memory event bus - no Redis required
 */

const eventBus = require('./simpleEventBus');
const sseService = require('./sseService');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { RECIPIENT_TYPES, NOTIFICATION_TYPES } = require('../config/constants');

class DeepNotiEngine {
  constructor() {
    this.isInitialized = false;
    this.notificationRules = new Map();
    this.setupNotificationRules();
  }

  /**
   * Initialize DeepNoti Engine
   */
  async initialize() {
    try {
      // Setup event listeners
      this.setupEventListeners();
      
      this.isInitialized = true;
      console.log('✅ DeepNoti Engine initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize DeepNoti Engine:', error);
      return false;
    }
  }

  /**
   * Setup event listeners for different channels
   */
  setupEventListeners() {
    // Listen for notification events
    eventBus.onEvent(eventBus.CHANNELS.NOTIFICATIONS, (event) => {
      this.processNotificationEvent(event);
    });

    // Listen for permission update events
    eventBus.onEvent(eventBus.CHANNELS.PERMISSIONS, (event) => {
      this.processPermissionEvent(event);
    });

    // Listen for feature update events
    eventBus.onEvent(eventBus.CHANNELS.FEATURES, (event) => {
      this.processFeatureEvent(event);
    });

    // Listen for tenancy update events
    eventBus.onEvent(eventBus.CHANNELS.TENANCY, (event) => {
      this.processTenancyEvent(event);
    });

    // Listen for system events
    eventBus.onEvent(eventBus.CHANNELS.SYSTEM, (event) => {
      this.processSystemEvent(event);
    });

    console.log('🔔 DeepNoti Engine event listeners registered');
  }

  /**
   * Setup notification rules for different event types
   */
  setupNotificationRules() {
    // Standard notification rules
    this.notificationRules.set('notification_created', {
      priority: 'normal',
      channels: ['sse'],
      persistent: true,
      requiresAuth: true,
      tenancyIsolated: true
    });

    // Permission update rules
    this.notificationRules.set('permissions_updated', {
      priority: 'high',
      channels: ['sse'],
      persistent: true,
      requiresAuth: true,
      tenancyIsolated: true,
      requiresRefresh: true
    });

    // Feature update rules
    this.notificationRules.set('features_updated', {
      priority: 'high',
      channels: ['sse'],
      persistent: false, // System events don't need persistence
      requiresAuth: true,
      tenancyIsolated: true,
      requiresRefresh: true
    });

    // Tenancy update rules
    this.notificationRules.set('tenancy_updated', {
      priority: 'medium',
      channels: ['sse'],
      persistent: false,
      requiresAuth: true,
      tenancyIsolated: true
    });

    // System event rules
    this.notificationRules.set('system_maintenance', {
      priority: 'critical',
      channels: ['sse'],
      persistent: false,
      requiresAuth: false,
      tenancyIsolated: false
    });

    console.log('📋 DeepNoti notification rules configured');
  }

  /**
   * Process notification creation events
   */
  async processNotificationEvent(event) {
    try {
      console.log('🔔 Processing notification event:', event);

      const { notification } = event;
      const rule = this.notificationRules.get(event.type);

      if (!rule) {
        console.warn('⚠️ No rule found for event type:', event.type);
        return;
      }

      // Determine recipients
      const recipients = await this.resolveRecipients(notification);

      // Send to each recipient via SSE
      for (const recipient of recipients) {
        await this.deliverNotification(recipient, notification, rule);
      }

    } catch (error) {
      console.error('❌ Error processing notification event:', error);
    }
  }

  /**
   * Process permission update events
   */
  async processPermissionEvent(event) {
    try {
      console.log('🔐 Processing permission event:', event);

      const { userId, tenancyId, permissions, updatedBy } = event;
      const rule = this.notificationRules.get(event.type);

      // Create system notification for permission update
      const systemNotification = {
        id: `perm_${Date.now()}`,
        recipientId: userId,
        recipientType: RECIPIENT_TYPES.ADMIN,
        tenancy: tenancyId,
        title: 'Permissions Updated',
        message: 'Your access permissions have been updated by SuperAdmin',
        icon: 'shield-check',
        severity: 'warning',
        data: {
          permissions,
          updatedBy,
          type: 'permission_update',
          requiresRefresh: true
        },
        createdAt: new Date().toISOString()
      };

      // Send via SSE
      await sseService.sendToUser(userId, {
        type: 'permission_update',
        notification: systemNotification,
        requiresRefresh: true
      });

      console.log('✅ Permission update sent via SSE to user:', userId);

    } catch (error) {
      console.error('❌ Error processing permission event:', error);
    }
  }

  /**
   * Process feature update events
   */
  async processFeatureEvent(event) {
    try {
      console.log('✨ Processing feature event:', event);

      const { tenancyId, features, updatedBy } = event;

      // Find all users in the tenancy
      const tenancyUsers = await User.find({ 
        tenancy: tenancyId, 
        isActive: true 
      }).select('_id role');

      // Send feature update to all tenancy users
      for (const user of tenancyUsers) {
        const featureNotification = {
          id: `feat_${Date.now()}_${user._id}`,
          recipientId: user._id,
          recipientType: this.mapRoleToRecipientType(user.role),
          tenancy: tenancyId,
          title: 'Features Updated',
          message: 'Your subscription features have been updated',
          icon: 'star',
          severity: 'info',
          data: {
            features,
            updatedBy,
            type: 'feature_update',
            requiresRefresh: true
          },
          createdAt: new Date().toISOString()
        };

        await sseService.sendToUser(user._id, {
          type: 'feature_update',
          notification: featureNotification,
          requiresRefresh: true
        });
      }

      console.log('✅ Feature updates sent via SSE to tenancy:', tenancyId);

    } catch (error) {
      console.error('❌ Error processing feature event:', error);
    }
  }

  /**
   * Process tenancy update events
   */
  async processTenancyEvent(event) {
    try {
      console.log('🏢 Processing tenancy event:', event);

      const { tenancyId, updateType, data, updatedBy } = event;

      // Find all users in the tenancy
      const tenancyUsers = await User.find({ 
        tenancy: tenancyId, 
        isActive: true 
      }).select('_id role');

      // Send tenancy update to all users
      for (const user of tenancyUsers) {
        const tenancyNotification = {
          id: `tenancy_${Date.now()}_${user._id}`,
          recipientId: user._id,
          recipientType: this.mapRoleToRecipientType(user.role),
          tenancy: tenancyId,
          title: 'Business Settings Updated',
          message: `Your ${updateType} settings have been updated`,
          icon: 'settings',
          severity: 'info',
          data: {
            updateType,
            data,
            updatedBy,
            type: 'tenancy_update'
          },
          createdAt: new Date().toISOString()
        };

        await sseService.sendToUser(user._id, {
          type: 'tenancy_update',
          notification: tenancyNotification
        });
      }

      console.log('✅ Tenancy updates sent via SSE to tenancy:', tenancyId);

    } catch (error) {
      console.error('❌ Error processing tenancy event:', error);
    }
  }

  /**
   * Process system events
   */
  async processSystemEvent(event) {
    try {
      console.log('🔧 Processing system event:', event);

      const { type, data } = event;

      // Broadcast system events to all connected users
      await sseService.broadcast({
        type: 'system_event',
        eventType: type,
        data,
        timestamp: new Date().toISOString()
      });

      console.log('✅ System event broadcasted via SSE');

    } catch (error) {
      console.error('❌ Error processing system event:', error);
    }
  }

  /**
   * Resolve notification recipients
   */
  async resolveRecipients(notification) {
    try {
      // For single recipient notifications
      if (notification.recipientId) {
        return [{
          userId: notification.recipientId,
          recipientType: notification.recipientType,
          tenancy: notification.tenancy
        }];
      }

      // For broadcast notifications (future enhancement)
      if (notification.broadcast) {
        // Implementation for broadcast recipients
        return [];
      }

      return [];
    } catch (error) {
      console.error('❌ Error resolving recipients:', error);
      return [];
    }
  }

  /**
   * Deliver notification to recipient via SSE
   */
  async deliverNotification(recipient, notification, rule) {
    try {
      // Check if user has active SSE connection
      const hasConnection = sseService.hasActiveConnection(recipient.userId);
      
      if (hasConnection) {
        // Send via SSE
        await sseService.sendToUser(recipient.userId, {
          type: 'notification',
          notification,
          priority: rule.priority,
          persistent: rule.persistent
        });

        console.log(`📤 Notification delivered via SSE to user: ${recipient.userId}`);
      } else {
        console.log(`📭 No active SSE connection for user: ${recipient.userId}`);
        
        // Store for delivery when user reconnects (if persistent)
        if (rule.persistent) {
          await this.storeForLaterDelivery(recipient.userId, notification);
        }
      }

    } catch (error) {
      console.error('❌ Error delivering notification:', error);
    }
  }

  /**
   * Store notification for later delivery
   */
  async storeForLaterDelivery(userId, notification) {
    try {
      // Store in database for delivery when user reconnects
      const storedNotification = new Notification({
        recipient: notification.recipientId,
        recipientType: notification.recipientType,
        tenancy: notification.tenancy,
        type: notification.type || NOTIFICATION_TYPES.SYSTEM_UPDATE,
        title: notification.title,
        message: notification.message,
        icon: notification.icon,
        severity: notification.severity,
        data: notification.data,
        channels: { inApp: true }
      });

      await storedNotification.save();
      console.log(`💾 Notification stored for later delivery to user: ${userId}`);

    } catch (error) {
      console.error('❌ Error storing notification:', error);
    }
  }

  /**
   * Map user role to recipient type
   */
  mapRoleToRecipientType(role) {
    const roleMap = {
      'customer': RECIPIENT_TYPES.CUSTOMER,
      'admin': RECIPIENT_TYPES.ADMIN,
      'branch_admin': RECIPIENT_TYPES.BRANCH_ADMIN,
      'superadmin': RECIPIENT_TYPES.SUPERADMIN,
      'staff': RECIPIENT_TYPES.STAFF,
      'sales_admin': RECIPIENT_TYPES.SUPERADMIN
    };
    
    return roleMap[role] || RECIPIENT_TYPES.CUSTOMER;
  }

  /**
   * Get engine status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      rules: Array.from(this.notificationRules.keys()),
      eventBusStatus: eventBus.getStatus(),
      sseStatus: sseService.getStatus()
    };
  }
}

// Singleton instance
const deepNotiEngine = new DeepNotiEngine();

module.exports = deepNotiEngine;