/**
 * NotificationReminderEngine - Handles reminder scheduling and retry logic
 * Part of the Socket.IO Notification Engine Implementation
 */

const cron = require('node-cron');
const { Notification } = require('../../models/Notification');
const { NotificationAuditLogger } = require('./NotificationAuditLogger');
const { SocketIONotificationEngine } = require('./SocketIONotificationEngine');

class NotificationReminderEngine {
  constructor() {
    this.reminderSchedules = new Map();
    this.auditLogger = new NotificationAuditLogger();
    this.isRunning = false;
    
    // Reminder rules by priority
    this.reminderRules = {
      P0: { enabled: false, requiresAck: true },
      P1: { 
        enabled: true, 
        schedule: ['15m', '1h', '24h'], 
        autoAction: true,
        requiresAck: false 
      },
      P2: { 
        enabled: true, 
        schedule: ['1h', '24h'], 
        conditional: true,
        requiresAck: false 
      },
      P3: { enabled: false },
      P4: { enabled: false }
    };

    // Auto-action handlers
    this.autoActionHandlers = {
      'refresh_permissions': this.handleRefreshPermissions.bind(this),
      'cancel_order': this.handleCancelOrder.bind(this),
      'suspend_service': this.handleSuspendService.bind(this),
      'escalate_to_admin': this.handleEscalateToAdmin.bind(this)
    };
  }

  /**
   * Initialize the reminder engine
   */
  async initialize() {
    try {
      console.log('🔄 Initializing NotificationReminderEngine...');
      
      // Start the reminder processor (runs every minute)
      this.startReminderProcessor();
      
      // Process any pending reminders on startup
      await this.processPendingReminders();
      
      this.isRunning = true;
      console.log('✅ NotificationReminderEngine initialized successfully');
      
      await this.auditLogger.log({
        action: 'reminder_engine_started',
        metadata: { timestamp: new Date() }
      });
      
    } catch (error) {
      console.error('❌ Failed to initialize NotificationReminderEngine:', error);
      throw error;
    }
  }

  /**
   * Schedule reminders for a notification
   */
  async scheduleReminders(notification) {
    try {
      const rules = this.reminderRules[notification.priority];
      
      if (!rules || !rules.enabled) {
        return;
      }

      // Check conditional rules for P2
      if (notification.priority === 'P2' && rules.conditional) {
        if (!this.shouldScheduleP2Reminder(notification)) {
          return;
        }
      }

      const reminders = [];
      const baseTime = new Date();

      for (const interval of rules.schedule) {
        const reminderTime = this.calculateReminderTime(baseTime, interval);
        
        reminders.push({
          scheduledAt: reminderTime,
          type: this.getReminderType(interval, rules.schedule),
          sent: false,
          notificationId: notification._id
        });
      }

      // Update notification with reminder schedule
      await Notification.findByIdAndUpdate(notification._id, {
        $set: { 
          'reminders': reminders,
          'reminderEngine.enabled': true,
          'reminderEngine.scheduledAt': new Date()
        }
      });

      await this.auditLogger.log({
        action: 'reminders_scheduled',
        notificationId: notification._id,
        metadata: { 
          priority: notification.priority,
          reminderCount: reminders.length,
          schedule: rules.schedule
        }
      });

      console.log(`📅 Scheduled ${reminders.length} reminders for notification ${notification._id}`);

    } catch (error) {
      console.error('❌ Error scheduling reminders:', error);
      await this.auditLogger.log({
        action: 'reminder_scheduling_failed',
        notificationId: notification._id,
        error: error.message
      });
    }
  }

  /**
   * Start the reminder processor cron job
   */
  startReminderProcessor() {
    // Run every minute
    cron.schedule('* * * * *', async () => {
      if (this.isRunning) {
        await this.processPendingReminders();
      }
    });

    console.log('⏰ Reminder processor started (runs every minute)');
  }

  /**
   * Process all pending reminders
   */
  async processPendingReminders() {
    try {
      // Safety check for Notification model
      if (!Notification || typeof Notification.find !== 'function') {
        console.log('⚠️ Notification model not available yet, skipping reminder processing');
        return;
      }

      const now = new Date();
      
      // Find notifications with pending reminders
      const notifications = await Notification.find({
        'reminderEngine.enabled': true,
        'reminders': {
          $elemMatch: {
            scheduledAt: { $lte: now },
            sent: false
          }
        }
      }).populate('tenantId userId');

      for (const notification of notifications) {
        await this.processNotificationReminders(notification, now);
      }

    } catch (error) {
      console.error('❌ Error processing pending reminders:', error);
    }
  }

  /**
   * Process reminders for a specific notification
   */
  async processNotificationReminders(notification, currentTime) {
    try {
      const pendingReminders = notification.reminders.filter(
        reminder => reminder.scheduledAt <= currentTime && !reminder.sent
      );

      for (const reminder of pendingReminders) {
        await this.sendReminder(notification, reminder);
      }

      // Check if this was the final reminder and auto-action is needed
      const rules = this.reminderRules[notification.priority];
      if (rules.autoAction && this.isFinalReminder(notification, pendingReminders)) {
        await this.executeAutoAction(notification);
      }

    } catch (error) {
      console.error('❌ Error processing notification reminders:', error);
    }
  }

  /**
   * Send a specific reminder
   */
  async sendReminder(notification, reminder) {
    try {
      // Create reminder notification
      const reminderNotification = {
        ...notification.toObject(),
        _id: undefined,
        isReminder: true,
        originalNotificationId: notification._id,
        reminderType: reminder.type,
        title: this.generateReminderTitle(notification, reminder),
        message: this.generateReminderMessage(notification, reminder),
        createdAt: new Date()
      };

      // Send through Socket.IO engine
      const engine = new SocketIONotificationEngine();
      await engine.processNotification(reminderNotification);

      // Mark reminder as sent
      await Notification.findOneAndUpdate(
        { 
          _id: notification._id,
          'reminders._id': reminder._id 
        },
        {
          $set: {
            'reminders.$.sent': true,
            'reminders.$.sentAt': new Date(),
            'reminders.$.success': true
          }
        }
      );

      await this.auditLogger.log({
        action: 'reminder_sent',
        notificationId: notification._id,
        reminderId: reminder._id,
        metadata: { 
          type: reminder.type,
          priority: notification.priority
        }
      });

      console.log(`📨 Sent ${reminder.type} reminder for notification ${notification._id}`);

    } catch (error) {
      console.error('❌ Error sending reminder:', error);
      
      // Mark reminder as failed
      await Notification.findOneAndUpdate(
        { 
          _id: notification._id,
          'reminders._id': reminder._id 
        },
        {
          $set: {
            'reminders.$.sent': true,
            'reminders.$.sentAt': new Date(),
            'reminders.$.success': false,
            'reminders.$.error': error.message
          }
        }
      );
    }
  }

  /**
   * Execute auto-action for a notification
   */
  async executeAutoAction(notification) {
    try {
      const actionType = notification.metadata?.autoAction;
      
      if (!actionType || !this.autoActionHandlers[actionType]) {
        console.log(`⚠️ No auto-action handler for: ${actionType}`);
        return;
      }

      console.log(`🤖 Executing auto-action: ${actionType} for notification ${notification._id}`);
      
      await this.autoActionHandlers[actionType](notification);
      
      // Mark notification as auto-action completed
      await Notification.findByIdAndUpdate(notification._id, {
        $set: {
          'reminderEngine.autoActionExecuted': true,
          'reminderEngine.autoActionExecutedAt': new Date(),
          'reminderEngine.autoActionType': actionType
        }
      });

      await this.auditLogger.log({
        action: 'auto_action_executed',
        notificationId: notification._id,
        metadata: { actionType }
      });

    } catch (error) {
      console.error('❌ Error executing auto-action:', error);
      await this.auditLogger.log({
        action: 'auto_action_failed',
        notificationId: notification._id,
        error: error.message
      });
    }
  }

  /**
   * Auto-action handlers
   */
  async handleRefreshPermissions(notification) {
    // Trigger permission refresh for the user
    const engine = new SocketIONotificationEngine();
    await engine.emitToUser(notification.userId, 'permission_refresh_required', {
      reason: 'auto_action_reminder',
      originalNotification: notification._id
    });
  }

  async handleCancelOrder(notification) {
    // This would integrate with order management system
    console.log(`🚫 Auto-canceling order for notification ${notification._id}`);
    // Implementation depends on order system
  }

  async handleSuspendService(notification) {
    // This would integrate with service management
    console.log(`⏸️ Auto-suspending service for notification ${notification._id}`);
    // Implementation depends on service system
  }

  async handleEscalateToAdmin(notification) {
    // Escalate to tenant admin
    const engine = new SocketIONotificationEngine();
    await engine.emitToTenantAdmins(notification.tenantId, 'escalated_notification', {
      originalNotification: notification._id,
      escalationReason: 'reminder_timeout',
      priority: 'P0' // Escalate to highest priority
    });
  }

  /**
   * Helper methods
   */
  calculateReminderTime(baseTime, interval) {
    const time = new Date(baseTime);
    
    if (interval.endsWith('m')) {
      const minutes = parseInt(interval);
      time.setMinutes(time.getMinutes() + minutes);
    } else if (interval.endsWith('h')) {
      const hours = parseInt(interval);
      time.setHours(time.getHours() + hours);
    } else if (interval.endsWith('d')) {
      const days = parseInt(interval);
      time.setDate(time.getDate() + days);
    }
    
    return time;
  }

  getReminderType(interval, schedule) {
    const index = schedule.indexOf(interval);
    if (index === 0) return 'soft';
    if (index === schedule.length - 1) return 'final';
    return 'escalation';
  }

  shouldScheduleP2Reminder(notification) {
    // P2 conditional logic - only for certain event types
    const conditionalEvents = [
      'order_stuck',
      'payment_pending',
      'pickup_delayed',
      'refund_processing'
    ];
    
    return conditionalEvents.includes(notification.eventType);
  }

  isFinalReminder(notification, sentReminders) {
    const totalReminders = notification.reminders.length;
    const sentCount = notification.reminders.filter(r => r.sent).length;
    return sentCount >= totalReminders;
  }

  generateReminderTitle(notification, reminder) {
    const typePrefix = {
      'soft': '🔔 Reminder',
      'escalation': '⚠️ Important Reminder',
      'final': '🚨 Final Reminder'
    };
    
    return `${typePrefix[reminder.type]}: ${notification.title}`;
  }

  generateReminderMessage(notification, reminder) {
    const baseMessage = notification.message;
    
    switch (reminder.type) {
      case 'soft':
        return `This is a gentle reminder about: ${baseMessage}`;
      case 'escalation':
        return `This requires your attention: ${baseMessage}`;
      case 'final':
        return `Final reminder - action may be taken automatically: ${baseMessage}`;
      default:
        return baseMessage;
    }
  }

  /**
   * Stop the reminder engine
   */
  async stop() {
    this.isRunning = false;
    console.log('🛑 NotificationReminderEngine stopped');
    
    await this.auditLogger.log({
      action: 'reminder_engine_stopped',
      metadata: { timestamp: new Date() }
    });
  }

  /**
   * Get reminder statistics
   */
  async getStatistics() {
    try {
      const stats = await Notification.aggregate([
        {
          $match: {
            'reminderEngine.enabled': true
          }
        },
        {
          $group: {
            _id: '$priority',
            totalNotifications: { $sum: 1 },
            totalReminders: { $sum: { $size: '$reminders' } },
            sentReminders: {
              $sum: {
                $size: {
                  $filter: {
                    input: '$reminders',
                    cond: { $eq: ['$$this.sent', true] }
                  }
                }
              }
            },
            autoActionsExecuted: {
              $sum: {
                $cond: ['$reminderEngine.autoActionExecuted', 1, 0]
              }
            }
          }
        }
      ]);

      return {
        byPriority: stats,
        engineStatus: {
          isRunning: this.isRunning,
          startedAt: this.startedAt
        }
      };

    } catch (error) {
      console.error('❌ Error getting reminder statistics:', error);
      return null;
    }
  }
}

module.exports = { NotificationReminderEngine };