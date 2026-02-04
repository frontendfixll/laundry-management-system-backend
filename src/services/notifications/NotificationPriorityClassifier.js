/**
 * NotificationPriorityClassifier - P0-P4 priority classification system
 * Part of the Socket.IO Notification Engine Implementation
 */

const { NotificationAuditLogger } = require('./NotificationAuditLogger');

class NotificationPriorityClassifier {
  constructor() {
    this.auditLogger = new NotificationAuditLogger();

    // Priority classification rules
    this.priorityRules = {
      // P0 - Critical (Immediate action required)
      P0: {
        events: [
          'payment_mismatch',
          'security_breach',
          'security_alert',
          'cross_tenant_access_detected',
          'account_locked',
          'system_critical_error',
          'data_corruption_detected',
          'unauthorized_admin_access',
          'payment_fraud_detected',
          'new_tenancy_signup',
          'tenancy_payment_received'
        ],
        keywords: ['critical', 'security', 'breach', 'fraud', 'corruption'],
        conditions: {
          amountThreshold: 10000, // High value transactions
          securityLevel: 'critical'
        }
      },

      // P1 - High (Action needed within hours)
      P1: {
        events: [
          'payment_failed',
          'order_stuck',
          'subscription_expired',
          'permission_revoked',
          'permissions_revoked',
          'permission_granted',
          'tenancy_permissions_updated',
          'tenancy_features_updated',
          'account_locked',
          'refund_failed',
          'integration_failure',
          'new_lead',
          'tenancy_subscription_expiring'
        ],
        keywords: ['failed', 'stuck', 'expired', 'suspended', 'locked'],
        conditions: {
          amountThreshold: 1000,
          businessImpact: 'high'
        }
      },

      // P2 - Medium (Action needed within days)
      P2: {
        events: [
          'order_updated',
          'pickup_scheduled',
          'refund_initiated',
          'subscription_renewal',
          'payment_reminder',
          'service_update',
          'feature_enabled',
          'addon_purchased'
        ],
        keywords: ['updated', 'scheduled', 'initiated', 'reminder'],
        conditions: {
          amountThreshold: 100,
          businessImpact: 'medium'
        }
      },

      // P3 - Low (Informational, no urgency)
      P3: {
        events: [
          'welcome_message',
          'report_generated',
          'marketing_update',
          'newsletter',
          'feature_announcement',
          'maintenance_notice',
          'survey_invitation'
        ],
        keywords: ['welcome', 'report', 'marketing', 'announcement'],
        conditions: {
          businessImpact: 'low'
        }
      },

      // P4 - Silent (System logs, no user notification)
      P4: {
        events: [
          'system_log',
          'background_job_completed',
          'cache_cleared',
          'backup_completed',
          'analytics_processed',
          'cleanup_job_finished'
        ],
        keywords: ['log', 'background', 'cache', 'backup', 'cleanup'],
        conditions: {
          systemOnly: true
        }
      }
    };

    // Event-specific priority overrides
    this.eventPriorityMap = new Map([
      // Critical overrides
      ['payment_mismatch', 'P0'],
      ['security_breach', 'P0'],
      ['security_alert', 'P0'],
      ['account_locked', 'P0'],
      ['cross_tenant_access_detected', 'P0'],
      ['new_tenancy_signup', 'P1'],
      ['tenancy_payment_received', 'P1'],

      // High priority overrides
      ['payment_failed', 'P1'],
      ['order_stuck', 'P1'],
      ['subscription_expired', 'P1'],

      // Context-dependent events (will use classifier logic)
      ['order_updated', null],
      ['orderStatusUpdated', 'P2'],
      ['customer_updated', 'P2'],
      ['new_lead', 'P2'],
      ['tenancy_subscription_expiring', 'P2'],
      ['payment_reminder', null],
      ['feature_enabled', null]
    ]);

    // Role-based priority adjustments
    this.rolePriorityAdjustments = {
      'superadmin': {
        'system_error': 'P0',
        'tenant_issue': 'P1',
        'user_complaint': 'P2'
      },
      'tenant_admin': {
        'order_issue': 'P1',
        'payment_issue': 'P1',
        'user_complaint': 'P2'
      },
      'tenant_user': {
        'order_update': 'P2',
        'payment_update': 'P2'
      }
    };
  }

  /**
   * Classify notification priority based on event and context
   */
  async classifyPriority(eventType, context = {}) {
    try {
      // Check for explicit priority override
      if (this.eventPriorityMap.has(eventType)) {
        const explicitPriority = this.eventPriorityMap.get(eventType);
        if (explicitPriority) {
          await this.auditLogger.log({
            action: 'priority_classified',
            eventType,
            priority: explicitPriority,
            method: 'explicit_override'
          });
          return explicitPriority;
        }
      }

      // Apply classification logic
      const priority = await this.applyClassificationLogic(eventType, context);

      // Apply role-based adjustments
      const adjustedPriority = this.applyRoleAdjustments(priority, context);

      // Apply contextual modifiers
      const finalPriority = this.applyContextualModifiers(adjustedPriority, context);

      await this.auditLogger.log({
        action: 'priority_classified',
        eventType,
        priority: finalPriority,
        originalPriority: priority,
        context: this.sanitizeContext(context),
        method: 'classification_logic'
      });

      return finalPriority;

    } catch (error) {
      console.error('❌ Error classifying priority:', error);

      // Default to P2 (medium) on error
      await this.auditLogger.log({
        action: 'priority_classification_failed',
        eventType,
        error: error.message,
        defaultPriority: 'P2'
      });

      return 'P2';
    }
  }

  /**
   * Apply main classification logic
   */
  async applyClassificationLogic(eventType, context) {
    // Check each priority level
    for (const [priority, rules] of Object.entries(this.priorityRules)) {
      if (this.matchesEventType(eventType, rules.events)) {
        return priority;
      }

      if (this.matchesKeywords(eventType, context, rules.keywords)) {
        return priority;
      }

      if (await this.matchesConditions(context, rules.conditions)) {
        return priority;
      }
    }

    // Default classification based on context
    return this.getDefaultPriority(context);
  }

  /**
   * Check if event type matches priority rules
   */
  matchesEventType(eventType, ruleEvents) {
    return ruleEvents.includes(eventType);
  }

  /**
   * Check if keywords match in event type or context
   */
  matchesKeywords(eventType, context, keywords) {
    const searchText = `${eventType} ${context.title || ''} ${context.message || ''}`.toLowerCase();

    return keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
  }

  /**
   * Check if context matches priority conditions
   */
  async matchesConditions(context, conditions) {
    // Amount threshold check
    if (conditions.amountThreshold && context.amount) {
      if (context.amount >= conditions.amountThreshold) {
        return true;
      }
    }

    // Security level check
    if (conditions.securityLevel && context.securityLevel) {
      if (context.securityLevel === conditions.securityLevel) {
        return true;
      }
    }

    // Business impact check
    if (conditions.businessImpact && context.businessImpact) {
      if (context.businessImpact === conditions.businessImpact) {
        return true;
      }
    }

    // System only check
    if (conditions.systemOnly && context.systemOnly) {
      return true;
    }

    return false;
  }

  /**
   * Apply role-based priority adjustments
   */
  applyRoleAdjustments(priority, context) {
    if (!context.recipientRole) {
      return priority;
    }

    const roleAdjustments = this.rolePriorityAdjustments[context.recipientRole];
    if (!roleAdjustments) {
      return priority;
    }

    // Check for specific event type adjustments
    for (const [eventPattern, adjustedPriority] of Object.entries(roleAdjustments)) {
      if (context.eventType && context.eventType.includes(eventPattern)) {
        return adjustedPriority;
      }
    }

    return priority;
  }

  /**
   * Apply contextual modifiers
   */
  applyContextualModifiers(priority, context) {
    let modifiedPriority = priority;

    // Time-sensitive events
    if (context.isTimeSensitive) {
      modifiedPriority = this.increasePriority(modifiedPriority);
    }

    // High-value customer
    if (context.isHighValueCustomer) {
      modifiedPriority = this.increasePriority(modifiedPriority);
    }

    // Repeat occurrence
    if (context.isRepeatOccurrence) {
      modifiedPriority = this.increasePriority(modifiedPriority);
    }

    // Off-hours (decrease priority for non-critical)
    if (context.isOffHours && !['P0', 'P1'].includes(modifiedPriority)) {
      modifiedPriority = this.decreasePriority(modifiedPriority);
    }

    return modifiedPriority;
  }

  /**
   * Get default priority based on context
   */
  getDefaultPriority(context) {
    // System events default to P4
    if (context.systemOnly) {
      return 'P4';
    }

    // User-facing events default to P3
    if (context.userFacing) {
      return 'P3';
    }

    // Admin events default to P2
    if (context.adminOnly) {
      return 'P2';
    }

    // Everything else defaults to P3
    return 'P3';
  }

  /**
   * Increase priority level
   */
  increasePriority(priority) {
    const levels = ['P4', 'P3', 'P2', 'P1', 'P0'];
    const currentIndex = levels.indexOf(priority);

    if (currentIndex > 0) {
      return levels[currentIndex - 1];
    }

    return priority;
  }

  /**
   * Decrease priority level
   */
  decreasePriority(priority) {
    const levels = ['P0', 'P1', 'P2', 'P3', 'P4'];
    const currentIndex = levels.indexOf(priority);

    if (currentIndex < levels.length - 1) {
      return levels[currentIndex + 1];
    }

    return priority;
  }

  /**
   * Batch classify multiple events
   */
  async batchClassify(events) {
    const results = [];

    for (const event of events) {
      const priority = await this.classifyPriority(event.type, event.context);
      results.push({
        ...event,
        priority
      });
    }

    return results;
  }

  /**
   * Get priority statistics
   */
  async getPriorityStatistics(timeRange = '24h') {
    try {
      // This would query the audit logs for classification statistics
      const stats = {
        totalClassifications: 0,
        byPriority: {
          P0: 0,
          P1: 0,
          P2: 0,
          P3: 0,
          P4: 0
        },
        byMethod: {
          explicit_override: 0,
          classification_logic: 0,
          default: 0
        },
        averageClassificationTime: 0
      };

      return stats;

    } catch (error) {
      console.error('❌ Error getting priority statistics:', error);
      return null;
    }
  }

  /**
   * Update priority rules (for dynamic configuration)
   */
  updatePriorityRules(newRules) {
    try {
      // Validate new rules structure
      this.validateRulesStructure(newRules);

      // Merge with existing rules
      this.priorityRules = { ...this.priorityRules, ...newRules };

      console.log('✅ Priority rules updated successfully');

      this.auditLogger.log({
        action: 'priority_rules_updated',
        metadata: { rulesCount: Object.keys(newRules).length }
      });

      return true;

    } catch (error) {
      console.error('❌ Error updating priority rules:', error);
      return false;
    }
  }

  /**
   * Validate rules structure
   */
  validateRulesStructure(rules) {
    const requiredFields = ['events', 'keywords', 'conditions'];

    for (const [priority, rule] of Object.entries(rules)) {
      if (!['P0', 'P1', 'P2', 'P3', 'P4'].includes(priority)) {
        throw new Error(`Invalid priority level: ${priority}`);
      }

      for (const field of requiredFields) {
        if (!(field in rule)) {
          throw new Error(`Missing required field '${field}' in priority ${priority}`);
        }
      }
    }
  }

  /**
   * Sanitize context for logging (remove sensitive data)
   */
  sanitizeContext(context) {
    const sanitized = { ...context };

    // Remove sensitive fields
    delete sanitized.password;
    delete sanitized.token;
    delete sanitized.apiKey;
    delete sanitized.creditCard;

    // Mask amounts over threshold
    if (sanitized.amount && sanitized.amount > 1000) {
      sanitized.amount = '***MASKED***';
    }

    return sanitized;
  }

  /**
   * Test priority classification
   */
  async testClassification(testCases) {
    const results = [];

    for (const testCase of testCases) {
      const startTime = Date.now();
      const priority = await this.classifyPriority(testCase.eventType, testCase.context);
      const duration = Date.now() - startTime;

      results.push({
        ...testCase,
        actualPriority: priority,
        expectedPriority: testCase.expectedPriority,
        passed: priority === testCase.expectedPriority,
        duration
      });
    }

    return results;
  }
}

module.exports = { NotificationPriorityClassifier };