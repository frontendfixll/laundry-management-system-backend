const mongoose = require('mongoose');

const UpgradeRequestSchema = new mongoose.Schema({
  // Basic Info
  tenancy: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenancy', required: true },
  fromPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingPlan', required: true },
  toPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingPlan', required: true },
  
  // Custom Pricing
  pricing: {
    originalPrice: { type: Number, required: true },
    customPrice: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    discountReason: { type: String, default: '' },
    currency: { type: String, default: 'INR' }
  },
  
  // Payment Terms
  paymentTerms: {
    method: { 
      type: String, 
      enum: ['online', 'offline', 'installments'], 
      default: 'online' 
    },
    dueDate: { type: Date, required: true },
    gracePeriod: { type: Number, default: 7 }, // days
    installments: {
      total: { type: Number, default: 1 },
      amount: { type: Number },
      schedule: [Date],
      paid: [{
        date: Date,
        amount: Number,
        method: String,
        transactionId: String,
        gatewayResponse: Object,
        recordedBy: mongoose.Schema.Types.ObjectId,
        recordedByModel: String
      }]
    }
  },
  
  // Feature Control
  featureAccess: {
    immediate: [String], // Features available immediately
    paymentRequired: [String], // Features locked until payment
    trial: [{
      feature: String,
      expiresAt: Date
    }],
    customLimits: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    }
  },
  
  // Communication
  communication: {
    emailSent: { type: Boolean, default: false },
    emailSentAt: Date,
    smsSent: { type: Boolean, default: false },
    smsSentAt: Date,
    customMessage: String,
    remindersSent: [Date],
    lastReminderAt: Date,
    escalationLevel: { type: Number, default: 0 }
  },
  
  // Payment Integration
  payment: {
    stripePaymentLinkId: String,
    stripePaymentLinkUrl: String,
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'TenancyInvoice' },
    totalPaid: { type: Number, default: 0 },
    remainingAmount: { type: Number },
    lastPaymentAt: Date
  },
  
  // Status & Tracking
  status: {
    type: String,
    enum: ['pending', 'partially_paid', 'paid', 'overdue', 'cancelled', 'completed', 'expired'],
    default: 'pending'
  },
  
  // Audit Trail
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  createdByModel: { type: String, enum: ['SalesUser', 'SuperAdmin'], required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId },
  updatedByModel: { type: String, enum: ['SalesUser', 'SuperAdmin'] },
  
  // History
  history: [{
    action: String,
    by: mongoose.Schema.Types.ObjectId,
    byModel: String,
    at: { type: Date, default: Date.now },
    details: Object,
    oldValues: Object,
    newValues: Object
  }],
  
  // Timestamps
  requestedAt: { type: Date, default: Date.now },
  expiresAt: Date,
  completedAt: Date,
  activatedAt: Date
}, {
  timestamps: true
});

// Indexes for performance
UpgradeRequestSchema.index({ tenancy: 1, status: 1 });
UpgradeRequestSchema.index({ status: 1, expiresAt: 1 });
UpgradeRequestSchema.index({ createdBy: 1, createdByModel: 1 });
UpgradeRequestSchema.index({ 'paymentTerms.dueDate': 1, status: 1 });

// Virtual for remaining amount calculation
UpgradeRequestSchema.virtual('calculatedRemainingAmount').get(function() {
  return Math.max(0, this.pricing.customPrice - this.payment.totalPaid);
});

// Methods
UpgradeRequestSchema.methods.calculateRemainingAmount = function() {
  const remaining = this.pricing.customPrice - this.payment.totalPaid;
  this.payment.remainingAmount = Math.max(0, remaining);
  return this.payment.remainingAmount;
};

UpgradeRequestSchema.methods.isOverdue = function() {
  return new Date() > this.paymentTerms.dueDate && 
         ['pending', 'partially_paid'].includes(this.status);
};

UpgradeRequestSchema.methods.isExpired = function() {
  return this.expiresAt && new Date() > this.expiresAt;
};

UpgradeRequestSchema.methods.addPayment = function(paymentData) {
  // Add payment record
  this.paymentTerms.installments.paid.push({
    date: paymentData.date || new Date(),
    amount: paymentData.amount,
    method: paymentData.method || 'online',
    transactionId: paymentData.transactionId || '',
    gatewayResponse: paymentData.gatewayResponse || {},
    recordedBy: paymentData.recordedBy,
    recordedByModel: paymentData.recordedByModel
  });
  
  // Update totals
  this.payment.totalPaid += paymentData.amount;
  this.payment.lastPaymentAt = new Date();
  this.calculateRemainingAmount();
  
  // Update status
  if (this.payment.remainingAmount <= 0) {
    this.status = 'paid';
    this.completedAt = new Date();
  } else {
    this.status = 'partially_paid';
  }
  
  // Add history
  this.addHistory('payment_received', paymentData.recordedBy, paymentData.recordedByModel, {
    amount: paymentData.amount,
    method: paymentData.method,
    transactionId: paymentData.transactionId,
    remainingAmount: this.payment.remainingAmount
  });
  
  return this;
};

UpgradeRequestSchema.methods.addHistory = function(action, by, byModel, details = {}) {
  this.history.push({
    action,
    by,
    byModel,
    details,
    at: new Date()
  });
  return this;
};

UpgradeRequestSchema.methods.sendReminder = function(reminderType = 'payment_due') {
  this.communication.remindersSent.push(new Date());
  this.communication.lastReminderAt = new Date();
  this.communication.escalationLevel += 1;
  
  this.addHistory('reminder_sent', null, null, {
    reminderType,
    escalationLevel: this.communication.escalationLevel,
    daysOverdue: Math.ceil((new Date() - this.paymentTerms.dueDate) / (1000 * 60 * 60 * 24))
  });
  
  return this;
};

UpgradeRequestSchema.methods.extendDueDate = function(newDueDate, extendedBy, extendedByModel, reason = '') {
  const oldDueDate = this.paymentTerms.dueDate;
  this.paymentTerms.dueDate = newDueDate;
  
  // Reset overdue status if applicable
  if (this.status === 'overdue' && new Date() <= newDueDate) {
    this.status = this.payment.totalPaid > 0 ? 'partially_paid' : 'pending';
  }
  
  this.addHistory('due_date_extended', extendedBy, extendedByModel, {
    oldDueDate,
    newDueDate,
    reason,
    extensionDays: Math.ceil((newDueDate - oldDueDate) / (1000 * 60 * 60 * 24))
  });
  
  return this;
};

UpgradeRequestSchema.methods.cancel = function(cancelledBy, cancelledByModel, reason = '') {
  this.status = 'cancelled';
  
  this.addHistory('upgrade_cancelled', cancelledBy, cancelledByModel, {
    reason,
    totalPaid: this.payment.totalPaid,
    refundRequired: this.payment.totalPaid > 0
  });
  
  return this;
};

UpgradeRequestSchema.methods.activate = function(activatedBy, activatedByModel) {
  if (this.status !== 'paid') {
    throw new Error('Cannot activate upgrade request that is not fully paid');
  }
  
  this.status = 'completed';
  this.activatedAt = new Date();
  
  this.addHistory('upgrade_activated', activatedBy, activatedByModel, {
    totalPaid: this.payment.totalPaid,
    activationDate: this.activatedAt
  });
  
  return this;
};

// Pre-save middleware
UpgradeRequestSchema.pre('save', function(next) {
  // Calculate remaining amount
  this.calculateRemainingAmount();
  
  // Update overdue status
  if (this.isOverdue() && this.status === 'pending') {
    this.status = 'overdue';
  }
  
  // Set expiration if not set
  if (!this.expiresAt) {
    this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  }
  
  next();
});

// Static methods
UpgradeRequestSchema.statics.findOverdue = function() {
  return this.find({
    status: { $in: ['pending', 'partially_paid'] },
    'paymentTerms.dueDate': { $lt: new Date() }
  });
};

UpgradeRequestSchema.statics.findExpiring = function(days = 7) {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + days);
  
  return this.find({
    status: { $in: ['pending', 'partially_paid'] },
    expiresAt: { $lte: expiryDate, $gt: new Date() }
  });
};

UpgradeRequestSchema.statics.getStatistics = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalValue: { $sum: '$pricing.customPrice' },
        totalPaid: { $sum: '$payment.totalPaid' }
      }
    }
  ]);
};

module.exports = mongoose.model('UpgradeRequest', UpgradeRequestSchema);