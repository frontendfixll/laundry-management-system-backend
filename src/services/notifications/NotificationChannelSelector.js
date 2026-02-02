/**
 * NotificationChannelSelector - Channel escalation matrix
 * Part of the Socket.IO Notification Engine Implementation
 */

class NotificationChannelSelector {
  constructor() {
    // Channel escalation matrix based on priority
    this.escalationMatrix = {
      P0: ['in_app', 'email', 'sms', 'whatsapp', 'push'],
      P1: ['in_app', 'email', 'push'],
      P2: ['in_app', 'push'],
      P3: ['in_app'],
      P4: [] // Silent notifications
    };

    // Event-specific channel overrides
    this.eventChannelOverrides = {
      // Critical security events
      'security_breach': ['in_app', 'email', 'sms', 'push'],
      'unauthorized_access': ['in_app', 'email', 'sms', 'push'],
      'payment_fraud_detected': ['in_app', 'email', 'sms'],
      
      // Payment events
      'payment_failed': ['in_app', 'email', 'push'],
      'payment_received': ['in_app', 'push'],
      'refund_processed': ['in_app', 'email'],
      
      // Order events
      'order_delivered': ['in_app', 'sms', 'push'],
      'order_ready_for_pickup': ['in_app', 'sms', 'push'],
      'order_cancelled': ['in_app', 'email'],
      
      // System events
      'system_maintenance': ['in_app', 'email'],
      'feature_update': ['in_app'],
      'permission_updated': ['in_app'],
      
      // Marketing events
      'promotional_offer': ['in_app', 'push'],
      'loyalty_reward': ['in_app', 'push'],
      'campaign_notification': ['in_app']
    };

    // User preference defaults (would be loaded from database)
    this.defaultUserPreferences = {
      in_app: true,
      email: true,
      sms: false,
      whatsapp: false,
      push: true
    };

    // Business hours for channel restrictions
    this.businessHours = {
      start: 9, // 9 AM
      end: 21,  // 9 PM
      timezone: 'Asia/Kolkata'
    };
  }

  /**
   * Select appropriate channels for a notification
   */
  async selectChannels(notification, context = {}) {
    try {
      // 1. Get base channels from priority
      let selectedChannels = [...this.escalationMatrix[notification.priority]];

      // 2. Apply event-specific overrides
      if (this.eventChannelOverrides[notification.eventType]) {
        selectedChannels = this.eventChannelOverrides[notification.eventType];
      }

      // 3. Apply user preferences (if available)
      if (context.userPreferences) {
        selectedChannels = this.applyUserPreferences(selectedChannels, context.userPreferences);
      }

      // 4. Apply business hours restrictions
      selectedChannels = this.applyBusinessHoursRestrictions(selectedChannels, notification);

      // 5. Apply tenant-specific restrictions
      if (context.tenantSettings) {
        selectedChannels = this.applyTenantRestrictions(selectedChannels, context.tenantSettings);
      }

      // 6. Apply emergency overrides for critical notifications
      if (notification.priority === 'P0') {
        selectedChannels = this.applyEmergencyOverrides(selectedChannels, notification);
      }

      // 7. Ensure at least one channel is selected (fallback to in_app)
      if (selectedChannels.length === 0 && notification.priority !== 'P4') {
        selectedChannels = ['in_app'];
      }

      return selectedChannels;

    } catch (error) {
      console.error('❌ Error selecting notification channels:', error);
      // Fallback to in_app only
      return notification.priority !== 'P4' ? ['in_app'] : [];
    }
  }

  /**
   * Apply user preferences to channel selection
   */
  applyUserPreferences(channels, userPreferences) {
    return channels.filter(channel => {
      // Always allow in_app for critical notifications
      if (channel === 'in_app') return true;
      
      // Check user preference
      return userPreferences[channel] !== false;
    });
  }

  /**
   * Apply business hours restrictions
   */
  applyBusinessHoursRestrictions(channels, notification) {
    const now = new Date();
    const currentHour = now.getHours();
    
    // Check if it's outside business hours
    const isOutsideBusinessHours = currentHour < this.businessHours.start || 
                                   currentHour >= this.businessHours.end;

    if (isOutsideBusinessHours) {
      // Restrict SMS and WhatsApp outside business hours (unless P0)
      if (notification.priority !== 'P0') {
        return channels.filter(channel => !['sms', 'whatsapp'].includes(channel));
      }
    }

    return channels;
  }

  /**
   * Apply tenant-specific restrictions
   */
  applyTenantRestrictions(channels, tenantSettings) {
    if (!tenantSettings) return channels;

    return channels.filter(channel => {
      // Check if tenant has disabled this channel
      if (tenantSettings.disabledChannels && 
          tenantSettings.disabledChannels.includes(channel)) {
        return false;
      }

      // Check if tenant has specific channel limits
      if (tenantSettings.channelLimits && 
          tenantSettings.channelLimits[channel] === false) {
        return false;
      }

      return true;
    });
  }

  /**
   * Apply emergency overrides for P0 notifications
   */
  applyEmergencyOverrides(channels, notification) {
    // For P0 notifications, ensure critical channels are included
    const criticalChannels = ['in_app', 'email', 'push'];
    
    // Add critical channels if not already present
    criticalChannels.forEach(channel => {
      if (!channels.includes(channel)) {
        channels.push(channel);
      }
    });

    // For security events, also add SMS
    if (notification.eventType.includes('security') || 
        notification.eventType.includes('fraud')) {
      if (!channels.includes('sms')) {
        channels.push('sms');
      }
    }

    return channels;
  }

  /**
   * Get channel capabilities for a specific channel
   */
  getChannelCapabilities(channel) {
    const capabilities = {
      in_app: {
        realTime: true,
        richContent: true,
        acknowledgment: true,
        maxLength: 1000,
        supportsBinary: false,
        supportsMarkdown: true
      },
      email: {
        realTime: false,
        richContent: true,
        acknowledgment: false,
        maxLength: 10000,
        supportsBinary: true,
        supportsMarkdown: true,
        averageDeliveryTime: 30000 // 30 seconds
      },
      sms: {
        realTime: true,
        richContent: false,
        acknowledgment: false,
        maxLength: 160,
        supportsBinary: false,
        supportsMarkdown: false,
        averageDeliveryTime: 5000 // 5 seconds
      },
      whatsapp: {
        realTime: true,
        richContent: true,
        acknowledgment: true,
        maxLength: 4096,
        supportsBinary: true,
        supportsMarkdown: false,
        averageDeliveryTime: 3000 // 3 seconds
      },
      push: {
        realTime: true,
        richContent: false,
        acknowledgment: false,
        maxLength: 256,
        supportsBinary: false,
        supportsMarkdown: false,
        averageDeliveryTime: 2000 // 2 seconds
      }
    };

    return capabilities[channel] || null;
  }

  /**
   * Validate channel selection
   */
  validateChannelSelection(channels, notification) {
    const validation = {
      valid: true,
      warnings: [],
      errors: []
    };

    // Check if any channels are selected for non-P4 notifications
    if (channels.length === 0 && notification.priority !== 'P4') {
      validation.errors.push('No channels selected for non-silent notification');
      validation.valid = false;
    }

    // Check channel capabilities vs notification requirements
    channels.forEach(channel => {
      const capabilities = this.getChannelCapabilities(channel);
      
      if (!capabilities) {
        validation.errors.push(`Unknown channel: ${channel}`);
        validation.valid = false;
        return;
      }

      // Check message length
      if (notification.message && 
          notification.message.length > capabilities.maxLength) {
        validation.warnings.push(
          `Message too long for ${channel} (${notification.message.length}/${capabilities.maxLength})`
        );
      }

      // Check acknowledgment requirements
      if (notification.requiresAck && !capabilities.acknowledgment) {
        validation.warnings.push(
          `Channel ${channel} doesn't support acknowledgment but notification requires it`
        );
      }
    });

    return validation;
  }

  /**
   * Get recommended channels for an event type
   */
  getRecommendedChannels(eventType, priority = 'P3') {
    // Start with priority-based channels
    let recommended = [...this.escalationMatrix[priority]];

    // Apply event-specific recommendations
    if (this.eventChannelOverrides[eventType]) {
      recommended = this.eventChannelOverrides[eventType];
    }

    return {
      recommended,
      reasoning: this.getChannelRecommendationReasoning(eventType, priority),
      alternatives: this.getAlternativeChannels(recommended)
    };
  }

  /**
   * Get reasoning for channel recommendations
   */
  getChannelRecommendationReasoning(eventType, priority) {
    const reasoning = [];

    reasoning.push(`Priority ${priority} determines base channel selection`);

    if (this.eventChannelOverrides[eventType]) {
      reasoning.push(`Event type "${eventType}" has specific channel requirements`);
    }

    if (priority === 'P0') {
      reasoning.push('Critical priority ensures maximum channel coverage');
    }

    if (eventType.includes('security') || eventType.includes('fraud')) {
      reasoning.push('Security events require immediate multi-channel notification');
    }

    return reasoning;
  }

  /**
   * Get alternative channels
   */
  getAlternativeChannels(selectedChannels) {
    const allChannels = ['in_app', 'email', 'sms', 'whatsapp', 'push'];
    return allChannels.filter(channel => !selectedChannels.includes(channel));
  }

  /**
   * Update escalation matrix (for dynamic configuration)
   */
  updateEscalationMatrix(priority, channels) {
    if (!this.escalationMatrix[priority]) {
      throw new Error(`Invalid priority: ${priority}`);
    }

    this.escalationMatrix[priority] = channels;
    console.log(`📡 Updated escalation matrix for ${priority}:`, channels);
  }

  /**
   * Add event channel override
   */
  addEventChannelOverride(eventType, channels) {
    this.eventChannelOverrides[eventType] = channels;
    console.log(`📡 Added channel override for ${eventType}:`, channels);
  }

  /**
   * Get channel statistics
   */
  getChannelStatistics() {
    return {
      escalationMatrix: this.escalationMatrix,
      eventOverrides: Object.keys(this.eventChannelOverrides).length,
      supportedChannels: ['in_app', 'email', 'sms', 'whatsapp', 'push'],
      businessHours: this.businessHours
    };
  }

  /**
   * Test channel selection for debugging
   */
  async testChannelSelection(testCases) {
    const results = [];

    for (const testCase of testCases) {
      try {
        const channels = await this.selectChannels(testCase.notification, testCase.context);
        const validation = this.validateChannelSelection(channels, testCase.notification);
        
        results.push({
          testCase: testCase.name || 'Unnamed test',
          notification: {
            priority: testCase.notification.priority,
            eventType: testCase.notification.eventType
          },
          selectedChannels: channels,
          validation,
          success: validation.valid
        });

      } catch (error) {
        results.push({
          testCase: testCase.name || 'Unnamed test',
          error: error.message,
          success: false
        });
      }
    }

    return results;
  }
}

module.exports = { NotificationChannelSelector };