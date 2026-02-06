const AutomationRule = require('../models/AutomationRule');
const EventEmitter = require('events');

class AutomationEngine extends EventEmitter {
  constructor() {
    super();
    this.rules = new Map();
    this.isRunning = false;
    this.executionQueue = [];
    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0
    };

    // Initialize with existing Socket.IO notification engine
    this.notificationEngine = null;

    console.log('🤖 Automation Engine initialized');
  }

  // Initialize with existing notification engine
  initialize(notificationEngine) {
    this.notificationEngine = notificationEngine;
    this.isRunning = true;
    console.log('✅ Automation Engine connected to notification system');

    // Load active rules from database
    this.loadActiveRules();

    // Start processing queue
    this.startQueueProcessor();

    return this;
  }

  // Load active rules from database
  async loadActiveRules() {
    try {
      const activeRules = await AutomationRule.find({ isActive: true });

      for (const rule of activeRules) {
        this.rules.set(rule.ruleId, rule);
      }

      console.log(`📋 Loaded ${activeRules.length} active automation rules`);
    } catch (error) {
      console.error('❌ Error loading automation rules:', error);
    }
  }

  // Register a new automation rule
  async registerRule(ruleData) {
    try {
      // Validate rule data
      this.validateRule(ruleData);

      // Save to database
      const rule = new AutomationRule(ruleData);
      await rule.save();

      // Add to memory cache
      this.rules.set(rule.ruleId, rule);

      console.log(`✅ Automation rule registered: ${rule.name} (${rule.ruleId})`);

      // Emit rule registered event
      this.emit('ruleRegistered', rule);

      return rule;
    } catch (error) {
      console.error('❌ Error registering automation rule:', error);
      throw error;
    }
  }

  // Process an event through automation rules
  async processEvent(eventType, eventData, context = {}) {
    if (!this.isRunning) {
      console.log('⚠️ Automation Engine not running, skipping event processing');
      return;
    }

    const startTime = Date.now();

    try {
      // Find matching rules
      const matchingRules = this.findMatchingRules(eventType, eventData, context);

      if (matchingRules.length === 0) {
        console.log(`📭 No automation rules match event: ${eventType}`);
        return;
      }

      console.log(`🎯 Found ${matchingRules.length} matching rules for event: ${eventType}`);

      // Execute matching rules
      for (const rule of matchingRules) {
        await this.executeRule(rule, eventData, context);
      }

      // Update stats
      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

    } catch (error) {
      console.error('❌ Error processing automation event:', error);
      this.updateStats(false, Date.now() - startTime);
    }
  }

  // Find rules that match the event
  findMatchingRules(eventType, eventData, context) {
    const matchingRules = [];

    for (const [ruleId, rule] of this.rules) {
      if (!rule.isActive) continue;

      // Check event type match
      if (rule.trigger.eventType !== eventType) continue;

      // Check scope-based filtering
      if (!this.checkRuleScope(rule, context)) continue;

      // Check trigger conditions
      if (this.evaluateConditions(rule.trigger.conditions, eventData, context)) {
        matchingRules.push(rule);
      }
    }

    // Sort by priority (higher priority first)
    return matchingRules.sort((a, b) => (b.priority || 1) - (a.priority || 1));
  }

  // Check if rule scope matches context
  checkRuleScope(rule, context) {
    if (rule.scope === 'PLATFORM') {
      // Platform rules can run for any context
      return true;
    }

    if (rule.scope === 'TENANT') {
      // Tenant rules must match tenantId
      return rule.tenantId && rule.tenantId.toString() === context.tenantId;
    }

    return false;
  }

  // Evaluate rule conditions
  evaluateConditions(conditions, eventData, context) {
    if (!conditions || Object.keys(conditions).length === 0) {
      return true; // No conditions means always match
    }

    try {
      // Simple condition evaluation
      for (const [key, expectedValue] of Object.entries(conditions)) {
        const actualValue = this.getNestedValue(eventData, key) || this.getNestedValue(context, key);

        if (!this.compareValues(actualValue, expectedValue)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('❌ Error evaluating conditions:', error);
      return false;
    }
  }

  // Execute a single automation rule
  async executeRule(rule, eventData, context) {
    const executionId = `${rule.ruleId}-${Date.now()}`;

    try {
      console.log(`🚀 Executing automation rule: ${rule.name} (${executionId})`);

      // Update execution count
      rule.executionCount = (rule.executionCount || 0) + 1;
      rule.lastExecuted = new Date();
      await rule.save();

      // Execute each action in the rule
      for (const action of rule.actions) {
        await this.executeAction(action, eventData, context, rule);
      }

      // Log successful execution
      await this.logExecution(rule, eventData, context, 'SUCCESS', executionId);

      console.log(`✅ Rule executed successfully: ${rule.name}`);

    } catch (error) {
      console.error(`❌ Error executing rule ${rule.name}:`, error);
      await this.logExecution(rule, eventData, context, 'FAILED', executionId, error.message);
    }
  }

  // Execute a single action
  async executeAction(action, eventData, context, rule) {
    const { type, config, delay = 0 } = action;

    // Apply delay if specified
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    switch (type) {
      case 'SEND_NOTIFICATION':
        await this.sendNotification(config, eventData, context, rule);
        break;

      case 'UPDATE_STATUS':
        await this.updateStatus(config, eventData, context, rule);
        break;

      case 'TRIGGER_WEBHOOK':
        await this.triggerWebhook(config, eventData, context, rule);
        break;

      case 'CREATE_TASK':
        await this.createTask(config, eventData, context, rule);
        break;

      case 'SEND_EMAIL':
        await this.sendEmail(config, eventData, context, rule);
        break;

      case 'LOCK_FEATURE':
        await this.lockFeature(config, eventData, context, rule);
        break;

      case 'UNLOCK_FEATURE':
        await this.unlockFeature(config, eventData, context, rule);
        break;

      default:
        console.warn(`⚠️ Unknown action type: ${type}`);
    }
  }

  // Action implementations
  async sendNotification(config, eventData, context, rule) {
    if (!this.notificationEngine) {
      console.warn('⚠️ Notification engine not available');
      return;
    }

    const notification = {
      title: this.interpolateString(config.title, eventData, context),
      message: this.interpolateString(config.message, eventData, context),
      type: config.notificationType || 'info',
      priority: config.priority || 'normal',
      targetUsers: config.targetUsers || [],
      recipientType: config.recipientType || (config.targetRole ? config.targetRole : null),
      tenantId: context.tenantId || eventData.tenantId,
      metadata: {
        source: 'automation',
        ruleId: rule.ruleId,
        ruleName: rule.name,
        ...config.metadata
      }
    };

    // Send via existing notification system
    try {
      // Handle role-based broadcasting if specified
      if (notification.recipientType) {
        console.log(`📡 Automation broadcasting to role: ${notification.recipientType}`);
        await this.notificationEngine.processNotification({
          tenantId: notification.tenantId,
          eventType: 'AUTOMATION_NOTIFICATION',
          title: notification.title,
          message: notification.message,
          category: 'automation',
          priority: notification.priority,
          metadata: {
            ...notification.metadata,
            recipientType: notification.recipientType
          }
        }, context);
      }

      // Handle specific user targeting
      if (notification.targetUsers.length > 0) {
        console.log(`📢 Automation sending to ${notification.targetUsers.length} users`);
        for (const userId of notification.targetUsers) {
          if (!userId) continue;

          await this.notificationEngine.processNotification({
            userId: userId,
            tenantId: notification.tenantId,
            eventType: 'AUTOMATION_NOTIFICATION',
            title: notification.title,
            message: notification.message,
            category: 'automation',
            priority: notification.priority,
            metadata: notification.metadata
          }, context);
        }
      }

      // Fallback if neither role nor users specified (target the person who triggered the event)
      if (!notification.recipientType && notification.targetUsers.length === 0 && context.userId) {
        console.log(`📢 Automation fallback: sending to trigger user ${context.userId}`);
        await this.notificationEngine.processNotification({
          userId: context.userId,
          tenantId: notification.tenantId,
          eventType: 'AUTOMATION_NOTIFICATION',
          title: notification.title,
          message: notification.message,
          category: 'automation',
          priority: notification.priority,
          metadata: notification.metadata
        }, context);
      }

      console.log(`✅ Automation notification processed for rule: ${rule.name}`);
    } catch (error) {
      console.error('❌ Failed to process automation notification:', error);
    }
  }

  async updateStatus(config, eventData, context, rule) {
    // Implementation for status updates
    console.log(`🔄 Status update: ${config.entity} -> ${config.status}`);
  }

  async triggerWebhook(config, eventData, context, rule) {
    // Implementation for webhook triggers
    console.log(`🔗 Webhook triggered: ${config.url}`);
  }

  async createTask(config, eventData, context, rule) {
    // Implementation for task creation
    console.log(`📝 Task created: ${config.title}`);
  }

  async sendEmail(config, eventData, context, rule) {
    try {
      const { sendEmail } = require('../config/email');

      const emailOptions = {
        to: this.interpolateString(config.to, eventData, context),
        subject: this.interpolateString(config.subject, eventData, context),
        html: this.interpolateString(config.message, eventData, context)
      };

      if (!emailOptions.to) {
        console.warn('⚠️ No recipient email for automation rule');
        return;
      }

      await sendEmail(emailOptions);
      console.log(`📧 Email sent: ${emailOptions.subject} to ${emailOptions.to}`);
    } catch (error) {
      console.error('❌ Failed to send automation email:', error);
    }
  }

  async lockFeature(config, eventData, context, rule) {
    // Implementation for feature locking (platform level)
    console.log(`🔒 Feature locked: ${config.feature} for tenant: ${context.tenantId}`);
  }

  async unlockFeature(config, eventData, context, rule) {
    // Implementation for feature unlocking (platform level)
    console.log(`🔓 Feature unlocked: ${config.feature} for tenant: ${context.tenantId}`);
  }

  // Utility methods
  validateRule(ruleData) {
    if (!ruleData.ruleId) throw new Error('Rule ID is required');
    if (!ruleData.name) throw new Error('Rule name is required');
    if (!ruleData.scope) throw new Error('Rule scope is required');
    if (!ruleData.trigger) throw new Error('Rule trigger is required');
    if (!ruleData.actions || !Array.isArray(ruleData.actions)) {
      throw new Error('Rule actions must be an array');
    }
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }

  compareValues(actual, expected) {
    if (typeof expected === 'object' && expected.operator) {
      const { operator, value } = expected;
      switch (operator) {
        case 'equals': return actual === value;
        case 'not_equals': return actual !== value;
        case 'greater_than': return actual > value;
        case 'less_than': return actual < value;
        case 'contains': return String(actual).includes(value);
        default: return actual === expected;
      }
    }
    return actual === expected;
  }

  interpolateString(template, eventData, context) {
    if (!template) return '';

    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
      return this.getNestedValue(eventData, path) ||
        this.getNestedValue(context, path) ||
        match;
    });
  }

  async logExecution(rule, eventData, context, status, executionId, error = null) {
    // Log to database or monitoring system
    const logEntry = {
      ruleId: rule.ruleId,
      ruleName: rule.name,
      executionId,
      status,
      eventData: JSON.stringify(eventData),
      context: JSON.stringify(context),
      error,
      executedAt: new Date()
    };

    console.log(`📊 Execution logged: ${rule.name} - ${status}`);
  }

  updateStats(success, executionTime) {
    this.stats.totalExecutions++;
    if (success) {
      this.stats.successfulExecutions++;
    } else {
      this.stats.failedExecutions++;
    }

    // Update average execution time
    this.stats.averageExecutionTime =
      (this.stats.averageExecutionTime + executionTime) / 2;
  }

  startQueueProcessor() {
    // Process queued executions
    setInterval(() => {
      if (this.executionQueue.length > 0) {
        const queuedExecution = this.executionQueue.shift();
        this.processEvent(
          queuedExecution.eventType,
          queuedExecution.eventData,
          queuedExecution.context
        );
      }
    }, 100); // Process every 100ms
  }

  // Public API methods
  getStats() {
    return {
      ...this.stats,
      activeRules: this.rules.size,
      isRunning: this.isRunning,
      queueLength: this.executionQueue.length
    };
  }

  async getRules(scope = null, tenantId = null) {
    const query = { isActive: true };
    if (scope) query.scope = scope;
    if (tenantId) query.tenantId = tenantId;

    return await AutomationRule.find(query);
  }

  async updateRule(ruleId, updates) {
    const rule = await AutomationRule.findOneAndUpdate(
      { ruleId },
      { ...updates, updatedAt: new Date() },
      { new: true }
    );

    if (rule) {
      this.rules.set(ruleId, rule);
      this.emit('ruleUpdated', rule);
    }

    return rule;
  }

  async deleteRule(ruleId) {
    await AutomationRule.findOneAndDelete({ ruleId });
    this.rules.delete(ruleId);
    this.emit('ruleDeleted', ruleId);
    console.log(`🗑️ Automation rule deleted: ${ruleId}`);
  }

  // Emergency stop
  stop() {
    this.isRunning = false;
    console.log('🛑 Automation Engine stopped');
  }

  start() {
    this.isRunning = true;
    console.log('▶️ Automation Engine started');
  }
}

// Export singleton instance
module.exports = new AutomationEngine();