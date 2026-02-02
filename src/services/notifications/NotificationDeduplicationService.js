/**
 * NotificationDeduplicationService - Anti-spam and deduplication system
 * Part of the Socket.IO Notification Engine Implementation
 */

const crypto = require('crypto');
const { NotificationAuditLogger } = require('./NotificationAuditLogger');

class NotificationDeduplicationService {
  constructor() {
    this.auditLogger = new NotificationAuditLogger();
    
    // In-memory cache for recent notifications (in production, use Redis)
    this.recentNotifications = new Map();
    this.userNotificationCounts = new Map();
    
    // Deduplication rules
    this.deduplicationRules = {
      // Time windows for different priorities
      timeWindows: {
        P0: 0,        // Never deduplicate critical notifications
        P1: 5 * 60,   // 5 minutes
        P2: 15 * 60,  // 15 minutes
        P3: 60 * 60,  // 1 hour
        P4: 24 * 60 * 60 // 24 hours
      },
      
      // Maximum notifications per user per time period
      rateLimits: {
        perMinute: {
          P0: 10,   // Allow more critical notifications
          P1: 5,
          P2: 3,
          P3: 2,
          P4: 1
        },
        perHour: {
          P0: 100,
          P1: 50,
          P2: 20,
          P3: 10,
          P4: 5
        },
        perDay: {
          P0: 500,
          P1: 200,
          P2: 100,
          P3: 50,
          P4: 20
        }
      },
      
      // Events that should never be deduplicated
      neverDeduplicate: [
        'payment_mismatch',
        'security_breach',
        'cross_tenant_access_detected',
        'payment_completed',
        'order_delivered'
      ],
      
      // Events that are highly likely to be duplicates
      highDuplicationRisk: [
        'order_updated',
        'status_changed',
        'sync_completed',
        'background_job_finished'
      ]
    };

    // Cleanup interval (every 5 minutes)
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 5 * 60 * 1000);
  }

  /**
   * Check if notification should be deduplicated
   */
  async shouldDeduplicate(notification) {
    try {
      const startTime = Date.now();
      
      // Never deduplicate certain critical events
      if (this.deduplicationRules.neverDeduplicate.includes(notification.eventType)) {
        await this.auditLogger.log({
          action: 'deduplication_skipped',
          notificationId: notification._id,
          reason: 'never_deduplicate_event',
          eventType: notification.eventType
        });
        return false;
      }

      // Check rate limits first
      const rateLimitExceeded = await this.checkRateLimits(notification);
      if (rateLimitExceeded) {
        await this.auditLogger.log({
          action: 'notification_rate_limited',
          notificationId: notification._id,
          userId: notification.userId,
          priority: notification.priority,
          reason: rateLimitExceeded
        });
        return true; // Deduplicate (block) due to rate limit
      }

      // Check for duplicate content
      const isDuplicate = await this.checkDuplicateContent(notification);
      if (isDuplicate) {
        await this.auditLogger.log({
          action: 'notification_deduplicated',
          notificationId: notification._id,
          duplicateOf: isDuplicate.originalId,
          reason: 'duplicate_content',
          timeSinceOriginal: Date.now() - isDuplicate.timestamp
        });
        return true;
      }

      // Check for similar notifications in time window
      const similarNotification = await this.checkSimilarNotifications(notification);
      if (similarNotification) {
        await this.auditLogger.log({
          action: 'notification_deduplicated',
          notificationId: notification._id,
          similarTo: similarNotification.originalId,
          reason: 'similar_content',
          similarity: similarNotification.similarity
        });
        return true;
      }

      // Record this notification for future deduplication checks
      await this.recordNotification(notification);

      const processingTime = Date.now() - startTime;
      await this.auditLogger.log({
        action: 'deduplication_check_completed',
        notificationId: notification._id,
        result: 'allowed',
        processingTime
      });

      return false; // Don't deduplicate

    } catch (error) {
      console.error('❌ Error in deduplication check:', error);
      
      await this.auditLogger.log({
        action: 'deduplication_check_failed',
        notificationId: notification._id,
        error: error.message
      });
      
      // On error, allow notification to prevent blocking critical messages
      return false;
    }
  }

  /**
   * Check rate limits for user/tenant
   */
  async checkRateLimits(notification) {
    const userId = notification.userId?.toString();
    const tenantId = notification.tenantId?.toString();
    const priority = notification.priority;
    const now = Date.now();

    // Check user-specific rate limits
    if (userId) {
      const userKey = `user:${userId}`;
      const userLimitExceeded = this.checkUserRateLimit(userKey, priority, now);
      if (userLimitExceeded) {
        return `user_rate_limit_${userLimitExceeded}`;
      }
    }

    // Check tenant-specific rate limits
    if (tenantId) {
      const tenantKey = `tenant:${tenantId}`;
      const tenantLimitExceeded = this.checkUserRateLimit(tenantKey, priority, now);
      if (tenantLimitExceeded) {
        return `tenant_rate_limit_${tenantLimitExceeded}`;
      }
    }

    return null; // No rate limit exceeded
  }

  /**
   * Check rate limit for a specific key (user or tenant)
   */
  checkUserRateLimit(key, priority, now) {
    if (!this.userNotificationCounts.has(key)) {
      this.userNotificationCounts.set(key, {
        minute: { count: 0, resetTime: now + 60 * 1000 },
        hour: { count: 0, resetTime: now + 60 * 60 * 1000 },
        day: { count: 0, resetTime: now + 24 * 60 * 60 * 1000 }
      });
    }

    const counts = this.userNotificationCounts.get(key);
    
    // Reset counters if time windows have passed
    if (now > counts.minute.resetTime) {
      counts.minute = { count: 0, resetTime: now + 60 * 1000 };
    }
    if (now > counts.hour.resetTime) {
      counts.hour = { count: 0, resetTime: now + 60 * 60 * 1000 };
    }
    if (now > counts.day.resetTime) {
      counts.day = { count: 0, resetTime: now + 24 * 60 * 60 * 1000 };
    }

    // Check limits
    const limits = this.deduplicationRules.rateLimits;
    
    if (counts.minute.count >= limits.perMinute[priority]) {
      return 'per_minute';
    }
    if (counts.hour.count >= limits.perHour[priority]) {
      return 'per_hour';
    }
    if (counts.day.count >= limits.perDay[priority]) {
      return 'per_day';
    }

    // Increment counters
    counts.minute.count++;
    counts.hour.count++;
    counts.day.count++;

    return null; // No limit exceeded
  }

  /**
   * Check for exact duplicate content
   */
  async checkDuplicateContent(notification) {
    const contentHash = this.generateContentHash(notification);
    const timeWindow = this.deduplicationRules.timeWindows[notification.priority] * 1000;
    const now = Date.now();

    // Check if we've seen this exact content recently
    if (this.recentNotifications.has(contentHash)) {
      const existing = this.recentNotifications.get(contentHash);
      
      if (now - existing.timestamp < timeWindow) {
        return {
          originalId: existing.notificationId,
          timestamp: existing.timestamp
        };
      } else {
        // Expired, remove it
        this.recentNotifications.delete(contentHash);
      }
    }

    return null; // No duplicate found
  }

  /**
   * Check for similar notifications (fuzzy matching)
   */
  async checkSimilarNotifications(notification) {
    const timeWindow = this.deduplicationRules.timeWindows[notification.priority] * 1000;
    const now = Date.now();
    const threshold = 0.8; // 80% similarity threshold

    // Only check for high duplication risk events
    if (!this.deduplicationRules.highDuplicationRisk.includes(notification.eventType)) {
      return null;
    }

    // Check recent notifications for similar content
    for (const [hash, existing] of this.recentNotifications.entries()) {
      if (now - existing.timestamp > timeWindow) {
        continue; // Skip expired entries
      }

      if (existing.userId === notification.userId?.toString() &&
          existing.eventType === notification.eventType) {
        
        const similarity = this.calculateSimilarity(
          existing.content,
          this.getNotificationContent(notification)
        );

        if (similarity >= threshold) {
          return {
            originalId: existing.notificationId,
            similarity
          };
        }
      }
    }

    return null; // No similar notification found
  }

  /**
   * Record notification for future deduplication checks
   */
  async recordNotification(notification) {
    const contentHash = this.generateContentHash(notification);
    const now = Date.now();

    this.recentNotifications.set(contentHash, {
      notificationId: notification._id?.toString() || 'temp',
      userId: notification.userId?.toString(),
      tenantId: notification.tenantId?.toString(),
      eventType: notification.eventType,
      priority: notification.priority,
      content: this.getNotificationContent(notification),
      timestamp: now
    });
  }

  /**
   * Generate content hash for deduplication
   */
  generateContentHash(notification) {
    const content = {
      userId: notification.userId?.toString(),
      tenantId: notification.tenantId?.toString(),
      eventType: notification.eventType,
      title: notification.title,
      message: notification.message,
      // Include relevant metadata but exclude timestamps
      metadata: this.sanitizeMetadata(notification.metadata)
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(content))
      .digest('hex');
  }

  /**
   * Get notification content for similarity comparison
   */
  getNotificationContent(notification) {
    return {
      title: notification.title || '',
      message: notification.message || '',
      eventType: notification.eventType || '',
      category: notification.category || ''
    };
  }

  /**
   * Calculate similarity between two notification contents
   */
  calculateSimilarity(content1, content2) {
    // Simple similarity calculation based on common words
    const text1 = `${content1.title} ${content1.message}`.toLowerCase();
    const text2 = `${content2.title} ${content2.message}`.toLowerCase();

    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Sanitize metadata for hashing (remove timestamps and dynamic values)
   */
  sanitizeMetadata(metadata) {
    if (!metadata) return {};

    const sanitized = { ...metadata };
    
    // Remove dynamic fields that shouldn't affect deduplication
    delete sanitized.timestamp;
    delete sanitized.createdAt;
    delete sanitized.updatedAt;
    delete sanitized.requestId;
    delete sanitized.sessionId;
    
    return sanitized;
  }

  /**
   * Clean up expired entries from memory
   */
  cleanupExpiredEntries() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    // Clean up recent notifications
    for (const [hash, entry] of this.recentNotifications.entries()) {
      if (now - entry.timestamp > maxAge) {
        this.recentNotifications.delete(hash);
      }
    }

    // Clean up user notification counts
    for (const [key, counts] of this.userNotificationCounts.entries()) {
      if (now > counts.day.resetTime) {
        this.userNotificationCounts.delete(key);
      }
    }

    console.log(`🧹 Cleaned up expired deduplication entries. Active entries: ${this.recentNotifications.size}`);
  }

  /**
   * Get deduplication statistics
   */
  async getStatistics() {
    try {
      const stats = {
        activeEntries: this.recentNotifications.size,
        activeUserCounts: this.userNotificationCounts.size,
        memoryUsage: {
          recentNotifications: this.recentNotifications.size * 1024, // Rough estimate
          userCounts: this.userNotificationCounts.size * 512
        },
        rules: {
          timeWindows: this.deduplicationRules.timeWindows,
          rateLimits: this.deduplicationRules.rateLimits
        }
      };

      return stats;

    } catch (error) {
      console.error('❌ Error getting deduplication statistics:', error);
      return null;
    }
  }

  /**
   * Update deduplication rules
   */
  updateRules(newRules) {
    try {
      this.deduplicationRules = { ...this.deduplicationRules, ...newRules };
      
      console.log('✅ Deduplication rules updated successfully');
      
      this.auditLogger.log({
        action: 'deduplication_rules_updated',
        metadata: { rulesUpdated: Object.keys(newRules) }
      });
      
      return true;

    } catch (error) {
      console.error('❌ Error updating deduplication rules:', error);
      return false;
    }
  }

  /**
   * Force allow a notification (bypass deduplication)
   */
  async forceAllow(notification) {
    await this.auditLogger.log({
      action: 'deduplication_bypassed',
      notificationId: notification._id,
      reason: 'force_allow'
    });
    
    // Still record it to prevent future duplicates
    await this.recordNotification(notification);
    
    return false; // Don't deduplicate
  }

  /**
   * Clear all deduplication data (for testing or reset)
   */
  clearAll() {
    this.recentNotifications.clear();
    this.userNotificationCounts.clear();
    
    console.log('🗑️ All deduplication data cleared');
    
    this.auditLogger.log({
      action: 'deduplication_data_cleared'
    });
  }

  /**
   * Cleanup on service shutdown
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.clearAll();
    console.log('🛑 NotificationDeduplicationService destroyed');
  }
}

module.exports = { NotificationDeduplicationService };