/**
 * Notification Service Integration
 * Bridges the existing notification service with the Socket Relay Server
 */

const relayService = require('./relayService');
const Notification = require('../models/Notification');

class NotificationServiceIntegration {
  constructor() {
    this.useRelay = true; // Feature flag
  }

  /**
   * Create and send notification through relay server
   */
  async createNotification(notificationData) {
    try {
      const normalizedData = this.normalizeNotificationData(notificationData);

      if (this.useRelay) {
        console.log('📡 Sending notification via Relay Server');
        return await relayService.processNotification(normalizedData);
      } else {
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
    console.log(`📡 Relay emitToUser: userId=${userId}, event=${event}`);
    return await relayService.emitToUser(userId, event, data);
  }

  /**
   * Emit real-time notification to specific role within a tenant
   */
  async emitToTenantRole(tenantId, role, event, data) {
    return await relayService.emitToTenantRole(tenantId, role, event, data);
  }

  /**
   * Get notification system statistics
   */
  async getStatistics() {
    return await relayService.getStatistics();
  }

  /**
   * Switch relay on/off
   */
  setUseRelay(enabled) {
    this.useRelay = enabled;
    console.log(`🔄 Notification system: ${enabled ? 'Relay' : 'Legacy'}`);
  }

  /**
   * Health check
   */
  async healthCheck() {
    const relayHealth = await relayService.healthCheck();
    return {
      relay: relayHealth,
      legacy: { available: true, status: 'healthy' },
      currentSystem: this.useRelay ? 'relay' : 'legacy'
    };
  }
}

// Export singleton instance
const notificationServiceIntegration = new NotificationServiceIntegration();
module.exports = notificationServiceIntegration;