const mongoose = require('mongoose');
const { TICKET_STATUS, TICKET_PRIORITY, TICKET_CATEGORIES } = require('../config/constants');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'messages.senderModel',
    required: true
  },
  senderModel: {
    type: String,
    required: true,
    enum: ['User', 'SuperAdmin']
  },
  senderRole: {
    type: String,
    required: true,
    enum: ['tenant_admin', 'tenant_staff', 'platform_support', 'super_admin']
  },
  message: {
    type: String,
    required: true
  },
  attachments: [{
    filename: String,
    url: String,
    size: Number,
    mimeType: String
  }],
  isInternal: {
    type: Boolean,
    default: false // Internal notes only visible to platform staff
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const tenantTicketSchema = new mongoose.Schema({
  // Auto-generated fields
  ticketNumber: {
    type: String,
    unique: true,
    required: true
  },
  
  // Tenant Context (Auto-filled)
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: true
  },
  tenantName: {
    type: String,
    required: true
  },
  tenantPlan: {
    type: String,
    required: true
  },
  tenantStatus: {
    type: String,
    required: true
  },
  
  // Creator Information
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  creatorRole: {
    type: String,
    required: true,
    enum: ['tenant_admin', 'tenant_staff', 'platform_support']
  },
  creatorEmail: {
    type: String,
    required: true
  },
  creatorPhone: {
    type: String
  },
  
  // Ticket Content (User Input)
  category: {
    type: String,
    required: true,
    enum: [
      'order_operations',
      'payment_settlement', 
      'refunds',
      'account_subscription',
      'technical_bug',
      'how_to_configuration',
      'security_compliance'
    ]
  },
  subcategory: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true
  },
  
  // Priority (System Controlled)
  perceivedPriority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  systemPriority: {
    type: String,
    enum: Object.values(TICKET_PRIORITY),
    required: true
  },
  
  // Status Management
  status: {
    type: String,
    enum: ['new', 'acknowledged', 'in_progress', 'waiting_for_tenant', 'escalated', 'resolved', 'closed'],
    default: 'new'
  },
  
  // Assignment
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin'
  },
  assignedTeam: {
    type: String,
    enum: ['support', 'finance', 'engineering', 'security']
  },
  
  // SLA Management
  slaDeadline: {
    type: Date,
    required: true
  },
  responseDeadline: {
    type: Date,
    required: true
  },
  slaBreached: {
    type: Boolean,
    default: false
  },
  
  // Business Impact
  businessImpact: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    required: true
  },
  revenueImpact: {
    type: Number,
    default: 0
  },
  affectedOrdersCount: {
    type: Number,
    default: 0
  },
  
  // Linked Entities (Conditional)
  linkedOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  linkedPaymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
  },
  linkedSettlementPeriod: {
    type: String
  },
  refundAmount: {
    type: Number
  },
  
  // Communication
  messages: [messageSchema],
  
  // Attachments
  attachments: [{
    filename: String,
    url: String,
    size: Number,
    mimeType: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'attachments.uploaderModel'
    },
    uploaderModel: {
      type: String,
      enum: ['User', 'SuperAdmin']
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Resolution
  resolution: {
    explanation: String,
    actionTaken: String,
    evidence: [String], // URLs to evidence files
    nextSteps: String,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SuperAdmin'
    },
    resolvedAt: Date,
    tenantAccepted: {
      type: Boolean,
      default: false
    },
    tenantAcceptedAt: Date
  },
  
  // Escalation
  escalation: {
    escalatedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SuperAdmin'
    },
    escalatedAt: Date,
    escalationReason: String,
    escalationLevel: {
      type: Number,
      default: 0
    }
  },
  
  // Auto-close
  autoCloseAt: Date,
  autoClosePrevented: {
    type: Boolean,
    default: false
  },
  
  // Audit Trail
  statusHistory: [{
    status: String,
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'statusHistory.changedByModel'
    },
    changedByModel: {
      type: String,
      enum: ['User', 'SuperAdmin']
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    reason: String
  }],
  
  // Metadata
  tags: [String],
  internalNotes: String, // Only visible to platform staff
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastActivityAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for performance
tenantTicketSchema.index({ tenantId: 1, status: 1 });
tenantTicketSchema.index({ ticketNumber: 1 });
tenantTicketSchema.index({ createdBy: 1 });
tenantTicketSchema.index({ assignedTo: 1 });
tenantTicketSchema.index({ slaDeadline: 1 });
tenantTicketSchema.index({ systemPriority: 1, status: 1 });
tenantTicketSchema.index({ category: 1, subcategory: 1 });

// Pre-save middleware to generate ticket number
tenantTicketSchema.pre('save', async function(next) {
  if (this.isNew && !this.ticketNumber) {
    try {
      // Generate ticket number: TT-YYYYMMDD-XXXX
      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
      
      // Find the last ticket number for today
      const TenantTicket = this.constructor;
      const lastTicket = await TenantTicket.findOne({
        ticketNumber: new RegExp(`^TT-${dateStr}-`)
      }).sort({ ticketNumber: -1 });
      
      let sequence = 1;
      if (lastTicket) {
        const lastSequence = parseInt(lastTicket.ticketNumber.split('-')[2]);
        if (!isNaN(lastSequence)) {
          sequence = lastSequence + 1;
        }
      }
      
      this.ticketNumber = `TT-${dateStr}-${sequence.toString().padStart(4, '0')}`;
      console.log('🎫 Generated ticket number:', this.ticketNumber);
    } catch (error) {
      console.error('❌ Error generating ticket number:', error);
      return next(error);
    }
  }
  
  this.updatedAt = new Date();
  this.lastActivityAt = new Date();
  next();
});

// Method to calculate system priority
tenantTicketSchema.methods.calculateSystemPriority = function() {
  const { category, tenantPlan, businessImpact, affectedOrdersCount, revenueImpact } = this;
  
  // Base priority from category
  let priority = 'medium';
  
  if (category === 'payment_settlement' && businessImpact === 'critical') {
    priority = 'critical'; // P0: Payment deducted, no order
  } else if (category === 'payment_settlement' || (category === 'technical_bug' && businessImpact === 'high')) {
    priority = 'high'; // P1: Payout delayed, major bug
  } else if (category === 'order_operations' || category === 'refunds') {
    priority = 'medium'; // P2: Order workflow issue
  } else if (category === 'how_to_configuration' || category === 'account_subscription') {
    priority = 'low'; // P3: How-to questions
  }
  
  // Adjust based on tenant plan
  if (tenantPlan === 'enterprise' || tenantPlan === 'premium') {
    if (priority === 'medium') priority = 'high';
    if (priority === 'low') priority = 'medium';
  }
  
  // Adjust based on business impact
  if (businessImpact === 'critical' && priority !== 'critical') {
    priority = 'high';
  }
  
  // Adjust based on affected orders
  if (affectedOrdersCount > 50) {
    priority = 'high';
  }
  
  // Adjust based on revenue impact
  if (revenueImpact > 10000) {
    priority = 'critical';
  } else if (revenueImpact > 5000) {
    priority = 'high';
  }
  
  return priority;
};

// Method to calculate SLA deadlines
tenantTicketSchema.methods.calculateSLADeadlines = function() {
  const now = new Date();
  const priority = this.systemPriority;
  const tenantPlan = this.tenantPlan;
  
  // Base SLA in hours
  let responseSLA = 24; // 24 hours default
  let resolutionSLA = 72; // 72 hours default
  
  // Adjust based on priority
  switch (priority) {
    case 'critical':
      responseSLA = 1;
      resolutionSLA = 4;
      break;
    case 'high':
      responseSLA = 4;
      resolutionSLA = 24;
      break;
    case 'medium':
      responseSLA = 24;
      resolutionSLA = 72;
      break;
    case 'low':
      responseSLA = 72;
      resolutionSLA = 168; // 1 week
      break;
  }
  
  // Adjust based on tenant plan
  if (tenantPlan === 'enterprise') {
    responseSLA = Math.max(1, responseSLA / 2);
    resolutionSLA = Math.max(4, resolutionSLA / 2);
  } else if (tenantPlan === 'premium') {
    responseSLA = Math.max(2, responseSLA * 0.75);
    resolutionSLA = Math.max(8, resolutionSLA * 0.75);
  }
  
  this.responseDeadline = new Date(now.getTime() + responseSLA * 60 * 60 * 1000);
  this.slaDeadline = new Date(now.getTime() + resolutionSLA * 60 * 60 * 1000);
};

// Method to add message
tenantTicketSchema.methods.addMessage = function(messageData) {
  this.messages.push(messageData);
  this.lastActivityAt = new Date();
  
  // Update status if first response from platform
  if (this.status === 'new' && messageData.senderRole !== 'tenant_admin' && messageData.senderRole !== 'tenant_staff') {
    this.status = 'acknowledged';
    this.statusHistory.push({
      status: 'acknowledged',
      changedBy: messageData.sender,
      changedByModel: messageData.senderModel,
      reason: 'First response from platform support'
    });
  }
  
  return this.save();
};

// Method to escalate ticket
tenantTicketSchema.methods.escalate = function(escalationData) {
  this.status = 'escalated';
  this.escalation = {
    escalatedTo: escalationData.escalatedTo,
    escalatedAt: new Date(),
    escalationReason: escalationData.reason,
    escalationLevel: (this.escalation?.escalationLevel || 0) + 1
  };
  
  this.statusHistory.push({
    status: 'escalated',
    changedBy: escalationData.escalatedBy,
    changedByModel: 'SuperAdmin',
    reason: escalationData.reason
  });
  
  return this.save();
};

// Method to resolve ticket
tenantTicketSchema.methods.resolve = function(resolutionData) {
  this.status = 'resolved';
  this.resolution = {
    explanation: resolutionData.explanation,
    actionTaken: resolutionData.actionTaken,
    evidence: resolutionData.evidence || [],
    nextSteps: resolutionData.nextSteps,
    resolvedBy: resolutionData.resolvedBy,
    resolvedAt: new Date()
  };
  
  // Set auto-close date (7 days from resolution)
  this.autoCloseAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  
  this.statusHistory.push({
    status: 'resolved',
    changedBy: resolutionData.resolvedBy,
    changedByModel: 'SuperAdmin',
    reason: 'Ticket resolved by platform support'
  });
  
  return this.save();
};

module.exports = mongoose.model('TenantTicket', tenantTicketSchema);