/**
 * NotificationAuditLogger - Complete audit trail for notification system
 * Part of the Socket.IO Notification Engine Implementation
 */

const mongoose = require('mongoose');

// Audit Log Schema
const auditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  notificationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Notification',
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    index: true
  },
  priority: {
    type: String,
    enum: ['P0', 'P1', 'P2', 'P3', 'P4']
  },
  eventType: String,
  channel: String,
  status: {
    type: String,
    enum: ['success', 'failed', 'pending', 'retrying']
  },
  error: String,
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  processingTime: Number, // in milliseconds
  reminderId: mongoose.Schema.Types.ObjectId,
  sessionId: String,
  ipAddress: String,
  userAgent: String
}, {
  timestamps: true,
  collection: 'notification_audit_logs'
});

// Indexes for performance
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ notificationId: 1, timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ tenantId: 1, timestamp: -1 });
auditLogSchema.index({ priority: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 }); // For cleanup

const AuditLog = mongoose.model('NotificationAuditLog', auditLogSchema);

class NotificationAuditLogger {
  constructor() {
    this.batchSize = 100;
    this.batchTimeout = 5000; // 5 seconds
    this.pendingLogs = [];
    this.batchTimer = null;
    
    // Performance metrics
    this.metrics = {
      totalLogs: 0,
      batchesProcessed: 0,
      averageProcessingTime: 0,
      errors: 0
    };

    // Start batch processing
    this.startBatchProcessing();
  }

  /**
   * Log an audit event
   */
  async log(auditData) {
    try {
      const logEntry = {
        ...auditData,
        timestamp: new Date(),
        metadata: this.sanitizeMetadata(auditData.metadata || {})
      };

      // Add to batch for processing
      this.pendingLogs.push(logEntry);
      
      // Process immediately if batch is full
      if (this.pendingLogs.length >= this.batchSize) {
        await this.processBatch();
      }

      return true;

    } catch (error) {
      console.error('❌ Error logging audit event:', error);
      this.metrics.errors++;
      return false;
    }
  }

  /**
   * Log notification lifecycle event
   */
  async logNotificationLifecycle(action, notification, additionalData = {}) {
    return await this.log({
      action,
      notificationId: notification._id,
      userId: notification.userId,
      tenantId: notification.tenantId,
      priority: notification.priority,
      eventType: notification.eventType,
      ...additionalData
    });
  }

  /**
   * Log channel delivery event
   */
  async logChannelDelivery(channel, notification, status, error = null, processingTime = null) {
    return await this.log({
      action: 'channel_delivery',
      notificationId: notification._id,
      userId: notification.userId,
      tenantId: notification.tenantId,
      priority: notification.priority,
      channel,
      status,
      error,
      processingTime,
      metadata: {
        deliveryAttempt: notification.channels?.[channel]?.attempts || 1,
        retryCount: notification.channels?.[channel]?.retryCount || 0
      }
    });
  }

  /**
   * Log reminder event
   */
  async logReminder(action, notification, reminder, additionalData = {}) {
    return await this.log({
      action,
      notificationId: notification._id,
      reminderId: reminder._id,
      userId: notification.userId,
      tenantId: notification.tenantId,
      priority: notification.priority,
      metadata: {
        reminderType: reminder.type,
        scheduledAt: reminder.scheduledAt,
        ...additionalData
      }
    });
  }

  /**
   * Log security event
   */
  async logSecurityEvent(action, details) {
    return await this.log({
      action: `security_${action}`,
      priority: 'P0',
      metadata: {
        securityLevel: 'high',
        ...details
      }
    });
  }

  /**
   * Log performance metrics
   */
  async logPerformance(action, processingTime, additionalMetrics = {}) {
    return await this.log({
      action: `performance_${action}`,
      processingTime,
      metadata: {
        ...additionalMetrics,
        timestamp: Date.now()
      }
    });
  }

  /**
   * Start batch processing
   */
  startBatchProcessing() {
    this.batchTimer = setInterval(async () => {
      if (this.pendingLogs.length > 0) {
        await this.processBatch();
      }
    }, this.batchTimeout);
  }

  /**
   * Process pending logs in batch
   */
  async processBatch() {
    if (this.pendingLogs.length === 0) return;

    const startTime = Date.now();
    const logsToProcess = [...this.pendingLogs];
    this.pendingLogs = [];

    try {
      // Insert all logs in a single batch operation
      await AuditLog.insertMany(logsToProcess, { ordered: false });
      
      const processingTime = Date.now() - startTime;
      
      // Update metrics
      this.metrics.totalLogs += logsToProcess.length;
      this.metrics.batchesProcessed++;
      this.metrics.averageProcessingTime = 
        (this.metrics.averageProcessingTime + processingTime) / 2;

      console.log(`📝 Processed audit batch: ${logsToProcess.length} logs in ${processingTime}ms`);

    } catch (error) {
      console.error('❌ Error processing audit batch:', error);
      this.metrics.errors++;
      
      // Re-add failed logs to pending (with retry limit)
      const retriableLogs = logsToProcess.filter(log => 
        !log.retryCount || log.retryCount < 3
      ).map(log => ({
        ...log,
        retryCount: (log.retryCount || 0) + 1
      }));
      
      this.pendingLogs.unshift(...retriableLogs);
    }
  }

  /**
   * Query audit logs with filters
   */
  async queryLogs(filters = {}, options = {}) {
    try {
      const {
        action,
        notificationId,
        userId,
        tenantId,
        priority,
        channel,
        status,
        startDate,
        endDate,
        eventType
      } = filters;

      const {
        limit = 100,
        skip = 0,
        sort = { timestamp: -1 }
      } = options;

      // Build query
      const query = {};
      
      if (action) query.action = action;
      if (notificationId) query.notificationId = notificationId;
      if (userId) query.userId = userId;
      if (tenantId) query.tenantId = tenantId;
      if (priority) query.priority = priority;
      if (channel) query.channel = channel;
      if (status) query.status = status;
      if (eventType) query.eventType = eventType;
      
      if (startDate || endDate) {
        query.timestamp = {};
        if (startDate) query.timestamp.$gte = new Date(startDate);
        if (endDate) query.timestamp.$lte = new Date(endDate);
      }

      const logs = await AuditLog
        .find(query)
        .sort(sort)
        .limit(limit)
        .skip(skip)
        .populate('notificationId', 'title eventType priority')
        .populate('userId', 'email name')
        .populate('tenantId', 'businessName')
        .lean();

      const total = await AuditLog.countDocuments(query);

      return {
        logs,
        total,
        page: Math.floor(skip / limit) + 1,
        totalPages: Math.ceil(total / limit)
      };

    } catch (error) {
      console.error('❌ Error querying audit logs:', error);
      throw error;
    }
  }

  /**
   * Get audit statistics
   */
  async getStatistics(timeRange = '24h') {
    try {
      const now = new Date();
      let startDate;

      switch (timeRange) {
        case '1h':
          startDate = new Date(now - 60 * 60 * 1000);
          break;
        case '24h':
          startDate = new Date(now - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now - 24 * 60 * 60 * 1000);
      }

      const stats = await AuditLog.aggregate([
        {
          $match: {
            timestamp: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            totalLogs: { $sum: 1 },
            byAction: {
              $push: {
                action: '$action',
                count: 1
              }
            },
            byPriority: {
              $push: {
                priority: '$priority',
                count: 1
              }
            },
            byStatus: {
              $push: {
                status: '$status',
                count: 1
              }
            },
            averageProcessingTime: { $avg: '$processingTime' },
            errors: {
              $sum: {
                $cond: [{ $eq: ['$status', 'failed'] }, 1, 0]
              }
            }
          }
        }
      ]);

      // Process aggregation results
      const result = stats[0] || {};
      
      return {
        timeRange,
        totalLogs: result.totalLogs || 0,
        byAction: this.groupByField(result.byAction || []),
        byPriority: this.groupByField(result.byPriority || []),
        byStatus: this.groupByField(result.byStatus || []),
        averageProcessingTime: Math.round(result.averageProcessingTime || 0),
        errors: result.errors || 0,
        errorRate: result.totalLogs ? (result.errors / result.totalLogs * 100).toFixed(2) : 0,
        systemMetrics: this.metrics
      };

    } catch (error) {
      console.error('❌ Error getting audit statistics:', error);
      return null;
    }
  }

  /**
   * Get notification timeline
   */
  async getNotificationTimeline(notificationId) {
    try {
      const logs = await AuditLog
        .find({ notificationId })
        .sort({ timestamp: 1 })
        .lean();

      return logs.map(log => ({
        timestamp: log.timestamp,
        action: log.action,
        status: log.status,
        channel: log.channel,
        error: log.error,
        processingTime: log.processingTime,
        metadata: log.metadata
      }));

    } catch (error) {
      console.error('❌ Error getting notification timeline:', error);
      return [];
    }
  }

  /**
   * Clean up old audit logs
   */
  async cleanup(retentionDays = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await AuditLog.deleteMany({
        timestamp: { $lt: cutoffDate }
      });

      console.log(`🧹 Cleaned up ${result.deletedCount} old audit logs (older than ${retentionDays} days)`);
      
      await this.log({
        action: 'audit_cleanup_completed',
        metadata: {
          deletedCount: result.deletedCount,
          retentionDays,
          cutoffDate
        }
      });

      return result.deletedCount;

    } catch (error) {
      console.error('❌ Error cleaning up audit logs:', error);
      return 0;
    }
  }

  /**
   * Export audit logs
   */
  async exportLogs(filters = {}, format = 'json') {
    try {
      const { logs } = await this.queryLogs(filters, { limit: 10000 });
      
      if (format === 'csv') {
        return this.convertToCSV(logs);
      }
      
      return JSON.stringify(logs, null, 2);

    } catch (error) {
      console.error('❌ Error exporting audit logs:', error);
      throw error;
    }
  }

  /**
   * Helper methods
   */
  sanitizeMetadata(metadata) {
    const sanitized = { ...metadata };
    
    // Remove sensitive data
    delete sanitized.password;
    delete sanitized.token;
    delete sanitized.apiKey;
    delete sanitized.creditCard;
    
    // Limit metadata size
    const metadataString = JSON.stringify(sanitized);
    if (metadataString.length > 10000) {
      return { 
        ...sanitized, 
        _truncated: true,
        _originalSize: metadataString.length 
      };
    }
    
    return sanitized;
  }

  groupByField(items) {
    const grouped = {};
    items.forEach(item => {
      const key = Object.values(item)[0];
      if (key) {
        grouped[key] = (grouped[key] || 0) + 1;
      }
    });
    return grouped;
  }

  convertToCSV(logs) {
    if (logs.length === 0) return '';
    
    const headers = Object.keys(logs[0]);
    const csvRows = [headers.join(',')];
    
    logs.forEach(log => {
      const values = headers.map(header => {
        const value = log[header];
        return typeof value === 'object' ? JSON.stringify(value) : value;
      });
      csvRows.push(values.join(','));
    });
    
    return csvRows.join('\n');
  }

  /**
   * Flush pending logs and stop batch processing
   */
  async destroy() {
    // Process any remaining logs
    if (this.pendingLogs.length > 0) {
      await this.processBatch();
    }
    
    // Stop batch timer
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
    
    console.log('🛑 NotificationAuditLogger destroyed');
  }
}

module.exports = { NotificationAuditLogger, AuditLog };