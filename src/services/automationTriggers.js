// Automation Event Triggers
// This service integrates with existing system events to trigger automation rules

const automationEngine = require('./automationEngine');

class AutomationTriggers {
  constructor() {
    this.isInitialized = false;
  }

  // Initialize automation triggers
  initialize() {
    if (this.isInitialized) return;

    console.log('🎯 Initializing automation triggers...');

    // Hook into existing system events
    this.setupOrderTriggers();
    this.setupPaymentTriggers();
    this.setupSubscriptionTriggers();
    this.setupUserTriggers();
    this.setupTenantTriggers();
    this.setupNotificationTriggers();

    this.isInitialized = true;
    console.log('✅ Automation triggers initialized');
  }

  // Order lifecycle triggers
  setupOrderTriggers() {
    // These would hook into your existing order system
    // For now, we'll create helper methods that can be called from existing controllers

    console.log('📦 Order automation triggers ready');
  }

  // Payment triggers
  setupPaymentTriggers() {
    console.log('💳 Payment automation triggers ready');
  }

  // Subscription triggers
  setupSubscriptionTriggers() {
    console.log('📋 Subscription automation triggers ready');
  }

  // User triggers
  setupUserTriggers() {
    console.log('👤 User automation triggers ready');
  }

  // Tenant triggers
  setupTenantTriggers() {
    console.log('🏢 Tenant automation triggers ready');
  }

  // Notification triggers
  setupNotificationTriggers() {
    console.log('🔔 Notification automation triggers ready');
  }

  // Helper methods to trigger automation events from existing code

  // Order Events
  async triggerOrderPlaced(orderData, context) {
    await automationEngine.processEvent('ORDER_PLACED', orderData, context);
  }

  async triggerOrderStatusChanged(orderData, context) {
    await automationEngine.processEvent('ORDER_STATUS_CHANGED', orderData, context);
  }

  async triggerOrderDelayed(orderData, context) {
    await automationEngine.processEvent('ORDER_DELAYED', orderData, context);
  }

  async triggerOrderCompleted(orderData, context) {
    await automationEngine.processEvent('ORDER_COMPLETED', orderData, context);
  }

  // Payment Events
  async triggerPaymentReceived(paymentData, context) {
    await automationEngine.processEvent('PAYMENT_RECEIVED', paymentData, context);
  }

  async triggerPaymentFailed(paymentData, context) {
    await automationEngine.processEvent('PAYMENT_FAILED', paymentData, context);
  }

  async triggerPaymentOverdue(paymentData, context) {
    await automationEngine.processEvent('PAYMENT_OVERDUE', paymentData, context);
  }

  // Subscription Events (Platform Level)
  async triggerSubscriptionExpiring(subscriptionData, context) {
    await automationEngine.processEvent('SUBSCRIPTION_EXPIRING', subscriptionData, context);
  }

  async triggerSubscriptionExpired(subscriptionData, context) {
    await automationEngine.processEvent('SUBSCRIPTION_EXPIRED', subscriptionData, context);
  }

  async triggerSubscriptionUpgraded(subscriptionData, context) {
    await automationEngine.processEvent('SUBSCRIPTION_UPGRADED', subscriptionData, context);
  }

  async triggerSubscriptionDowngraded(subscriptionData, context) {
    await automationEngine.processEvent('SUBSCRIPTION_DOWNGRADED', subscriptionData, context);
  }

  // User Events
  async triggerUserRegistered(userData, context) {
    await automationEngine.processEvent('USER_REGISTERED', userData, context);
  }

  async triggerUserInactive(userData, context) {
    await automationEngine.processEvent('USER_INACTIVE', userData, context);
  }

  async triggerUserLoginFailed(userData, context) {
    await automationEngine.processEvent('USER_LOGIN_FAILED', userData, context);
  }

  // Tenant Events (Platform Level)
  async triggerTenantCreated(tenantData, context) {
    await automationEngine.processEvent('TENANT_CREATED', tenantData, context);
  }

  async triggerTenantInactive(tenantData, context) {
    await automationEngine.processEvent('TENANT_INACTIVE', tenantData, context);
  }

  async triggerTenantExceededLimits(tenantData, context) {
    await automationEngine.processEvent('TENANT_EXCEEDED_LIMITS', tenantData, context);
  }

  async triggerTenantSLABreach(tenantData, context) {
    await automationEngine.processEvent('TENANT_SLA_BREACH', tenantData, context);
  }

  // Time-based Events
  async triggerScheduledEvent(eventType, eventData, context) {
    await automationEngine.processEvent(eventType, eventData, context);
  }

  // Custom Events
  async triggerCustomEvent(eventType, eventData, context) {
    await automationEngine.processEvent(eventType, eventData, context);
  }

  // Utility method to create context from request
  createContext(req, additionalContext = {}) {
    const baseContext = {
      userId: req.user?._id,
      tenantId: req.user?.tenantId || req.tenancy?._id,
      userRole: req.user?.role,
      timestamp: new Date(),
      source: 'api_request'
    };

    return { ...baseContext, ...additionalContext };
  }

  // Method to add automation trigger to existing controllers
  // Usage: automationTriggers.addToController(orderController, 'createOrder', 'ORDER_PLACED')
  addToController(controller, methodName, eventType) {
    const originalMethod = controller[methodName];
    
    controller[methodName] = async function(...args) {
      // Call original method
      const result = await originalMethod.apply(this, args);
      
      // Extract request and response
      const req = args[0];
      const res = args[1];
      
      // Trigger automation if request was successful
      if (res.statusCode < 400) {
        const context = this.createContext(req);
        const eventData = result.data || result;
        
        await automationEngine.processEvent(eventType, eventData, context);
      }
      
      return result;
    }.bind(this);
  }
}

// Export singleton instance
module.exports = new AutomationTriggers();