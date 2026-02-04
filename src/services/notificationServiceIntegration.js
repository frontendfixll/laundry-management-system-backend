/**
 * Notification Service Integration
 * Bridges the existing notification service with the new Socket.IO engine
 */

const socketIOServer = require('./socketIOServer');
const Notification = require('../models/Notification');

class NotificationServiceIntegration {
  constructor() {
    this.useSocketIO = true; // Feature flag to switch between systems
  }

  /**
   * Create and send notification through appropriate system
   */
  async createNotification(notificationData) {
    try {
      // Normalize data for Socket.IO format
      const socketIOData = this.normalizeNotificationData(notificationData);

      if (this.useSocketIO && socketIOServer.isInitialized) {
        // Use new Socket.IO system
        console.log('📡 Using Socket.IO notification system');
        return await socketIOServer.processNotification(socketIOData);
      } else {
        // Fallback to legacy system
        console.log('📡 Using legacy notification system');
        return await this.createLegacyNotification(notificationData);
      }

    } catch (error) {
      console.error('❌ Error in notification service integration:', error);

      // Always try legacy as fallback
      try {
        return await this.createLegacyNotification(notificationData);
      } catch (fallbackError) {
        console.error('❌ Legacy notification fallback also failed:', fallbackError);
        throw fallbackError;
      }
    }
  }

  /**
   * Normalize notification data for Socket.IO format
   */
  normalizeNotificationData(data) {
    const eventType = data.type || data.eventType || 'general';

    // Synthesize title/message if missing (for raw events from legacy routes)
    let title = data.title;
    let message = data.message;

    if (!title && eventType === 'orderStatusUpdated') {
      title = `Order Updated: #${data.orderNumber || data.data?.orderNumber || 'Unknown'}`;
      message = data.message || `Order status changed from ${data.oldStatus || data.data?.oldStatus || 'unknown'} to ${data.newStatus || data.data?.newStatus || 'unknown'}`;
    } else if (!title && eventType === 'customer_updated') {
      const customerName = data.customerName || data.data?.name || data.data?.firstName || 'Customer';
      title = 'Customer Updated';
      message = `Details for ${customerName} have been updated.`;
    } else if (!title) {
      title = eventType.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    return {
      userId: data.recipient || data.userId || (data.recipientType ? null : undefined), // null means broadcast if type is present
      tenantId: data.tenancy || data.tenantId,
      eventType: eventType,
      title: title,
      message: message || title,
      category: data.category || this.getCategoryFromType(eventType),
      priority: data.priority,
      severity: data.severity,
      icon: data.icon,
      metadata: {
        ...data.data,
        ...data, // Include everything as metadata
        icon: data.icon,
        severity: data.severity,
        recipientType: data.recipientType,
        recipientModel: data.recipientModel,
        originalData: data
      }
    };
  }

  /**
   * Create notification using database only (no legacy event bus)
   */
  async createLegacyNotification(data) {
    const notification = new Notification(data);
    await notification.save();

    // No legacy event bus - just save to database
    console.log('📡 Notification saved to database (legacy fallback)');

    return {
      success: true,
      notificationId: notification._id,
      system: 'database_only'
    };
  }

  /**
   * Get category from notification type
   */
  getCategoryFromType(type) {
    const categoryMap = {
      // Order notifications
      'order_placed': 'orders',
      'order_assigned': 'orders',
      'order_picked': 'orders',
      'order_in_process': 'orders',
      'order_ready': 'orders',
      'order_out_for_delivery': 'orders',
      'order_delivered': 'orders',
      'order_cancelled': 'orders',

      // Payment notifications
      'payment_received': 'payments',
      'payment_failed': 'payments',
      'refund_request': 'payments',

      // System notifications
      'system_alert': 'system',
      'security_alert': 'security',
      'permission_granted': 'permissions',
      'permission_revoked': 'permissions',
      'role_updated': 'permissions',

      // Inventory notifications
      'low_inventory': 'inventory',
      'inventory_restocked': 'inventory',
      'inventory_request_submitted': 'inventory',
      'inventory_request_approved': 'inventory',

      // Support notifications
      'new_complaint': 'support',
      'ticket_assigned': 'support',
      'ticket_resolved': 'support',

      // Admin notifications
      'admin_created': 'admin',
      'new_staff_added': 'admin',
      'staff_removed': 'admin',
      'new_branch_created': 'admin',

      // Rewards notifications
      'reward_points': 'rewards',
      'milestone_achieved': 'rewards',
      'vip_upgrade': 'rewards',

      // Campaign notifications
      'new_campaign': 'marketing',
      'coupon_expiring': 'marketing',
      'wallet_credited': 'marketing'
    };

    return categoryMap[type] || 'general';
  }

  /**
   * Emit real-time notification to user
   */
  async emitToUser(userId, event, data) {
    console.log(`📡 notificationServiceIntegration.emitToUser: userId=${userId}, event=${event}`);
    if (this.useSocketIO && socketIOServer.isInitialized) {
      console.log('➡️ Calling socketIOServer.emitToUser');
      return await socketIOServer.emitToUser(userId, event, data);
    }

    // No legacy fallback - just log
    console.log('📡 Socket.IO not available, notification not sent in real-time');
    return false;
  }

  /**
   * Emit real-time notification to specific role within a tenant
   */
  async emitToTenantRole(tenantId, role, event, data) {
    if (this.useSocketIO && socketIOServer.isInitialized) {
      return await socketIOServer.emitToTenantRole(tenantId, role, event, data);
    }

    // No legacy fallback - just log
    console.log('📡 Socket.IO not available, tenant role notification not sent in real-time');
    return false;
  }

  /**
   * Get notification system statistics
   */
  async getStatistics() {
    if (this.useSocketIO && socketIOServer.isInitialized) {
      return await socketIOServer.getStatistics();
    }

    return {
      system: 'legacy',
      socketIO: false,
      message: 'Using legacy notification system'
    };
  }

  /**
   * Switch between Socket.IO and legacy systems
   */
  setUseSocketIO(enabled) {
    this.useSocketIO = enabled;
    console.log(`🔄 Notification system switched to: ${enabled ? 'Socket.IO' : 'Legacy'}`);
  }

  /**
   * Health check
   */
  async healthCheck() {
    const health = {
      socketIO: {
        available: socketIOServer.isInitialized,
        status: socketIOServer.isInitialized ? 'healthy' : 'unavailable'
      },
      legacy: {
        available: true,
        status: 'healthy'
      },
      currentSystem: this.useSocketIO && socketIOServer.isInitialized ? 'socketIO' : 'legacy'
    };

    if (this.useSocketIO && socketIOServer.isInitialized) {
      try {
        const stats = await socketIOServer.getStatistics();
        health.socketIO.connections = stats.connections?.activeConnections || 0;
        health.socketIO.metrics = stats.engine?.metrics;
      } catch (error) {
        health.socketIO.status = 'error';
        health.socketIO.error = error.message;
      }
    }

    return health;
  }
}

// Export singleton instance
const notificationServiceIntegration = new NotificationServiceIntegration();
module.exports = notificationServiceIntegration;