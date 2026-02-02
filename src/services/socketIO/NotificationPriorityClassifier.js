/**
 * Notification Priority Classifier
 * Intelligently classifies notifications into priority levels (P0-P4)
 * Part of the Socket.IO Notification Engine
 */

class NotificationPriorityClassifier {
  constructor() {
    this.isInitialized = false;
    this.priorityRules = new Map();
    this.keywordWeights = new Map();
    this.contextualFactors = new Map();
    
    console.log('🎯 Notification Priority Classifier initialized');
  }

  /**
   * Initialize the classifier with rules and weights
   */
  async initialize() {
    try {
      this.setupPriorityRules();
      this.setupKeywordWeights();
      this.setupContextualFactors();
      
      this.isInitialized = true;
      console.log('✅ Notification Priority Classifier ready');
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Priority Classifier:', error);
      return false;
    }
  }

  /**
   * Setup priority classification rules
   */
  setupPriorityRules() {
    // P0 - Critical System Alerts (Immediate Action Required)
    this.priorityRules.set('P0', {
      types: [
        'system_critical_error',
        'security_breach',
        'payment_failure_critical',
        'data_corruption',
        'service_outage',
        'emergency_shutdown'
      ],
      keywords: [
        'critical', 'emergency', 'urgent', 'immediate', 'security breach',
        'system down', 'data loss', 'payment failed', 'error critical',
        'service unavailable', 'breach detected', 'corruption detected'
      ],
      conditions: {
        requiresImmediateAction: true,
        affectsMultipleUsers: true,
        businessImpact: 'critical'
      }
    });

    // P1 - High Priority Business Operations
    this.priorityRules.set('P1', {
      types: [
        'order_stuck',
        'payment_pending_urgent',
        'customer_complaint_escalated',
        'inventory_critical_low',
        'machine_breakdown',
        'staff_emergency',
        'addon_purchase_failed',
        'subscription_expired'
      ],
      keywords: [
        'stuck', 'failed', 'breakdown', 'complaint', 'escalated',
        'critical low', 'emergency', 'expired', 'overdue',
        'payment pending', 'addon failed', 'subscription issue'
      ],
      conditions: {
        requiresAction: true,
        timeframe: '< 1 hour',
        businessImpact: 'high'
      }
    });

    // P2 - Medium Priority Operations
    this.priorityRules.set('P2', {
      types: [
        'order_delayed',
        'pickup_scheduled',
        'delivery_scheduled',
        'payment_reminder',
        'inventory_low',
        'customer_feedback',
        'addon_activated',
        'feature_update',
        'maintenance_scheduled'
      ],
      keywords: [
        'delayed', 'scheduled', 'reminder', 'low stock', 'feedback',
        'activated', 'updated', 'maintenance', 'pickup ready',
        'delivery ready', 'payment due'
      ],
      conditions: {
        requiresAction: true,
        timeframe: '< 4 hours',
        businessImpact: 'medium'
      }
    });

    // P3 - Low Priority Informational
    this.priorityRules.set('P3', {
      types: [
        'order_status_update',
        'general_notification',
        'system_update',
        'feature_announcement',
        'promotional_message',
        'newsletter',
        'tips_and_tricks',
        'addon_recommendation'
      ],
      keywords: [
        'update', 'announcement', 'promotion', 'newsletter',
        'tips', 'recommendation', 'status', 'information',
        'new feature', 'improvement'
      ],
      conditions: {
        requiresAction: false,
        timeframe: '< 24 hours',
        businessImpact: 'low'
      }
    });

    // P4 - Background/Audit
    this.priorityRules.set('P4', {
      types: [
        'audit_log',
        'system_log',
        'background_task',
        'data_sync',
        'backup_complete',
        'cleanup_complete',
        'analytics_update'
      ],
      keywords: [
        'log', 'audit', 'background', 'sync', 'backup',
        'cleanup', 'analytics', 'completed', 'processed'
      ],
      conditions: {
        requiresAction: false,
        timeframe: 'no limit',
        businessImpact: 'minimal'
      }
    });
  }

  /**
   * Setup keyword weights for scoring
   */
  setupKeywordWeights() {
    // Critical keywords (highest weight)
    const criticalKeywords = [
      'critical', 'emergency', 'urgent', 'immediate', 'security',
      'breach', 'down', 'failure', 'error', 'corruption'
    ];
    criticalKeywords.forEach(keyword => {
      this.keywordWeights.set(keyword, 100);
    });

    // High priority keywords
    const highKeywords = [
      'stuck', 'failed', 'breakdown', 'escalated', 'overdue',
      'expired', 'pending', 'complaint', 'issue'
    ];
    highKeywords.forEach(keyword => {
      this.keywordWeights.set(keyword, 75);
    });

    // Medium priority keywords
    const mediumKeywords = [
      'delayed', 'scheduled', 'reminder', 'low', 'feedback',
      'activated', 'maintenance', 'ready'
    ];
    mediumKeywords.forEach(keyword => {
      this.keywordWeights.set(keyword, 50);
    });

    // Low priority keywords
    const lowKeywords = [
      'update', 'announcement', 'promotion', 'newsletter',
      'tips', 'recommendation', 'information'
    ];
    lowKeywords.forEach(keyword => {
      this.keywordWeights.set(keyword, 25);
    });

    // Background keywords (lowest weight)
    const backgroundKeywords = [
      'log', 'audit', 'background', 'sync', 'backup',
      'cleanup', 'analytics', 'completed'
    ];
    backgroundKeywords.forEach(keyword => {
      this.keywordWeights.set(keyword, 10);
    });
  }

  /**
   * Setup contextual factors that influence priority
   */
  setupContextualFactors() {
    this.contextualFactors.set('timeOfDay', {
      'business_hours': 1.2,    // 9 AM - 6 PM
      'extended_hours': 1.0,    // 6 PM - 10 PM
      'night_hours': 0.8,       // 10 PM - 9 AM
      'weekend': 0.9
    });

    this.contextualFactors.set('userType', {
      'superadmin': 1.3,
      'platform_support': 1.2,
      'platform_finance': 1.2,
      'platform_auditor': 1.1,
      'tenant_admin': 1.0,
      'tenant_ops_manager': 1.0,
      'tenant_staff': 0.9,
      'customer': 0.8
    });

    this.contextualFactors.set('tenancyTier', {
      'enterprise': 1.3,
      'premium': 1.2,
      'standard': 1.0,
      'basic': 0.9,
      'trial': 0.8
    });

    this.contextualFactors.set('businessImpact', {
      'revenue_affecting': 1.4,
      'customer_facing': 1.2,
      'operational': 1.0,
      'administrative': 0.8,
      'informational': 0.6
    });
  }

  /**
   * Classify notification priority
   */
  async classifyNotification(notification) {
    try {
      if (!this.isInitialized) {
        console.warn('⚠️ Priority Classifier not initialized, using default priority');
        return 'P3';
      }

      // Calculate base priority score
      let baseScore = this.calculateBaseScore(notification);
      
      // Apply contextual factors
      const contextualScore = this.applyContextualFactors(notification, baseScore);
      
      // Determine final priority
      const priority = this.scoreToPriority(contextualScore);
      
      console.log(`🎯 Notification classified: ${notification.type || 'unknown'} -> ${priority} (score: ${contextualScore})`);
      
      return priority;
      
    } catch (error) {
      console.error('❌ Error classifying notification priority:', error);
      return 'P3'; // Default to medium-low priority on error
    }
  }

  /**
   * Calculate base priority score from notification content
   */
  calculateBaseScore(notification) {
    let score = 0;
    
    // Type-based scoring
    const typeScore = this.getTypeScore(notification.type);
    score += typeScore;
    
    // Keyword-based scoring
    const keywordScore = this.getKeywordScore(notification);
    score += keywordScore;
    
    // Severity-based scoring
    const severityScore = this.getSeverityScore(notification.severity);
    score += severityScore;
    
    // Data-based scoring
    const dataScore = this.getDataScore(notification.data);
    score += dataScore;
    
    return Math.max(0, Math.min(100, score)); // Clamp between 0-100
  }

  /**
   * Get score based on notification type
   */
  getTypeScore(type) {
    if (!type) return 25; // Default score
    
    for (const [priority, rules] of this.priorityRules) {
      if (rules.types.includes(type)) {
        switch (priority) {
          case 'P0': return 90;
          case 'P1': return 70;
          case 'P2': return 50;
          case 'P3': return 30;
          case 'P4': return 10;
        }
      }
    }
    
    return 25; // Default if type not found
  }

  /**
   * Get score based on keywords in title and message
   */
  getKeywordScore(notification) {
    let score = 0;
    const text = `${notification.title || ''} ${notification.message || ''}`.toLowerCase();
    
    for (const [keyword, weight] of this.keywordWeights) {
      if (text.includes(keyword)) {
        score += weight;
      }
    }
    
    return Math.min(score, 80); // Cap keyword score at 80
  }

  /**
   * Get score based on severity level
   */
  getSeverityScore(severity) {
    const severityMap = {
      'critical': 80,
      'error': 60,
      'warning': 40,
      'info': 20,
      'success': 15
    };
    
    return severityMap[severity] || 20;
  }

  /**
   * Get score based on notification data
   */
  getDataScore(data) {
    if (!data || typeof data !== 'object') return 0;
    
    let score = 0;
    
    // Check for priority indicators in data
    if (data.priority) {
      const priorityMap = {
        'critical': 30,
        'high': 20,
        'medium': 10,
        'low': 5
      };
      score += priorityMap[data.priority] || 0;
    }
    
    // Check for urgency indicators
    if (data.urgent === true) score += 25;
    if (data.requiresAction === true) score += 15;
    if (data.businessCritical === true) score += 20;
    
    // Check for impact indicators
    if (data.affectedUsers && data.affectedUsers > 10) score += 15;
    if (data.revenueImpact && data.revenueImpact > 0) score += 20;
    
    return Math.min(score, 40); // Cap data score at 40
  }

  /**
   * Apply contextual factors to base score
   */
  applyContextualFactors(notification, baseScore) {
    let multiplier = 1.0;
    
    // Time of day factor
    const timeMultiplier = this.getTimeOfDayMultiplier();
    multiplier *= timeMultiplier;
    
    // User type factor
    if (notification.recipientType) {
      const userTypeMultiplier = this.contextualFactors.get('userType')[notification.recipientType] || 1.0;
      multiplier *= userTypeMultiplier;
    }
    
    // Tenancy tier factor
    if (notification.tenancyTier) {
      const tenancyMultiplier = this.contextualFactors.get('tenancyTier')[notification.tenancyTier] || 1.0;
      multiplier *= tenancyMultiplier;
    }
    
    // Business impact factor
    if (notification.businessImpact) {
      const impactMultiplier = this.contextualFactors.get('businessImpact')[notification.businessImpact] || 1.0;
      multiplier *= impactMultiplier;
    }
    
    return Math.round(baseScore * multiplier);
  }

  /**
   * Get time of day multiplier
   */
  getTimeOfDayMultiplier() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Weekend check
    if (day === 0 || day === 6) {
      return this.contextualFactors.get('timeOfDay')['weekend'];
    }
    
    // Business hours (9 AM - 6 PM)
    if (hour >= 9 && hour < 18) {
      return this.contextualFactors.get('timeOfDay')['business_hours'];
    }
    
    // Extended hours (6 PM - 10 PM)
    if (hour >= 18 && hour < 22) {
      return this.contextualFactors.get('timeOfDay')['extended_hours'];
    }
    
    // Night hours (10 PM - 9 AM)
    return this.contextualFactors.get('timeOfDay')['night_hours'];
  }

  /**
   * Convert score to priority level
   */
  scoreToPriority(score) {
    if (score >= 80) return 'P0';  // Critical
    if (score >= 60) return 'P1';  // High
    if (score >= 40) return 'P2';  // Medium
    if (score >= 20) return 'P3';  // Low
    return 'P4';                   // Background
  }

  /**
   * Get priority description
   */
  getPriorityDescription(priority) {
    const descriptions = {
      'P0': 'Critical - Immediate action required',
      'P1': 'High - Action required within 1 hour',
      'P2': 'Medium - Action required within 4 hours',
      'P3': 'Low - Informational, action within 24 hours',
      'P4': 'Background - Audit/logging purposes'
    };
    
    return descriptions[priority] || 'Unknown priority level';
  }

  /**
   * Get priority color for UI
   */
  getPriorityColor(priority) {
    const colors = {
      'P0': '#FF0000', // Red
      'P1': '#FF6600', // Orange
      'P2': '#FFAA00', // Yellow-Orange
      'P3': '#0066FF', // Blue
      'P4': '#666666'  // Gray
    };
    
    return colors[priority] || '#666666';
  }

  /**
   * Batch classify multiple notifications
   */
  async batchClassify(notifications) {
    try {
      const results = [];
      
      for (const notification of notifications) {
        const priority = await this.classifyNotification(notification);
        results.push({
          ...notification,
          priority,
          priorityDescription: this.getPriorityDescription(priority),
          priorityColor: this.getPriorityColor(priority)
        });
      }
      
      return results;
      
    } catch (error) {
      console.error('❌ Error in batch classification:', error);
      return notifications.map(n => ({ ...n, priority: 'P3' }));
    }
  }

  /**
   * Update classification rules (for admin configuration)
   */
  updateRules(newRules) {
    try {
      if (newRules.priorityRules) {
        this.priorityRules = new Map(Object.entries(newRules.priorityRules));
      }
      
      if (newRules.keywordWeights) {
        this.keywordWeights = new Map(Object.entries(newRules.keywordWeights));
      }
      
      if (newRules.contextualFactors) {
        this.contextualFactors = new Map(Object.entries(newRules.contextualFactors));
      }
      
      console.log('✅ Priority classification rules updated');
      return true;
      
    } catch (error) {
      console.error('❌ Error updating classification rules:', error);
      return false;
    }
  }

  /**
   * Get classifier statistics
   */
  getStatistics() {
    return {
      totalRules: this.priorityRules.size,
      totalKeywords: this.keywordWeights.size,
      contextualFactors: this.contextualFactors.size,
      isInitialized: this.isInitialized
    };
  }

  /**
   * Get classifier status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      component: 'NotificationPriorityClassifier',
      version: '1.0.0',
      statistics: this.getStatistics()
    };
  }
}

module.exports = NotificationPriorityClassifier;