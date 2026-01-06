const mongoose = require('mongoose');
const { REFUND_STATUS, REFUND_TYPES } = require('../config/constants');

const refundSchema = new mongoose.Schema({
  // Tenancy Reference (Multi-tenant support)
  tenancy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    index: true
  },
  refundNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ticket: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ticket'
  },
  // Refund details
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  type: {
    type: String,
    enum: Object.values(REFUND_TYPES),
    default: REFUND_TYPES.PARTIAL
  },
  reason: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['quality', 'delay', 'missing_item', 'damaged', 'wrong_item', 'other'],
    required: true
  },
  // Status tracking
  status: {
    type: String,
    enum: Object.values(REFUND_STATUS),
    default: REFUND_STATUS.REQUESTED
  },
  // Request details
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  // Approval workflow
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  approvalNotes: String,
  // Rejection details
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: Date,
  rejectionReason: String,
  // Escalation
  isEscalated: {
    type: Boolean,
    default: false
  },
  escalatedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CenterAdmin'
  },
  escalatedAt: Date,
  escalationReason: String,
  // Processing details
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: Date,
  transactionId: String,
  // Payment details
  paymentMethod: {
    type: String,
    enum: ['original_method', 'bank_transfer', 'store_credit', 'cash'],
    default: 'original_method'
  },
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    accountHolderName: String
  },
  // Evidence/attachments
  attachments: [{
    filename: String,
    url: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Notes and history
  notes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    note: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  statusHistory: [{
    status: String,
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    notes: String
  }]
}, {
  timestamps: true
});

// Indexes
refundSchema.index({ refundNumber: 1 });
refundSchema.index({ order: 1 });
refundSchema.index({ customer: 1 });
refundSchema.index({ status: 1, createdAt: -1 });
refundSchema.index({ isEscalated: 1 });
refundSchema.index({ tenancy: 1, status: 1, createdAt: -1 }); // Compound index for tenancy-based filtering

// Generate refund number
refundSchema.pre('save', async function(next) {
  if (!this.refundNumber) {
    const count = await mongoose.model('Refund').countDocuments();
    this.refundNumber = `REF${Date.now()}${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Update status with history
refundSchema.methods.updateStatus = function(newStatus, changedBy, notes = '') {
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    changedBy,
    changedAt: new Date(),
    notes
  });
  return this.save();
};

// Approve refund
refundSchema.methods.approve = function(approvedBy, notes = '') {
  this.status = REFUND_STATUS.APPROVED;
  this.approvedBy = approvedBy;
  this.approvedAt = new Date();
  this.approvalNotes = notes;
  this.statusHistory.push({
    status: REFUND_STATUS.APPROVED,
    changedBy: approvedBy,
    changedAt: new Date(),
    notes
  });
  return this.save();
};

// Reject refund
refundSchema.methods.reject = function(rejectedBy, reason) {
  this.status = REFUND_STATUS.REJECTED;
  this.rejectedBy = rejectedBy;
  this.rejectedAt = new Date();
  this.rejectionReason = reason;
  this.statusHistory.push({
    status: REFUND_STATUS.REJECTED,
    changedBy: rejectedBy,
    changedAt: new Date(),
    notes: reason
  });
  return this.save();
};

// Escalate refund
refundSchema.methods.escalate = function(escalatedTo, reason) {
  this.isEscalated = true;
  this.escalatedTo = escalatedTo;
  this.escalatedAt = new Date();
  this.escalationReason = reason;
  this.statusHistory.push({
    status: 'escalated',
    changedAt: new Date(),
    notes: reason
  });
  return this.save();
};

// Process refund
refundSchema.methods.process = function(processedBy, transactionId) {
  this.status = REFUND_STATUS.PROCESSED;
  this.processedBy = processedBy;
  this.processedAt = new Date();
  this.transactionId = transactionId;
  this.statusHistory.push({
    status: REFUND_STATUS.PROCESSED,
    changedBy: processedBy,
    changedAt: new Date(),
    notes: `Transaction ID: ${transactionId}`
  });
  return this.save();
};

module.exports = mongoose.model('Refund', refundSchema);