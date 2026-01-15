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
  
  // Tenancy (for tenant-specific notifications)
  tenancy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    index: true
  },
  
  // Notification content
  type: {
    type: String,
    enum: Object.values(NOTIFICATION_TYPES),
    required: true
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
  
  // Read status
  isRead: { type: Boolean, default: false },
  readAt: Date,
  
  // Delivery channels
  channels: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
    push: { type: Boolean, default: false }
  },
  
  // Delivery status
  deliveryStatus: {
    inApp: { delivered: { type: Boolean, default: true }, deliveredAt: { type: Date, default: Date.now } },
    email: { delivered: { type: Boolean, default: false }, deliveredAt: Date, error: String },
    sms: { delivered: { type: Boolean, default: false }, deliveredAt: Date, error: String },
    push: { delivered: { type: Boolean, default: false }, deliveredAt: Date, error: String }
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
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Mark as read
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Static: Create notification
notificationSchema.statics.createNotification = async function(data) {
  const notification = new this(data);
  await notification.save();
  return notification;
};

// Static: Get unread count
notificationSchema.statics.getUnreadCount = function(recipientId, recipientType) {
  const query = {
    recipient: recipientId,
    isRead: false,
    expiresAt: { $gt: new Date() }
  };
  if (recipientType) query.recipientType = recipientType;
  return this.countDocuments(query);
};

// Static: Get notifications for user
notificationSchema.statics.getForUser = async function(recipientId, options = {}) {
  const { page = 1, limit = 20, unreadOnly = false } = options;
  const skip = (page - 1) * limit;
  
  const query = {
    recipient: recipientId,
    expiresAt: { $gt: new Date() }
  };
  if (unreadOnly) query.isRead = false;
  
  const [notifications, total, unreadCount] = await Promise.all([
    this.find(query)
      .sort({ createdAt: -1 })
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
notificationSchema.statics.markManyAsRead = function(recipientId, notificationIds = []) {
  const query = { recipient: recipientId };
  if (notificationIds.length > 0) {
    query._id = { $in: notificationIds };
  }
  return this.updateMany(query, { $set: { isRead: true, readAt: new Date() } });
};

module.exports = mongoose.model('Notification', notificationSchema);
