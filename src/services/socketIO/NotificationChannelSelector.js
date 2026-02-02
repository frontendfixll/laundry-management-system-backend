/**
 * Notification Channel Selector
 * Intelligently selects delivery channels based on priority and user preferences
 * Part of the Socket.IO Notification Engine
 */

class NotificationChannelSelector {
  constructor() {
    this.isInitialized = false;
    this.channelRules = new Map();
    this.userPreferences = new Map();
    this.channelCapabilities = new Map();
    
    console.log('📡 Notification Channel Selector initialized');
  }

  /**
   * Initialize the channel selector
   */
  async initialize() {
    try {
      this.setupChannelRules();
      this.setupChannelCapabilities();
      await this.loadUserPreferences();
      
      this.isInitialized = true;
      console.log('✅ Notification Channel Selector ready');
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Channel Selector:', error);
      return false;
    }
  }

  /**
   * Setup channel selection rules based on priority
   */
  setupChannelRules() {
    // P0 - Critical: All available channels
    this.channelRules.set('P0', {
      required: ['inApp', 'push', 'email'],
      optional: ['sms', 'webhook'],
      fallback: ['inApp'],
      retryCount: 3,
      retryDelay: 30000 // 30 seconds
    });

    // P1 - High: Multiple channels with fallback
    this.channelRules.set('P1', {
      required: ['inApp', 'push'],
      optional: ['email'],
      fallback: ['inApp'],
      retryCount: 2,
      retryDelay: 60000 // 1 minute
    });

    // P2 - Medium: Primary channels
    this.channelRules.set('P2', {
      required: ['inApp'],
      optional: ['push', 'email'],
      fallback: ['inApp'],
      retryCount: 1,
      retryDelay: 300000 // 5 minutes
    });

    // P3 - Low: In-app only unless user opted in
    this.channelRules.set('P3', {
      required: ['inApp'],
      optional: [],
      fallback: ['inApp'],
      retryCount: 0,
      retryDelay: 0
    });

    // P4 - Background: In-app only, no retries
    this.channelRules.set('P4', {
      required: ['inApp'],
      optional: [],
      fallback: [],
      retryCount: 0,
      retryDelay: 0
    });
  }

  /**
   * Setup channel capabilities and limitations
   */
  setupChannelCapabilities() {
    this.channelCapabilities.set('inApp', {
      realTime: true,
      persistent: true,
      richContent: true,
      interactive: true,
      maxLength: 1000,
      supportedTypes: ['all'],
      reliability: 0.99
    });

    this.channelCapabilities.set('push', {
      realTime: true,
      persistent: false,
      richContent: false,
      interactive: true,
      maxLength: 200,
      supportedTypes: ['alert', 'reminder', 'update'],
      reliability: 0.95
    });

    this.channelCapabilities.set('email', {
      realTime: false,
      persistent: true,
      richContent: true,
      interactive: false,
      maxLength: 10000,
      supportedTypes: ['report', 'summary', 'detailed'],
      reliability: 0.98
    });

    this.channelCapabilities.set('sms', {
      realTime: true,
      persistent: false,
      richContent: false,
      interactive: false,
      maxLength: 160,
      supportedTypes: ['alert', 'reminder'],
      reliability: 0.97
    });

    this.channelCapabilities.set('webhook', {
      realTime: true,
      persistent: false,
      richContent: true,
      interactive: false,
      maxLength: 5000,
      supportedTypes: ['system', 'integration'],
      reliability: 0.90
    });
  }

  /**
   * Load user preferences from database
   */
  async loadUserPreferences() {
    try {
      // In a real implementation, this would load from database
      // For now, we'll use default preferences
      console.log('📋 Loading user notification preferences...');
      
      // Default preferences for all users
      const defaultPreferences = {
        inApp: { enabled: true, priority: ['P0', 'P1', 'P2', 'P3', 'P4'] },
        push: { enabled: true, priority: ['P0', 'P1', 'P2'], quietHours: { start: 22, end: 8 } },
        email: { enabled: true, priority: ['P0', 'P1'], digest: true, frequency: 'daily' },
        sms: { enabled: false, priority: ['P0'], emergencyOnly: true },
        webhook: { enabled: false, priority: [], url: null }
      };
      
      // Store default preferences
      this.userPreferences.set('default', defaultPreferences);
      
      console.log('✅ User preferences loaded');
      
    } catch (error) {
      console.error('❌ Error loading user preferences:', error);
    }
  }

  /**
   * Select appropriate channels for notification
   */
  async selectChannels(notification, priority) {
    try {
      if (!this.isInitialized) {
        console.warn('⚠️ Channel Selector not initialized, using default channels');
        return { inApp: true };
      }

      // Get priority rules
      const rules = this.channelRules.get(priority) || this.channelRules.get('P3');
      
      // Get user preferences
      const userPrefs = await this.getUserPreferences(notification.recipientId);
      
      // Select channels based on rules and preferences
      const selectedChannels = this.applySelectionLogic(rules, userPrefs, notification);
      
      // Validate channel capabilities
      const validatedChannels = this.validateChannelCapabilities(selectedChannels, notification);
      
      console.log(`📡 Channels selected for ${priority}: ${Object.keys(validatedChannels).join(', ')}`);
      
      return validatedChannels;
      
    } catch (error) {
      console.error('❌ Error selecting channels:', error);
      return { inApp: true }; // Fallback to in-app only
    }
  }

  /**
   * Apply channel selection logic
   */
  applySelectionLogic(rules, userPrefs, notification) {
    const selectedChannels = {};
    
    // Always include required channels
    rules.required.forEach(channel => {
      if (this.isChannelAllowed(channel, userPrefs, notification)) {
        selectedChannels[channel] = true;
      }
    });
    
    // Include optional channels based on user preferences
    rules.optional.forEach(channel => {
      if (this.isChannelAllowed(channel, userPrefs, notification) && 
          this.shouldIncludeOptionalChannel(channel, userPrefs, notification)) {
        selectedChannels[channel] = true;
      }
    });
    
    // Ensure at least one channel is selected
    if (Object.keys(selectedChannels).length === 0) {
      rules.fallback.forEach(channel => {
        selectedChannels[channel] = true;
      });
    }
    
    return selectedChannels;
  }

  /**
   * Check if channel is allowed for user
   */
  isChannelAllowed(channel, userPrefs, notification) {
    const channelPrefs = userPrefs[channel];
    if (!channelPrefs || !channelPrefs.enabled) {
      return false;
    }
    
    // Check priority allowance
    if (!channelPrefs.priority.includes(notification.priority)) {
      return false;
    }
    
    // Check quiet hours for push notifications
    if (channel === 'push' && channelPrefs.quietHours) {
      if (this.isInQuietHours(channelPrefs.quietHours)) {
        return notification.priority === 'P0'; // Only P0 during quiet hours
      }
    }
    
    // Check emergency only for SMS
    if (channel === 'sms' && channelPrefs.emergencyOnly) {
      return notification.priority === 'P0';
    }
    
    return true;
  }

  /**
   * Check if we should include optional channel
   */
  shouldIncludeOptionalChannel(channel, userPrefs, notification) {
    const channelPrefs = userPrefs[channel];
    
    // Check notification type compatibility
    const capabilities = this.channelCapabilities.get(channel);
    if (!capabilities.supportedTypes.includes('all') && 
        !capabilities.supportedTypes.includes(notification.type)) {
      return false;
    }
    
    // Check content length
    const contentLength = (notification.title || '').length + (notification.message || '').length;
    if (contentLength > capabilities.maxLength) {
      return false;
    }
    
    // Channel-specific logic
    switch (channel) {
      case 'email':
        // Include email for detailed notifications or if digest is enabled
        return notification.detailed || channelPrefs.digest;
        
      case 'webhook':
        // Include webhook if URL is configured and it's a system notification
        return channelPrefs.url && notification.type?.startsWith('system');
        
      default:
        return true;
    }
  }

  /**
   * Validate channel capabilities against notification requirements
   */
  validateChannelCapabilities(selectedChannels, notification) {
    const validatedChannels = {};
    
    Object.keys(selectedChannels).forEach(channel => {
      const capabilities = this.channelCapabilities.get(channel);
      
      if (capabilities) {
        // Check if channel supports the notification type
        if (capabilities.supportedTypes.includes('all') || 
            capabilities.supportedTypes.includes(notification.type)) {
          
          // Check content length
          const contentLength = (notification.title || '').length + (notification.message || '').length;
          if (contentLength <= capabilities.maxLength) {
            validatedChannels[channel] = {
              enabled: true,
              reliability: capabilities.reliability,
              capabilities: {
                realTime: capabilities.realTime,
                persistent: capabilities.persistent,
                richContent: capabilities.richContent,
                interactive: capabilities.interactive
              }
            };
          } else {
            console.warn(`⚠️ Content too long for ${channel}: ${contentLength}/${capabilities.maxLength}`);
          }
        } else {
          console.warn(`⚠️ Channel ${channel} doesn't support type: ${notification.type}`);
        }
      }
    });
    
    // Ensure at least in-app is included
    if (Object.keys(validatedChannels).length === 0) {
      validatedChannels.inApp = {
        enabled: true,
        reliability: 0.99,
        capabilities: this.channelCapabilities.get('inApp')
      };
    }
    
    return validatedChannels;
  }

  /**
   * Get user preferences (with fallback to defaults)
   */
  async getUserPreferences(userId) {
    try {
      // Try to get user-specific preferences
      let userPrefs = this.userPreferences.get(userId);
      
      if (!userPrefs) {
        // Load from database if not cached
        userPrefs = await this.loadUserPreferencesFromDB(userId);
        
        if (userPrefs) {
          this.userPreferences.set(userId, userPrefs);
        } else {
          // Use default preferences
          userPrefs = this.userPreferences.get('default');
        }
      }
      
      return userPrefs;
      
    } catch (error) {
      console.error('❌ Error getting user preferences:', error);
      return this.userPreferences.get('default');
    }
  }

  /**
   * Load user preferences from database
   */
  async loadUserPreferencesFromDB(userId) {
    try {
      // In a real implementation, this would query the database
      // For now, return null to use defaults
      return null;
      
    } catch (error) {
      console.error('❌ Error loading user preferences from DB:', error);
      return null;
    }
  }

  /**
   * Check if current time is in quiet hours
   */
  isInQuietHours(quietHours) {
    const now = new Date();
    const currentHour = now.getHours();
    
    const { start, end } = quietHours;
    
    if (start < end) {
      // Same day quiet hours (e.g., 22:00 - 08:00 next day)
      return currentHour >= start || currentHour < end;
    } else {
      // Cross-day quiet hours (e.g., 10:00 - 06:00)
      return currentHour >= start && currentHour < end;
    }
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(userId, preferences) {
    try {
      // Validate preferences
      const validatedPrefs = this.validatePreferences(preferences);
      
      // Update cache
      this.userPreferences.set(userId, validatedPrefs);
      
      // Save to database
      await this.saveUserPreferencesToDB(userId, validatedPrefs);
      
      console.log(`✅ Updated preferences for user: ${userId}`);
      return true;
      
    } catch (error) {
      console.error('❌ Error updating user preferences:', error);
      return false;
    }
  }

  /**
   * Validate user preferences
   */
  validatePreferences(preferences) {
    const validatedPrefs = {};
    
    // Validate each channel
    Object.keys(preferences).forEach(channel => {
      if (this.channelCapabilities.has(channel)) {
        const channelPrefs = preferences[channel];
        
        validatedPrefs[channel] = {
          enabled: Boolean(channelPrefs.enabled),
          priority: Array.isArray(channelPrefs.priority) ? channelPrefs.priority : ['P0', 'P1'],
          ...channelPrefs
        };
      }
    });
    
    return validatedPrefs;
  }

  /**
   * Save user preferences to database
   */
  async saveUserPreferencesToDB(userId, preferences) {
    try {
      // In a real implementation, this would save to database
      console.log(`💾 Saving preferences for user ${userId} to database`);
      return true;
      
    } catch (error) {
      console.error('❌ Error saving preferences to DB:', error);
      return false;
    }
  }

  /**
   * Get channel statistics
   */
  getChannelStatistics() {
    const stats = {
      totalChannels: this.channelCapabilities.size,
      availableChannels: Array.from(this.channelCapabilities.keys()),
      priorityRules: Object.fromEntries(this.channelRules),
      cachedPreferences: this.userPreferences.size
    };
    
    return stats;
  }

  /**
   * Get selector status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      component: 'NotificationChannelSelector',
      version: '1.0.0',
      statistics: this.getChannelStatistics()
    };
  }
}

module.exports = NotificationChannelSelector;