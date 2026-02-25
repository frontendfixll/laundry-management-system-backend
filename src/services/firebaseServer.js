/**
 * Firebase Server Initialization
 * Replaces Socket.IO Server with Firebase Realtime Database
 * Maintains same API for backward compatibility
 */

const { FirebaseNotificationEngine } = require('./notifications/FirebaseNotificationEngine');

class FirebaseServer {
  constructor() {
    this.notificationEngine = null;
    this.isInitialized = false;
  }

  /**
   * Initialize Firebase server
   * Note: httpServer parameter kept for API compatibility but not used
   */
  async initialize(httpServer = null) {
    try {
      console.log('🔄 Initializing Firebase Notification Server...');

      // Create notification engine
      this.notificationEngine = new FirebaseNotificationEngine();

      // Initialize the engine
      await this.notificationEngine.initialize();

      this.isInitialized = true;

      console.log('✅ Firebase Notification Server initialized successfully');
      console.log('🔥 Real-time notifications powered by Firebase Realtime Database');

      return this.notificationEngine;

    } catch (error) {
      console.error('❌ Failed to initialize Firebase server:', error);
      throw error;
    }
  }

  /**
   * Get the notification engine instance
   */
  getEngine() {
    if (!this.isInitialized) {
      throw new Error('Firebase server not initialized');
    }
    return this.notificationEngine;
  }

  /**
   * Process a notification through the engine
   */
  async processNotification(notificationData, context = {}) {
    if (!this.isInitialized) {
      console.warn('⚠️ Firebase server not initialized, skipping notification');
      return { success: false, error: 'Firebase server not initialized' };
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
      console.log('✅ Firebase Notification Server shutdown complete');
    }
  }
}

// Export singleton instance
const firebaseServer = new FirebaseServer();
module.exports = firebaseServer;
