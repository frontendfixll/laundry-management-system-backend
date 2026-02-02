/**
 * Socket.IO Server Initialization
 * Integrates the Socket.IO Notification Engine with the main server
 */

const { SocketIONotificationEngine } = require('./notifications/SocketIONotificationEngine');

class SocketIOServer {
  constructor() {
    this.notificationEngine = null;
    this.isInitialized = false;
  }

  /**
   * Initialize Socket.IO server with HTTP server
   */
  async initialize(httpServer) {
    try {
      console.log('🔄 Initializing Socket.IO Notification Server...');

      // Create notification engine with HTTP server
      this.notificationEngine = new SocketIONotificationEngine(httpServer);

      // Initialize the engine
      await this.notificationEngine.initialize();

      this.isInitialized = true;

      console.log('✅ Socket.IO Notification Server initialized successfully');
      console.log(`🔌 Socket.IO listening on port ${process.env.SOCKETIO_PORT || 5001}`);

      return this.notificationEngine;

    } catch (error) {
      console.error('❌ Failed to initialize Socket.IO server:', error);
      throw error;
    }
  }

  /**
   * Get the notification engine instance
   */
  getEngine() {
    if (!this.isInitialized) {
      throw new Error('Socket.IO server not initialized');
    }
    return this.notificationEngine;
  }

  /**
   * Process a notification through the engine
   */
  async processNotification(notificationData, context = {}) {
    if (!this.isInitialized) {
      console.warn('⚠️ Socket.IO server not initialized, skipping notification');
      return { success: false, error: 'Socket.IO server not initialized' };
    }

    return await this.notificationEngine.processNotification(notificationData, context);
  }

  /**
   * Emit to specific user
   */
  async emitToUser(userId, event, data) {
    if (!this.isInitialized) {
      return false;
    }
    return await this.notificationEngine.emitToUser(userId, event, data);
  }

  /**
   * Emit to specific tenant
   */
  async emitToTenant(tenantId, event, data) {
    if (!this.isInitialized) {
      return false;
    }
    return await this.notificationEngine.emitToTenant(tenantId, event, data);
  }

  /**
   * Emit to specific role within a tenant
   */
  async emitToTenantRole(tenantId, role, event, data) {
    if (!this.isInitialized) {
      return false;
    }
    return await this.notificationEngine.emitToTenantRole(tenantId, role, event, data);
  }

  /**
   * Get server statistics
   */
  async getStatistics() {
    if (!this.isInitialized) {
      return null;
    }
    return await this.notificationEngine.getStatistics();
  }

  /**
   * Shutdown the server
   */
  async shutdown() {
    if (this.isInitialized && this.notificationEngine) {
      await this.notificationEngine.shutdown();
      this.isInitialized = false;
      console.log('✅ Socket.IO Notification Server shutdown complete');
    }
  }
}

// Export singleton instance
const socketIOServer = new SocketIOServer();
module.exports = socketIOServer;