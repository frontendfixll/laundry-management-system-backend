const mongoose = require('mongoose');
const { NOTIFICATION_TYPES, RECIPIENT_TYPES } = require('../config/constants');

const notificationSchema = new mongoose.Schema({
  // Recipient info
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'recipientModel',
    required: true
  },
  recipientModel: {
    type: String,
    enum: ['User', 'SuperAdmin'],
    default: 'User'
  },
  recipientType: {
    type: String,
    enum: Object.values(RECIPIENT_TYPES),
    required: true
  },

  // For Socket.IO compatibility
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy'
  },

  // Tenancy (for tenant-specific notifications)
  tenancy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    index: true
  },

  // Notification content
  type: {
    type: String,
    // enum: Object.values(NOTIFICATION_TYPES), // Relaxed for custom types
    required: true
  },
  eventType: {
    type: String,
    default: function () { return this.type; }
  },
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    maxlength: 1000
  },
  category: {
    type: String,
    default: 'general'
  },

  // Priority system (P0-P4)
  priority: {
    type: String,
    enum: ['P0', 'P1', 'P2', 'P3', 'P4'],
    default: 'P3'
  },

  // Icon and styling
  icon: {
    type: String,
    default: 'bell' // lucide icon name
  },
  severity: {
    type: String,
    enum: ['info', 'success', 'warning', 'error'],
    default: 'info'
  },

  // Related data
  data: {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket' },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    tenancyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenancy' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    link: String, // URL to navigate to
    additionalData: mongoose.Schema.Types.Mixed
  },

  // Metadata for Socket.IO engine
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Read status
  isRead: { type: Boolean, default: false },
  readAt: Date,
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'failed'],
    default: 'pending'
  },

  // Delivery channels (enhanced for Socket.IO)
  channels: {
    inApp: {
      selected: { type: Boolean, default: true },
      sent: { type: Boolean, default: false },
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      attempts: { type: Number, default: 0 },
      lastAttempt: Date,
      error: String
    },
    email: {
      selected: { type: Boolean, default: false },
      sent: { type: Boolean, default: false },
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      attempts: { type: Number, default: 0 },
      lastAttempt: Date,
      error: String
    },
    sms: {
      selected: { type: Boolean, default: false },
      sent: { type: Boolean, default: false },
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      attempts: { type: Number, default: 0 },
      lastAttempt: Date,
      error: String
    },
    whatsapp: {
      selected: { type: Boolean, default: false },
      sent: { type: Boolean, default: false },
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      attempts: { type: Number, default: 0 },
      lastAttempt: Date,
      error: String
    },
    push: {
      selected: { type: Boolean, default: false },
      sent: { type: Boolean, default: false },
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      attempts: { type: Number, default: 0 },
      lastAttempt: Date,
      error: String
    }
  },

  // Legacy delivery status (for backward compatibility)
  deliveryStatus: {
    inApp: { delivered: { type: Boolean, default: true }, deliveredAt: { type: Date, default: Date.now } },
    email: { delivered: { type: Boolean, default: false }, deliveredAt: Date, error: String },
    sms: { delivered: { type: Boolean, default: false }, deliveredAt: Date, error: String },
    push: { delivered: { type: Boolean, default: false }, deliveredAt: Date, error: String }
  },

  // Acknowledgement system for P0/P1 notifications
  acknowledgement: {
    required: { type: Boolean, default: false },
    acknowledgedAt: Date,
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'recipientModel'
    }
  },

  // Reminder system
  reminders: [{
    scheduledAt: { type: Date, required: true },
    sentAt: Date,
    type: {
      type: String,
      enum: ['soft', 'escalation', 'final'],
      required: true
    },
    success: { type: Boolean, default: false },
    error: String
  }],

  // Reminder engine configuration
  reminderEngine: {
    enabled: { type: Boolean, default: false },
    scheduledAt: Date,
    autoActionExecuted: { type: Boolean, default: false },
    autoActionExecutedAt: Date,
    autoActionType: String
  },

  // Audit trail
  auditTrail: [{
    action: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    metadata: mongoose.Schema.Types.Mixed
  }],

  // Reminder-specific fields
  isReminder: { type: Boolean, default: false },
  originalNotificationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Notification'
  },
  reminderType: {
    type: String,
    enum: ['soft', 'escalation', 'final']
  },

  // Scheduling & expiry
  scheduledFor: Date,
  expiresAt: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } // 30 days
}, {
  timestamps: true
});

// Indexes for performance
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ recipientType: 1, tenancy: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ priority: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, createdAt: -1 });
notificationSchema.index({ eventType: 1 });
notificationSchema.index({ status: 1 });
notificationSchema.index({ 'reminderEngine.enabled': 1, 'reminders.scheduledAt': 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Mark as read
notificationSchema.methods.markAsRead = function () {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Acknowledge notification (for P0/P1)
notificationSchema.methods.acknowledge = function (acknowledgedBy) {
  this.acknowledgement.acknowledgedAt = new Date();
  this.acknowledgement.acknowledgedBy = acknowledgedBy;
  return this.save();
};

// Static: Create notification
notificationSchema.statics.createNotification = async function (data) {
  const notification = new this(data);
  await notification.save();
  return notification;
};

// Static: Get unread count
notificationSchema.statics.getUnreadCount = function (recipientId, recipientType) {
  const query = {
    recipient: recipientId,
    isRead: false,
    expiresAt: { $gt: new Date() }
  };
  if (recipientType) query.recipientType = recipientType;
  return this.countDocuments(query);
};

// Static: Get notifications for user
notificationSchema.statics.getForUser = async function (recipientId, options = {}) {
  const { page = 1, limit = 20, unreadOnly = false, priority = null } = options;
  const skip = (page - 1) * limit;

  const query = {
    recipient: recipientId,
    expiresAt: { $gt: new Date() }
  };
  if (unreadOnly) query.isRead = false;
  if (priority) query.priority = priority;

  const [notifications, total, unreadCount] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 }) // Newest first (chronological) instead of priority-first
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query),
    this.getUnreadCount(recipientId)
  ]);

  return {
    notifications,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    unreadCount
  };
};

// Static: Mark multiple as read
notificationSchema.statics.markManyAsRead = function (recipientId, notificationIds = []) {
  const query = { recipient: recipientId };
  if (notificationIds.length > 0) {
    query._id = { $in: notificationIds };
  }
  return this.updateMany(query, { $set: { isRead: true, readAt: new Date() } });
};

// Static: Delete all notifications for a user
notificationSchema.statics.deleteManyForUser = function (recipientId) {
  return this.deleteMany({ recipient: recipientId });
};

module.exports = mongoose.model('Notification', notificationSchema);
