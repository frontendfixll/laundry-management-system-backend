/**
 * Simple DeepNoti Event Bus Service
 * In-memory event system for real-time notifications
 * No Redis required - pure Node.js EventEmitter
 */

const EventEmitter = require('events');

class SimpleEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // Increase listener limit
    
    // Event channels
    this.CHANNELS = {
      NOTIFICATIONS: 'deepnoti:notifications',
      PERMISSIONS: 'deepnoti:permissions',
      FEATURES: 'deepnoti:features',
      TENANCY: 'deepnoti:tenancy',
      SYSTEM: 'deepnoti:system'
    };

    console.log('✅ Simple DeepNoti Event Bus initialized (in-memory)');
  }

  /**
   * Initialize - no external dependencies needed
   */
  async initialize() {
    // No Redis connection needed - just return success
    console.log('✅ Simple Event Bus ready (no external dependencies)');
    return true;
  }

  /**
   * Publish business event
   */
  async publishEvent(channel, event) {
    try {
      const eventData = {
        id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        channel,
        ...event
      };

      // Emit event using Node.js EventEmitter
      this.emit(channel, eventData);
      console.log(`📤 Event published to ${channel}:`, eventData.type);
      return true;
    } catch (error) {
      console.error('❌ Failed to publish event:', error);
      return false;
    }
  }

  /**
   * Subscribe to events on a channel
   */
  onEvent(channel, handler) {
    this.on(channel, handler);
    console.log(`🔔 Event handler registered for ${channel}`);
  }

  /**
   * Remove event handler
   */
  offEvent(channel, handler) {
    this.off(channel, handler);
  }

  // ==================== BUSINESS EVENT PUBLISHERS ====================

  /**
   * Publish notification event
   */
  async publishNotification(notification) {
    return this.publishEvent(this.CHANNELS.NOTIFICATIONS, {
      type: 'notification_created',
      notification: {
        id: notification._id,
        recipientId: notification.recipient,
        recipientType: notification.recipientType,
        tenancy: notification.tenancy,
        title: notification.title,
        message: notification.message,
        icon: notification.icon,
        severity: notification.severity,
        data: notification.data,
        createdAt: notification.createdAt
      }
    });
  }

  /**
   * Publish permission update event
   */
  async publishPermissionUpdate(userId, tenancyId, permissions, updatedBy) {
    return this.publishEvent(this.CHANNELS.PERMISSIONS, {
      type: 'permissions_updated',
      userId,
      tenancyId,
      permissions,
      updatedBy,
      requiresRefresh: true
    });
  }

  /**
   * Publish feature update event
   */
  async publishFeatureUpdate(tenancyId, features, updatedBy) {
    return this.publishEvent(this.CHANNELS.FEATURES, {
      type: 'features_updated',
      tenancyId,
      features,
      updatedBy,
      requiresRefresh: true
    });
  }

  /**
   * Publish tenancy update event
   */
  async publishTenancyUpdate(tenancyId, updateType, data, updatedBy) {
    return this.publishEvent(this.CHANNELS.TENANCY, {
      type: 'tenancy_updated',
      tenancyId,
      updateType,
      data,
      updatedBy
    });
  }

  /**
   * Publish system event
   */
  async publishSystemEvent(eventType, data) {
    return this.publishEvent(this.CHANNELS.SYSTEM, {
      type: eventType,
      data
    });
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: true,
      type: 'in-memory',
      channels: Object.keys(this.CHANNELS).length,
      listeners: this.eventNames().map(event => ({
        event,
        listenerCount: this.listenerCount(event)
      }))
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    try {
      this.removeAllListeners();
      console.log('✅ Simple Event Bus shutdown complete');
    } catch (error) {
      console.error('❌ Error during Event Bus shutdown:', error);
    }
  }
}

// Singleton instance
const simpleEventBus = new SimpleEventBus();

module.exports = simpleEventBus;