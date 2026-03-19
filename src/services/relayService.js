/**
 * Relay Service
 * Sends real-time events to the Socket Relay Server via HTTP
 * Replaces direct Socket.IO usage for Vercel compatibility
 */

const axios = require('axios');

class RelayService {
  constructor() {
    this.relayUrl = process.env.SOCKET_RELAY_URL || 'http://localhost:3001';
    this.apiKey = process.env.SOCKET_RELAY_API_KEY || '';
    this.isInitialized = false;
    this.client = null;
  }

  initialize() {
    this.client = axios.create({
      baseURL: this.relayUrl,
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'x-relay-api-key': this.apiKey
      }
    });
    this.isInitialized = true;
    console.log(`📡 Relay Service initialized → ${this.relayUrl}`);
    return this;
  }

  /**
   * Send a single event to the relay server
   */
  async emit(target, event, data) {
    if (!this.isInitialized) this.initialize();

    try {
      const response = await this.client.post('/relay/emit', { target, event, data });
      return response.data;
    } catch (error) {
      // Don't let relay failures break the main app flow
      console.warn(`⚠️ Relay emit failed (${event}):`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send multiple events in one HTTP call
   */
  async emitBatch(events) {
    if (!this.isInitialized) this.initialize();

    try {
      const response = await this.client.post('/relay/emit-batch', { events });
      return response.data;
    } catch (error) {
      console.warn('⚠️ Relay batch emit failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ---- Convenience methods matching existing API ----

  async emitToUser(userId, event, data) {
    return this.emit({ userId: userId.toString() }, event, data);
  }

  async emitToTenant(tenantId, event, data) {
    return this.emit({ tenantId: tenantId.toString() }, event, data);
  }

  async emitToTenantRole(tenantId, role, event, data) {
    return this.emit(
      { tenantId: tenantId?.toString(), role },
      event,
      data
    );
  }

  async emitToRole(role, event, data) {
    return this.emit({ role }, event, data);
  }

  async broadcast(event, data) {
    return this.emit({ broadcast: true }, event, data);
  }

  /**
   * Process notification — same API as socketIOServer / firebaseServer
   * Used by notificationServiceIntegration
   */
  async processNotification(notificationData, context = {}) {
    const event = 'notification';
    const data = {
      id: notificationData.id || `notif-${Date.now()}`,
      title: notificationData.title,
      message: notificationData.message,
      type: notificationData.eventType || notificationData.type,
      category: notificationData.category || 'general',
      priority: notificationData.priority || 'P3',
      severity: notificationData.severity,
      icon: notificationData.icon,
      metadata: notificationData.metadata || {},
      createdAt: new Date().toISOString()
    };

    // Build batch events for all relevant targets
    const events = [];

    // Direct user
    if (notificationData.userId) {
      events.push({
        target: { userId: notificationData.userId.toString() },
        event,
        data
      });
    }

    // Tenant + role
    if (notificationData.tenantId && notificationData.metadata?.recipientType) {
      events.push({
        target: {
          tenantId: notificationData.tenantId.toString(),
          role: notificationData.metadata.recipientType
        },
        event,
        data
      });
    } else if (notificationData.tenantId) {
      events.push({
        target: { tenantId: notificationData.tenantId.toString() },
        event,
        data
      });
    }

    // High priority → also send as high_priority_notification
    if (data.priority === 'P0' || data.priority === 'P1') {
      for (const e of [...events]) {
        events.push({ ...e, event: 'high_priority_notification' });
      }
    }

    if (events.length === 0) {
      console.warn('⚠️ No targets for relay notification');
      return { success: false, error: 'No targets' };
    }

    return this.emitBatch(events);
  }

  /**
   * Get relay server stats
   */
  async getStatistics() {
    if (!this.isInitialized) this.initialize();

    try {
      const response = await this.client.get('/stats');
      return response.data;
    } catch (error) {
      return { system: 'relay', error: error.message };
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    if (!this.isInitialized) this.initialize();

    try {
      const response = await this.client.get('/health');
      return { ...response.data, relay: true };
    } catch (error) {
      return { status: 'unreachable', error: error.message, relay: true };
    }
  }
}

// Export singleton
const relayService = new RelayService();
module.exports = relayService;
