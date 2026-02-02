const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderName: {
    type: String,
    required: true
  },
  senderRole: {
    type: String,
    required: true,
    enum: ['tenant_admin', 'platform_support', 'system']
  },
  message: {
    type: String,
    required: true
  },
  messageType: {
    type: String,
    enum: ['text', 'file', 'image', 'system'],
    default: 'text'
  },
  attachments: [{
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    url: String
  }],
  isInternal: {
    type: Boolean,
    default: false // Internal notes only visible to support team
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: ['sending', 'sent', 'delivered', 'read'],
    default: 'sent'
  }
}, {
  timestamps: true
});

const chatSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: true
  },
  tenantName: {
    type: String,
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  customerEmail: {
    type: String,
    required: true
  },
  assignedAgent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  agentName: String,
  status: {
    type: String,
    enum: ['active', 'waiting', 'resolved', 'closed'],
    default: 'active'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: [
      'payment', 
      'order', 
      'account', 
      'system', 
      'general', 
      'technical',
      'features',
      'billing',
      'support',
      'bug',
      'feedback',
      'integration',
      'api',
      'mobile',
      'web',
      'performance',
      'security',
      'data',
      'export',
      'import',
      'configuration',
      'training',
      'documentation'
    ],
    default: 'general'
  },
  messages: [chatMessageSchema],
  lastActivity: {
    type: Date,
    default: Date.now
  },
  unreadCount: {
    customer: { type: Number, default: 0 },
    support: { type: Number, default: 0 }
  },
  metadata: {
    userAgent: String,
    ipAddress: String,
    source: {
      type: String,
      enum: ['web', 'mobile', 'api'],
      default: 'web'
    }
  }
}, {
  timestamps: true
});

// Update lastActivity on message add
chatSessionSchema.pre('save', function(next) {
  if (this.isModified('messages')) {
    this.lastActivity = new Date();
  }
  next();
});

// Indexes for better performance
chatSessionSchema.index({ sessionId: 1 });
chatSessionSchema.index({ tenantId: 1, customerId: 1 });
chatSessionSchema.index({ assignedAgent: 1 });
chatSessionSchema.index({ status: 1 });
chatSessionSchema.index({ lastActivity: -1 });

module.exports = mongoose.model('ChatSession', chatSessionSchema);