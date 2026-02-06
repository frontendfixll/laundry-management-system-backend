/**
 * SocketIONotificationEngine - Main notification engine with priority system
 * Part of the Socket.IO Notification Engine Implementation
 */

const { NotificationPriorityClassifier } = require('./NotificationPriorityClassifier');
const { NotificationChannelSelector } = require('./NotificationChannelSelector');
const { NotificationReminderEngine } = require('./NotificationReminderEngine');
const { NotificationDeduplicationService } = require('./NotificationDeduplicationService');
const { NotificationAuditLogger } = require('./NotificationAuditLogger');
const { NotificationSecurityGuard } = require('./NotificationSecurityGuard');
const { SocketIOConnectionManager } = require('./SocketIOConnectionManager');
const { NotificationRateLimiter } = require('./NotificationRateLimiter');
const Notification = require('../../models/Notification');
const { sendEmail } = require('../../config/email');

class SocketIONotificationEngine {
  constructor(httpServer = null) {
    // Core components
    this.priorityClassifier = new NotificationPriorityClassifier();
    this.channelSelector = new NotificationChannelSelector();
    this.reminderEngine = new NotificationReminderEngine();
    this.deduplicationService = new NotificationDeduplicationService();
    this.auditLogger = new NotificationAuditLogger();
    this.securityGuard = new NotificationSecurityGuard();
    this.rateLimiter = new NotificationRateLimiter();

    // Connection manager (only if httpServer provided)
    this.connectionManager = httpServer ? new SocketIOConnectionManager(httpServer) : null;

    // Engine state
    this.isInitialized = false;
    this.isRunning = false;

    // Processing queue
    this.processingQueue = [];
    this.isProcessingQueue = false;

    // Performance metrics
    this.metrics = {
      totalProcessed: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      rateLimitedNotifications: 0,
      deduplicatedNotifications: 0,
      averageProcessingTime: 0,
      channelMetrics: {
        in_app: { sent: 0, failed: 0 },
        email: { sent: 0, failed: 0 },
        sms: { sent: 0, failed: 0 },
        whatsapp: { sent: 0, failed: 0 },
        push: { sent: 0, failed: 0 }
      }
    };

    // Event handlers for external integrations
    this.eventHandlers = new Map();
  }

  /**
   * Initialize the notification engine
   */
  async initialize() {
    try {
      console.log('🚀 Initializing SocketIONotificationEngine...');

      // Initialize connection manager if available
      if (this.connectionManager) {
        await this.connectionManager.initialize();
      }

      // Initialize reminder engine
      await this.reminderEngine.initialize();

      // Start queue processing
      this.startQueueProcessing();

      this.isInitialized = true;
      this.isRunning = true;

      console.log('✅ SocketIONotificationEngine initialized successfully');

      await this.auditLogger.log({
        action: 'notification_engine_started',
        metadata: {
          hasConnectionManager: !!this.connectionManager,
          timestamp: new Date()
        }
      });

      return true;

    } catch (error) {
      console.error('❌ Failed to initialize SocketIONotificationEngine:', error);
      throw error;
    }
  }

  /**
   * Process a notification through the complete pipeline
   */
  async processNotification(notificationData, context = {}) {
    const startTime = Date.now();
    let notification = null;

    try {
      // 1. Create notification object
      notification = await this.createNotification(notificationData);

      // 2. Security validation
      const securityCheck = await this.securityGuard.validateNotificationSecurity(notification, context);
      if (!securityCheck.passed) {
        throw new Error(`Security validation failed: ${securityCheck.violations.join(', ')}`);
      }

      // 3. Priority classification
      const classifiedPriority = await this.priorityClassifier.classifyPriority(notification.eventType, {
        ...context,
        amount: notification.metadata?.amount,
        businessImpact: notification.metadata?.businessImpact,
        securityLevel: notification.metadata?.securityLevel,
        isTimeSensitive: notification.metadata?.isTimeSensitive,
        isHighValueCustomer: notification.metadata?.isHighValueCustomer,
        manualPriority: notificationData.priority // Pass through for classification logic if needed
      });

      // Respect manually provided priority if it's higher (more critical) than the classified one
      // P0 > P1 > P2 > P3 > P4
      const priorityLevels = ['P0', 'P1', 'P2', 'P3', 'P4'];
      const manualPriorityIndex = notificationData.priority ? priorityLevels.indexOf(notificationData.priority) : 99;
      const classifiedPriorityIndex = priorityLevels.indexOf(classifiedPriority);

      notification.priority = (manualPriorityIndex <= classifiedPriorityIndex)
        ? notificationData.priority
        : classifiedPriority;

      console.log(`⚖️ Priority Classification: Event=${notification.eventType}, Manual=${notificationData.priority || 'none'}, Classified=${classifiedPriority} -> Final=${notification.priority}`);

      // Automatically set autoAction for high-priority notifications if not provided
      if ((notification.priority === 'P0' || notification.priority === 'P1') && !notification.metadata?.autoAction) {
        notification.metadata = {
          ...notification.metadata,
          autoAction: 'escalate_to_admin'
        };
        console.log(`🤖 Auto-escalation enabled for high-priority event: ${notification.eventType} (${priority})`);
      }

      // 4. Deduplication check
      const shouldDeduplicate = await this.deduplicationService.shouldDeduplicate(notification);
      if (shouldDeduplicate) {
        this.metrics.deduplicatedNotifications++;

        await this.auditLogger.log({
          action: 'notification_deduplicated',
          notificationId: notification._id,
          userId: notification.userId,
          tenantId: notification.tenantId,
          priority: notification.priority
        });

        return { success: true, deduplicated: true, notificationId: notification._id };
      }

      // 5. Channel selection
      const selectedChannels = await this.channelSelector.selectChannels(notification, context);

      // 6. Rate limiting check
      const rateLimitCheck = await this.rateLimiter.checkRateLimit(notification, selectedChannels);
      if (rateLimitCheck.rateLimited) {
        this.metrics.rateLimitedNotifications++;

        await this.auditLogger.log({
          action: 'notification_rate_limited',
          notificationId: notification._id,
          userId: notification.userId,
          tenantId: notification.tenantId,
          priority: notification.priority,
          metadata: { reason: rateLimitCheck.reason, retryAfter: rateLimitCheck.retryAfter }
        });

        return {
          success: false,
          rateLimited: true,
          reason: rateLimitCheck.reason,
          retryAfter: rateLimitCheck.retryAfter,
          notificationId: notification._id
        };
      }

      // 7. Mask sensitive data
      const maskedNotification = await this.securityGuard.maskSensitiveData(notification);

      // 8. Save notification to database
      const savedNotification = await this.saveNotification(maskedNotification, selectedChannels);

      // 9. Deliver through selected channels
      const deliveryResults = await this.deliverThroughChannels(savedNotification, selectedChannels, context);

      // 10. Schedule reminders if needed
      await this.reminderEngine.scheduleReminders(savedNotification);

      // 11. Update metrics
      this.updateMetrics(deliveryResults, Date.now() - startTime);

      const processingTime = Date.now() - startTime;

      await this.auditLogger.log({
        action: 'notification_processed',
        notificationId: savedNotification._id,
        userId: savedNotification.userId,
        tenantId: savedNotification.tenantId,
        priority: savedNotification.priority,
        status: 'success',
        processingTime,
        metadata: {
          selectedChannels,
          deliveryResults,
          securityWarnings: securityCheck.warnings
        }
      });

      return {
        success: true,
        notificationId: savedNotification._id,
        priority: savedNotification.priority,
        channels: selectedChannels,
        deliveryResults,
        processingTime
      };

    } catch (error) {
      console.error('❌ Error processing notification:', error);

      const processingTime = Date.now() - startTime;
      this.metrics.failedDeliveries++;

      await this.auditLogger.log({
        action: 'notification_processing_failed',
        notificationId: notification?._id,
        userId: notification?.userId,
        tenantId: notification?.tenantId,
        error: error.message,
        processingTime,
        metadata: { originalData: notificationData }
      });

      return {
        success: false,
        error: error.message,
        notificationId: notification?._id,
        processingTime
      };
    }
  }

  /**
   * Create notification object from data
   */
  async createNotification(notificationData) {
    const notification = {
      _id: notificationData._id || new require('mongoose').Types.ObjectId(),
      userId: notificationData.userId,
      tenantId: notificationData.tenantId,
      recipient: notificationData.userId || notificationData.recipient,
      recipientModel: notificationData.metadata?.recipientModel || 'User',
      recipientType: notificationData.metadata?.recipientType || 'customer',
      eventType: notificationData.eventType,
      title: notificationData.title,
      message: notificationData.message,
      category: notificationData.category || 'general',
      priority: notificationData.priority || 'P3',
      severity: notificationData.severity || 'info',
      icon: notificationData.icon || 'bell',
      metadata: notificationData.metadata || {},
      createdAt: new Date(),
      isReminder: notificationData.isReminder || false,
      originalNotificationId: notificationData.originalNotificationId,
      reminderType: notificationData.reminderType
    };

    return notification;
  }

  /**
   * Save notification to database
   */
  async saveNotification(notification, selectedChannels) {
    try {
      // Prepare channels object
      const channels = {};
      for (const channel of selectedChannels) {
        channels[channel] = {
          selected: true,
          sent: false,
          attempts: 0,
          lastAttempt: null,
          deliveredAt: null,
          error: null
        };
      }

      const notificationDoc = new Notification({
        ...notification,
        channels,
        status: 'pending'
      });

      const savedNotification = await notificationDoc.save();

      await this.auditLogger.log({
        action: 'notification_saved',
        notificationId: savedNotification._id,
        userId: savedNotification.userId,
        tenantId: savedNotification.tenantId,
        priority: savedNotification.priority
      });

      return savedNotification;

    } catch (error) {
      console.error('❌ Error saving notification:', error);
      throw error;
    }
  }

  /**
   * Deliver notification through selected channels
   */
  async deliverThroughChannels(notification, channels, context) {
    const deliveryResults = {};

    for (const channel of channels) {
      try {
        const startTime = Date.now();
        let result;

        switch (channel) {
          case 'in_app':
            result = await this.deliverInApp(notification, context);
            break;
          case 'email':
            result = await this.deliverEmail(notification, context);
            break;
          case 'sms':
            result = await this.deliverSMS(notification, context);
            break;
          case 'whatsapp':
            result = await this.deliverWhatsApp(notification, context);
            break;
          case 'push':
            result = await this.deliverPush(notification, context);
            break;
          default:
            throw new Error(`Unknown channel: ${channel}`);
        }

        const deliveryTime = Date.now() - startTime;

        deliveryResults[channel] = {
          success: true,
          deliveryTime,
          ...result
        };

        // Update notification in database
        await this.updateNotificationChannelStatus(notification._id, channel, {
          sent: true,
          deliveredAt: new Date(),
          attempts: (notification.channels[channel]?.attempts || 0) + 1,
          lastAttempt: new Date()
        });

        // Update metrics
        this.metrics.channelMetrics[channel].sent++;
        this.metrics.successfulDeliveries++;

        await this.auditLogger.logChannelDelivery(
          channel,
          notification,
          'success',
          null,
          deliveryTime
        );

      } catch (error) {
        console.error(`❌ Error delivering to ${channel}:`, error);

        deliveryResults[channel] = {
          success: false,
          error: error.message
        };

        // Update notification in database
        await this.updateNotificationChannelStatus(notification._id, channel, {
          sent: false,
          error: error.message,
          attempts: (notification.channels[channel]?.attempts || 0) + 1,
          lastAttempt: new Date()
        });

        // Update metrics
        this.metrics.channelMetrics[channel].failed++;
        this.metrics.failedDeliveries++;

        await this.auditLogger.logChannelDelivery(
          channel,
          notification,
          'failed',
          error.message
        );
      }
    }

    return deliveryResults;
  }

  /**
   * Deliver in-app notification via Socket.IO
   */
  async deliverInApp(notification, context) {
    if (!this.connectionManager) {
      throw new Error('Connection manager not available for in-app delivery');
    }

    const payload = {
      id: notification._id,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      category: notification.category,
      severity: notification.severity,
      icon: notification.icon,
      eventType: notification.eventType,
      createdAt: notification.createdAt,
      metadata: notification.metadata,
      requiresAck: ['P0', 'P1'].includes(notification.priority)
    };

    let delivered = false;

    // 1. Direct user emission
    if (notification.userId) {
      delivered = this.connectionManager.emitToUser(
        notification.userId,
        'notification',
        payload
      );
    }

    // 2. Tenancy + Role emission
    if (notification.tenantId && notification.metadata?.recipientType) {
      console.log(`📡 Emitting to tenant role: ${notification.tenantId} | ${notification.metadata.recipientType}`);
      const roleDelivered = await this.emitToTenantRole(
        notification.tenantId,
        notification.metadata.recipientType,
        'notification',
        payload
      );
      delivered = delivered || roleDelivered;
    }
    // 3. Tenancy only emission
    else if (notification.tenantId) {
      console.log(`📡 Emitting to tenant: ${notification.tenantId}`);
      const tenantDelivered = this.connectionManager.emitToTenant(
        notification.tenantId,
        'notification',
        payload
      );
      delivered = delivered || tenantDelivered;
    }
    // 4. Global recipient type emission
    else if (notification.metadata?.recipientType) {
      console.log(`📡 Emitting to role: ${notification.metadata.recipientType}`);
      const roleDelivered = this.connectionManager.emitToRole(
        notification.metadata.recipientType,
        'notification',
        payload
      );
      delivered = delivered || roleDelivered;
    }

    // 5. Broadcast to platform admins (SuperAdmin) – P0, P1, and P2 so they get live notifications
    if (['P0', 'P1', 'P2'].includes(notification.priority)) {
      // 5a. Global SuperAdmin broadcast – all important priorities for platform visibility
      this.connectionManager.emitToRole('superadmin', 'notification', {
        ...payload,
        isBroadcast: true
      });
    }
    // 5b. P0/P1 only: high-priority copy for tenant_admin + tenant-scoped admin
    if (['P0', 'P1'].includes(notification.priority)) {
      this.connectionManager.emitToRole('tenant_admin', 'high_priority_notification', {
        ...payload,
        isBroadcast: true
      });
      if (notification.tenantId) {
        this.emitToTenantRole(notification.tenantId, 'admin', 'high_priority_notification', {
          ...payload,
          isBroadcast: true
        });
      }
    }

    console.log(`📤 In-App Delivery Summary: userId=${!!notification.userId}, tenantId=${!!notification.tenantId}, role=${!!notification.metadata?.recipientType}, delivered=${delivered}`);
    return {
      delivered,
      payload
    };
  }

  /**
   * Deliver email notification
   */
  async deliverEmail(notification, context) {
    const emailOptions = {
      to: notification.metadata?.email || notification.recipientEmail,
      subject: notification.title,
      html: notification.message
    };

    if (!emailOptions.to && notification.userId) {
      // Try to find user email if missing from metadata
      const User = require('../../models/User');
      const user = await User.findById(notification.userId).select('email');
      if (user?.email) {
        emailOptions.to = user.email;
      }
    }

    if (!emailOptions.to) {
      throw new Error('Recipient email not found');
    }

    const result = await sendEmail(emailOptions);

    return {
      provider: 'brevo_service',
      messageId: result.messageId,
      success: result.success
    };
  }

  /**
   * Deliver SMS notification
   */
  async deliverSMS(notification, context) {
    // SMS integration skipped - no free provider available
    console.log(`📱 SMS delivery skipped for ${notification._id} (No free provider configured)`);

    return {
      provider: 'none',
      skipped: true,
      reason: 'non-free'
    };
  }

  /**
   * Deliver WhatsApp notification
   */
  async deliverWhatsApp(notification, context) {
    // WhatsApp integration skipped - no free provider available
    console.log(`💬 WhatsApp delivery skipped for ${notification._id} (No free provider configured)`);

    return {
      provider: 'none',
      skipped: true,
      reason: 'non-free'
    };
  }

  /**
   * Deliver push notification
   */
  async deliverPush(notification, context) {
    // This would integrate with FCM, APNS, etc.
    console.log(`🔔 Push delivery for notification ${notification._id} - ${notification.title}`);

    // Simulate push delivery
    await new Promise(resolve => setTimeout(resolve, 80));

    return {
      provider: 'push_service',
      messageId: `push_${notification._id}_${Date.now()}`
    };
  }

  /**
   * Update notification channel status in database
   */
  async updateNotificationChannelStatus(notificationId, channel, status) {
    try {
      const updateData = {};
      for (const [key, value] of Object.entries(status)) {
        updateData[`channels.${channel}.${key}`] = value;
      }

      await Notification.findByIdAndUpdate(notificationId, { $set: updateData });

    } catch (error) {
      console.error('❌ Error updating notification channel status:', error);
    }
  }

  /**
   * Start queue processing
   */
  startQueueProcessing() {
    setInterval(async () => {
      if (!this.isProcessingQueue && this.processingQueue.length > 0) {
        await this.processQueue();
      }
    }, 1000); // Process queue every second
  }

  /**
   * Process notification queue
   */
  async processQueue() {
    if (this.isProcessingQueue || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      const batchSize = 10;
      const batch = this.processingQueue.splice(0, batchSize);

      const promises = batch.map(item =>
        this.processNotification(item.notification, item.context)
      );

      await Promise.allSettled(promises);

    } catch (error) {
      console.error('❌ Error processing notification queue:', error);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Add notification to queue
   */
  async queueNotification(notification, context = {}) {
    this.processingQueue.push({ notification, context });

    await this.auditLogger.log({
      action: 'notification_queued',
      metadata: {
        queueSize: this.processingQueue.length,
        notification: {
          eventType: notification.eventType,
          userId: notification.userId,
          tenantId: notification.tenantId
        }
      }
    });
  }

  /**
   * Update metrics
   */
  updateMetrics(deliveryResults, processingTime) {
    this.metrics.totalProcessed++;
    this.metrics.averageProcessingTime =
      (this.metrics.averageProcessingTime + processingTime) / 2;
  }

  /**
   * Emit to user (public method)
   */
  async emitToUser(userId, event, data) {
    console.log(`📡 SocketIONotificationEngine.emitToUser: userId=${userId}, event=${event}`);
    if (this.connectionManager) {
      const result = this.connectionManager.emitToUser(userId, event, data);
      console.log(`📤 emitToUser result: ${result}`);
      return result;
    }
    console.warn('❌ connectionManager not available in SocketIONotificationEngine');
    return false;
  }

  /**
   * Emit to tenant (public method)
   */
  async emitToTenant(tenantId, event, data) {
    if (this.connectionManager) {
      return this.connectionManager.emitToTenant(tenantId, event, data);
    }
    return false;
  }

  /**
   * Emit to specific role within a tenant
   */
  async emitToTenantRole(tenantId, role, event, data) {
    console.log(`📡 SocketIONotificationEngine.emitToTenantRole: tenantId=${tenantId}, role=${role}, event=${event}`);
    if (this.connectionManager && this.connectionManager.io) {
      const room = `tenant:${tenantId}:role:${role}`;
      this.connectionManager.io.to(room).emit(event, data);
      console.log(`📤 Emitted to room: ${room}`);
      return true;
    }
    return false;
  }

  /**
   * Emit to tenant admins (public method)
   */
  async emitToTenantAdmins(tenantId, event, data) {
    if (this.connectionManager) {
      // Use the newly implemented precise role-based room for the tenant
      return this.connectionManager.emitToTenantRole(tenantId, 'tenant_admin', event, data);
    }
    return false;
  }

  /**
   * Get engine statistics
   */
  async getStatistics() {
    const connectionStats = this.connectionManager ?
      this.connectionManager.getStatistics() : null;

    const rateLimiterStats = await this.rateLimiter.getStatistics();
    const deduplicationStats = await this.deduplicationService.getStatistics();
    const reminderStats = await this.reminderEngine.getStatistics();
    const securityStats = await this.securityGuard.getSecurityStatistics();

    return {
      engine: {
        isInitialized: this.isInitialized,
        isRunning: this.isRunning,
        queueSize: this.processingQueue.length,
        metrics: this.metrics
      },
      connections: connectionStats,
      rateLimiter: rateLimiterStats,
      deduplication: deduplicationStats,
      reminders: reminderStats,
      security: securityStats
    };
  }

  /**
   * Register event handler
   */
  registerEventHandler(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
  }

  /**
   * Trigger event handlers
   */
  async triggerEventHandlers(eventType, data) {
    if (this.eventHandlers.has(eventType)) {
      const handlers = this.eventHandlers.get(eventType);
      for (const handler of handlers) {
        try {
          await handler(data);
        } catch (error) {
          console.error(`❌ Error in event handler for ${eventType}:`, error);
        }
      }
    }
  }

  /**
   * Shutdown the engine
   */
  async shutdown() {
    console.log('🛑 Shutting down SocketIONotificationEngine...');

    this.isRunning = false;

    // Process remaining queue items
    if (this.processingQueue.length > 0) {
      console.log(`📤 Processing remaining ${this.processingQueue.length} notifications...`);
      await this.processQueue();
    }

    // Shutdown components
    if (this.connectionManager) {
      await this.connectionManager.shutdown();
    }

    await this.reminderEngine.stop();
    this.deduplicationService.destroy();
    this.rateLimiter.destroy();
    await this.auditLogger.destroy();

    await this.auditLogger.log({
      action: 'notification_engine_shutdown',
      metadata: { finalMetrics: this.metrics }
    });

    console.log('✅ SocketIONotificationEngine shutdown complete');
  }
}

module.exports = { SocketIONotificationEngine };