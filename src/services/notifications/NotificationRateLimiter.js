/**
 * NotificationRateLimiter - Rate limiting per channel/tenant/user
 * Part of the Socket.IO Notification Engine Implementation
 */

const { NotificationAuditLogger } = require('./NotificationAuditLogger');

class NotificationRateLimiter {
  constructor() {
    this.auditLogger = new NotificationAuditLogger();
    
    // In-memory storage for rate limiting (in production, use Redis)
    this.rateLimitData = new Map();
    
    // Rate limiting rules
    this.rateLimitRules = {
      // Global limits
      global: {
        perSecond: 100,
        perMinute: 1000,
        perHour: 10000,
        perDay: 50000
      },
      
      // Per-user limits by priority
      user: {
        P0: { perMinute: 50, perHour: 500, perDay: 2000 },
        P1: { perMinute: 30, perHour: 300, perDay: 1000 },
        P2: { perMinute: 20, perHour: 200, perDay: 500 },
        P3: { perMinute: 10, perHour: 100, perDay: 200 },
        P4: { perMinute: 5, perHour: 50, perDay: 100 }
      },
      
      // Per-tenant limits by priority
      tenant: {
        P0: { perMinute: 200, perHour: 2000, perDay: 10000 },
        P1: { perMinute: 150, perHour: 1500, perDay: 5000 },
        P2: { perMinute: 100, perHour: 1000, perDay: 3000 },
        P3: { perMinute: 50, perHour: 500, perDay: 1000 },
        P4: { perMinute: 25, perHour: 250, perDay: 500 }
      },
      
      // Per-channel limits
      channel: {
        in_app: { perMinute: 100, perHour: 1000, perDay: 5000 },
        email: { perMinute: 10, perHour: 100, perDay: 500 },
        sms: { perMinute: 5, perHour: 50, perDay: 200 },
        whatsapp: { perMinute: 5, perHour: 50, perDay: 200 },
        push: { perMinute: 50, perHour: 500, perDay: 2000 }
      },
      
      // Per-event-type limits
      eventType: {
        'payment_failed': { perMinute: 10, perHour: 50, perDay: 200 },
        'order_updated': { perMinute: 20, perHour: 200, perDay: 1000 },
        'system_error': { perMinute: 5, perHour: 25, perDay: 100 },
        'marketing_update': { perMinute: 2, perHour: 10, perDay: 50 }
      },
      
      // Burst allowance (temporary spike tolerance)
      burstAllowance: {
        enabled: true,
        multiplier: 2, // Allow 2x normal rate for short bursts
        duration: 30000, // 30 seconds
        cooldown: 300000 // 5 minutes cooldown after burst
      }
    };

    // Cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000); // Every minute
  }

  /**
   * Check if notification should be rate limited
   */
  async checkRateLimit(notification, channels = []) {
    try {
      const startTime = Date.now();
      const checks = [];

      // Global rate limit check
      const globalCheck = await this.checkGlobalRateLimit();
      checks.push({ type: 'global', ...globalCheck });

      // User rate limit check
      if (notification.userId) {
        const userCheck = await this.checkUserRateLimit(notification.userId, notification.priority);
        checks.push({ type: 'user', ...userCheck });
      }

      // Tenant rate limit check
      if (notification.tenantId) {
        const tenantCheck = await this.checkTenantRateLimit(notification.tenantId, notification.priority);
        checks.push({ type: 'tenant', ...tenantCheck });
      }

      // Channel rate limit checks
      for (const channel of channels) {
        const channelCheck = await this.checkChannelRateLimit(channel);
        checks.push({ type: 'channel', channel, ...channelCheck });
      }

      // Event type rate limit check
      if (notification.eventType) {
        const eventTypeCheck = await this.checkEventTypeRateLimit(notification.eventType);
        checks.push({ type: 'eventType', ...eventTypeCheck });
      }

      // Find any failed checks
      const failedChecks = checks.filter(check => !check.allowed);
      const isRateLimited = failedChecks.length > 0;

      const processingTime = Date.now() - startTime;

      // Log rate limit check
      await this.auditLogger.log({
        action: 'rate_limit_check',
        notificationId: notification._id,
        userId: notification.userId,
        tenantId: notification.tenantId,
        status: isRateLimited ? 'rate_limited' : 'allowed',
        processingTime,
        metadata: {
          priority: notification.priority,
          eventType: notification.eventType,
          channels,
          checks,
          failedChecks
        }
      });

      if (isRateLimited) {
        // Record the rate limit hit
        await this.recordRateLimitHit(notification, failedChecks);
        
        return {
          allowed: false,
          rateLimited: true,
          reason: failedChecks.map(check => `${check.type}_rate_limit_exceeded`).join(', '),
          failedChecks,
          retryAfter: this.calculateRetryAfter(failedChecks)
        };
      }

      // Record successful notification for rate limiting
      await this.recordNotification(notification, channels);

      return {
        allowed: true,
        rateLimited: false,
        checks
      };

    } catch (error) {
      console.error('❌ Error in rate limit check:', error);
      
      await this.auditLogger.log({
        action: 'rate_limit_check_failed',
        notificationId: notification._id,
        error: error.message
      });
      
      // On error, allow notification to prevent blocking critical messages
      return {
        allowed: true,
        rateLimited: false,
        error: error.message
      };
    }
  }

  /**
   * Check global rate limits
   */
  async checkGlobalRateLimit() {
    const now = Date.now();
    const key = 'global';
    const limits = this.rateLimitRules.global;

    return this.checkLimitsForKey(key, limits, now);
  }

  /**
   * Check user rate limits
   */
  async checkUserRateLimit(userId, priority) {
    const now = Date.now();
    const key = `user:${userId}`;
    const limits = this.rateLimitRules.user[priority] || this.rateLimitRules.user.P3;

    return this.checkLimitsForKey(key, limits, now);
  }

  /**
   * Check tenant rate limits
   */
  async checkTenantRateLimit(tenantId, priority) {
    const now = Date.now();
    const key = `tenant:${tenantId}`;
    const limits = this.rateLimitRules.tenant[priority] || this.rateLimitRules.tenant.P3;

    return this.checkLimitsForKey(key, limits, now);
  }

  /**
   * Check channel rate limits
   */
  async checkChannelRateLimit(channel) {
    const now = Date.now();
    const key = `channel:${channel}`;
    const limits = this.rateLimitRules.channel[channel] || this.rateLimitRules.channel.in_app;

    return this.checkLimitsForKey(key, limits, now);
  }

  /**
   * Check event type rate limits
   */
  async checkEventTypeRateLimit(eventType) {
    const now = Date.now();
    const key = `eventType:${eventType}`;
    const limits = this.rateLimitRules.eventType[eventType];

    if (!limits) {
      return { allowed: true, reason: 'no_specific_limit' };
    }

    return this.checkLimitsForKey(key, limits, now);
  }

  /**
   * Check limits for a specific key
   */
  checkLimitsForKey(key, limits, now) {
    if (!this.rateLimitData.has(key)) {
      this.rateLimitData.set(key, {
        second: { count: 0, resetTime: now + 1000 },
        minute: { count: 0, resetTime: now + 60 * 1000 },
        hour: { count: 0, resetTime: now + 60 * 60 * 1000 },
        day: { count: 0, resetTime: now + 24 * 60 * 60 * 1000 },
        burstMode: false,
        burstStartTime: null,
        lastBurstTime: null
      });
    }

    const data = this.rateLimitData.get(key);

    // Reset counters if time windows have passed
    this.resetExpiredCounters(data, now);

    // Check burst mode
    const burstCheck = this.checkBurstMode(data, limits, now);
    if (burstCheck.inBurst) {
      // Apply burst multiplier
      const burstLimits = this.applyBurstMultiplier(limits);
      return this.checkIndividualLimits(data, burstLimits, key);
    }

    // Check normal limits
    return this.checkIndividualLimits(data, limits, key);
  }

  /**
   * Reset expired counters
   */
  resetExpiredCounters(data, now) {
    if (now > data.second.resetTime) {
      data.second = { count: 0, resetTime: now + 1000 };
    }
    if (now > data.minute.resetTime) {
      data.minute = { count: 0, resetTime: now + 60 * 1000 };
    }
    if (now > data.hour.resetTime) {
      data.hour = { count: 0, resetTime: now + 60 * 60 * 1000 };
    }
    if (now > data.day.resetTime) {
      data.day = { count: 0, resetTime: now + 24 * 60 * 60 * 1000 };
    }
  }

  /**
   * Check burst mode
   */
  checkBurstMode(data, limits, now) {
    const burstConfig = this.rateLimitRules.burstAllowance;
    
    if (!burstConfig.enabled) {
      return { inBurst: false };
    }

    // Check if we're in cooldown period
    if (data.lastBurstTime && (now - data.lastBurstTime) < burstConfig.cooldown) {
      return { inBurst: false, inCooldown: true };
    }

    // Check if we should enter burst mode
    if (!data.burstMode && data.minute.count > (limits.perMinute || 0) * 0.8) {
      data.burstMode = true;
      data.burstStartTime = now;
      return { inBurst: true, justEntered: true };
    }

    // Check if we should exit burst mode
    if (data.burstMode && (now - data.burstStartTime) > burstConfig.duration) {
      data.burstMode = false;
      data.lastBurstTime = now;
      return { inBurst: false, justExited: true };
    }

    return { inBurst: data.burstMode };
  }

  /**
   * Apply burst multiplier to limits
   */
  applyBurstMultiplier(limits) {
    const multiplier = this.rateLimitRules.burstAllowance.multiplier;
    
    return {
      perSecond: limits.perSecond ? Math.floor(limits.perSecond * multiplier) : undefined,
      perMinute: limits.perMinute ? Math.floor(limits.perMinute * multiplier) : undefined,
      perHour: limits.perHour ? Math.floor(limits.perHour * multiplier) : undefined,
      perDay: limits.perDay ? Math.floor(limits.perDay * multiplier) : undefined
    };
  }

  /**
   * Check individual limits
   */
  checkIndividualLimits(data, limits, key) {
    // Check per-second limit
    if (limits.perSecond && data.second.count >= limits.perSecond) {
      return {
        allowed: false,
        reason: 'per_second_limit_exceeded',
        limit: limits.perSecond,
        current: data.second.count,
        resetTime: data.second.resetTime,
        key
      };
    }

    // Check per-minute limit
    if (limits.perMinute && data.minute.count >= limits.perMinute) {
      return {
        allowed: false,
        reason: 'per_minute_limit_exceeded',
        limit: limits.perMinute,
        current: data.minute.count,
        resetTime: data.minute.resetTime,
        key
      };
    }

    // Check per-hour limit
    if (limits.perHour && data.hour.count >= limits.perHour) {
      return {
        allowed: false,
        reason: 'per_hour_limit_exceeded',
        limit: limits.perHour,
        current: data.hour.count,
        resetTime: data.hour.resetTime,
        key
      };
    }

    // Check per-day limit
    if (limits.perDay && data.day.count >= limits.perDay) {
      return {
        allowed: false,
        reason: 'per_day_limit_exceeded',
        limit: limits.perDay,
        current: data.day.count,
        resetTime: data.day.resetTime,
        key
      };
    }

    return {
      allowed: true,
      limits,
      current: {
        perSecond: data.second.count,
        perMinute: data.minute.count,
        perHour: data.hour.count,
        perDay: data.day.count
      },
      key
    };
  }

  /**
   * Record notification for rate limiting
   */
  async recordNotification(notification, channels) {
    const now = Date.now();

    // Record global
    this.incrementCounter('global', now);

    // Record user
    if (notification.userId) {
      this.incrementCounter(`user:${notification.userId}`, now);
    }

    // Record tenant
    if (notification.tenantId) {
      this.incrementCounter(`tenant:${notification.tenantId}`, now);
    }

    // Record channels
    for (const channel of channels) {
      this.incrementCounter(`channel:${channel}`, now);
    }

    // Record event type
    if (notification.eventType) {
      this.incrementCounter(`eventType:${notification.eventType}`, now);
    }
  }

  /**
   * Increment counter for a key
   */
  incrementCounter(key, now) {
    if (!this.rateLimitData.has(key)) {
      this.rateLimitData.set(key, {
        second: { count: 0, resetTime: now + 1000 },
        minute: { count: 0, resetTime: now + 60 * 1000 },
        hour: { count: 0, resetTime: now + 60 * 60 * 1000 },
        day: { count: 0, resetTime: now + 24 * 60 * 60 * 1000 }
      });
    }

    const data = this.rateLimitData.get(key);
    this.resetExpiredCounters(data, now);

    data.second.count++;
    data.minute.count++;
    data.hour.count++;
    data.day.count++;
  }

  /**
   * Record rate limit hit
   */
  async recordRateLimitHit(notification, failedChecks) {
    await this.auditLogger.log({
      action: 'rate_limit_hit',
      notificationId: notification._id,
      userId: notification.userId,
      tenantId: notification.tenantId,
      metadata: {
        priority: notification.priority,
        eventType: notification.eventType,
        failedChecks
      }
    });
  }

  /**
   * Calculate retry after time
   */
  calculateRetryAfter(failedChecks) {
    let maxRetryAfter = 0;

    for (const check of failedChecks) {
      if (check.resetTime) {
        const retryAfter = Math.ceil((check.resetTime - Date.now()) / 1000);
        maxRetryAfter = Math.max(maxRetryAfter, retryAfter);
      }
    }

    return maxRetryAfter;
  }

  /**
   * Clean up expired entries
   */
  cleanupExpiredEntries() {
    const now = Date.now();
    const keysToDelete = [];

    for (const [key, data] of this.rateLimitData.entries()) {
      // If all counters are expired and at zero, remove the entry
      if (now > data.day.resetTime && 
          data.second.count === 0 && 
          data.minute.count === 0 && 
          data.hour.count === 0 && 
          data.day.count === 0) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.rateLimitData.delete(key);
    }

    if (keysToDelete.length > 0) {
      console.log(`🧹 Cleaned up ${keysToDelete.length} expired rate limit entries`);
    }
  }

  /**
   * Get rate limit statistics
   */
  async getStatistics() {
    const stats = {
      totalKeys: this.rateLimitData.size,
      keysByType: {
        global: 0,
        user: 0,
        tenant: 0,
        channel: 0,
        eventType: 0
      },
      topConsumers: {
        users: [],
        tenants: [],
        channels: [],
        eventTypes: []
      },
      burstModeActive: 0
    };

    // Analyze current data
    for (const [key, data] of this.rateLimitData.entries()) {
      const [type, id] = key.split(':');
      
      if (stats.keysByType[type] !== undefined) {
        stats.keysByType[type]++;
      }

      if (data.burstMode) {
        stats.burstModeActive++;
      }

      // Track top consumers
      if (type === 'user') {
        stats.topConsumers.users.push({
          userId: id,
          minuteCount: data.minute.count,
          hourCount: data.hour.count,
          dayCount: data.day.count
        });
      } else if (type === 'tenant') {
        stats.topConsumers.tenants.push({
          tenantId: id,
          minuteCount: data.minute.count,
          hourCount: data.hour.count,
          dayCount: data.day.count
        });
      }
    }

    // Sort top consumers
    stats.topConsumers.users.sort((a, b) => b.dayCount - a.dayCount);
    stats.topConsumers.tenants.sort((a, b) => b.dayCount - a.dayCount);
    
    // Keep only top 10
    stats.topConsumers.users = stats.topConsumers.users.slice(0, 10);
    stats.topConsumers.tenants = stats.topConsumers.tenants.slice(0, 10);

    return stats;
  }

  /**
   * Update rate limit rules
   */
  updateRules(newRules) {
    try {
      this.rateLimitRules = { ...this.rateLimitRules, ...newRules };
      
      console.log('✅ Rate limit rules updated successfully');
      
      this.auditLogger.log({
        action: 'rate_limit_rules_updated',
        metadata: { updatedRules: Object.keys(newRules) }
      });
      
      return true;

    } catch (error) {
      console.error('❌ Error updating rate limit rules:', error);
      return false;
    }
  }

  /**
   * Reset rate limits for a specific key
   */
  resetRateLimits(key) {
    if (this.rateLimitData.has(key)) {
      this.rateLimitData.delete(key);
      
      this.auditLogger.log({
        action: 'rate_limits_reset',
        metadata: { key }
      });
      
      return true;
    }
    
    return false;
  }

  /**
   * Get current rate limit status for a key
   */
  getRateLimitStatus(key) {
    if (!this.rateLimitData.has(key)) {
      return null;
    }

    const data = this.rateLimitData.get(key);
    const now = Date.now();
    
    this.resetExpiredCounters(data, now);

    return {
      key,
      current: {
        perSecond: data.second.count,
        perMinute: data.minute.count,
        perHour: data.hour.count,
        perDay: data.day.count
      },
      resetTimes: {
        second: data.second.resetTime,
        minute: data.minute.resetTime,
        hour: data.hour.resetTime,
        day: data.day.resetTime
      },
      burstMode: data.burstMode,
      burstStartTime: data.burstStartTime,
      lastBurstTime: data.lastBurstTime
    };
  }

  /**
   * Cleanup on service shutdown
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.rateLimitData.clear();
    console.log('🛑 NotificationRateLimiter destroyed');
  }
}

module.exports = { NotificationRateLimiter };