const mongoose = require('mongoose');

// Transaction line items schema for detailed breakdown
const lineItemSchema = new mongoose.Schema({
  // Item details
  type: {
    type: String,
    enum: ['addon', 'discount', 'tax', 'proration', 'credit', 'refund'],
    required: true
  },
  
  description: { type: String, required: true },
  
  // Pricing
  unitPrice: { type: Number, required: true },
  quantity: { type: Number, default: 1 },
  amount: { type: Number, required: true }, // unitPrice * quantity
  
  // Add-on reference (for addon type)
  addOn: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AddOn'
  },
  
  // Billing period (for recurring items)
  billingPeriod: {
    start: { type: Date },
    end: { type: Date }
  },
  
  // Proration details
  prorationDetails: {
    originalAmount: { type: Number },
    prorationFactor: { type: Number },
    reason: { type: String }
  },
  
  // Tax details
  taxDetails: {
    rate: { type: Number },
    amount: { type: Number },
    type: { type: String } // 'GST', 'VAT', etc.
  },
  
  // Discount details
  discountDetails: {
    type: { type: String, enum: ['percentage', 'fixed'] },
    value: { type: Number },
    code: { type: String },
    reason: { type: String }
  }
}, { _id: true });

// Payment details schema
const paymentDetailsSchema = new mongoose.Schema({
  // Payment method
  method: {
    type: String,
    enum: ['card', 'bank_transfer', 'upi', 'wallet', 'manual', 'credits'],
    required: true
  },
  
  // Gateway details
  gateway: { type: String }, // 'stripe', 'razorpay', etc.
  gatewayTransactionId: { type: String },
  gatewayResponse: { type: mongoose.Schema.Types.Mixed },
  
  // Card details (if applicable)
  cardDetails: {
    last4: { type: String },
    brand: { type: String },
    expiryMonth: { type: Number },
    expiryYear: { type: Number }
  },
  
  // Bank details (if applicable)
  bankDetails: {
    accountNumber: { type: String },
    ifscCode: { type: String },
    bankName: { type: String }
  },
  
  // UPI details (if applicable)
  upiDetails: {
    vpa: { type: String },
    transactionId: { type: String }
  },
  
  // Processing details
  processingFee: { type: Number, default: 0 },
  netAmount: { type: Number }, // Amount after processing fee
  
  // Failure details
  failureReason: { type: String },
  failureCode: { type: String },
  retryCount: { type: Number, default: 0 }
}, { _id: false });

// Refund details schema
const refundDetailsSchema = new mongoose.Schema({
  // Refund amount and reason
  amount: { type: Number, required: true },
  reason: { type: String, required: true },
  
  // Processing details
  processedAt: { type: Date, default: Date.now },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'refundDetails.processedByModel'
  },
  processedByModel: {
    type: String,
    enum: ['SuperAdmin', 'SalesUser', 'System']
  },
  
  // Gateway details
  gatewayRefundId: { type: String },
  gatewayResponse: { type: mongoose.Schema.Types.Mixed },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed'],
    default: 'pending'
  },
  
  // Failure details
  failureReason: { type: String },
  
  // Notes
  notes: { type: String }
}, { _id: true, timestamps: true });

const addOnTransactionSchema = new mongoose.Schema({
  // References
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: [true, 'Tenant is required'],
    index: true
  },
  
  tenantAddOn: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenantAddOn',
    index: true
  },
  
  // Transaction identification
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  invoiceNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // Transaction type
  type: {
    type: String,
    enum: ['purchase', 'renewal', 'upgrade', 'downgrade', 'refund', 'credit', 'adjustment'],
    required: true,
    index: true
  },
  
  // Transaction status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
    default: 'pending',
    index: true
  },
  
  // Amount details
  amount: {
    subtotal: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
    currency: { type: String, default: 'INR' }
  },
  
  // Line items breakdown
  lineItems: [lineItemSchema],
  
  // Payment details
  paymentDetails: paymentDetailsSchema,
  
  // Billing period (for recurring transactions)
  billingPeriod: {
    start: { type: Date },
    end: { type: Date }
  },
  
  // Due date
  dueDate: { type: Date },
  
  // Payment dates
  paidAt: { type: Date },
  failedAt: { type: Date },
  
  // Refund information
  refunds: [refundDetailsSchema],
  totalRefunded: { type: Number, default: 0 },
  
  // Transaction source
  source: {
    type: String,
    enum: ['marketplace', 'admin_panel', 'sales_portal', 'api', 'auto_renewal'],
    default: 'marketplace'
  },
  
  // User who initiated the transaction
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'initiatedByModel'
  },
  
  initiatedByModel: {
    type: String,
    enum: ['User', 'SuperAdmin', 'SalesUser', 'System']
  },
  
  // Approval workflow (for high-value transactions)
  approval: {
    required: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'approved', 'rejected'] },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'approval.approvedByModel'
    },
    approvedByModel: {
      type: String,
      enum: ['SuperAdmin', 'SalesUser']
    },
    approvedAt: { type: Date },
    rejectionReason: { type: String }
  },
  
  // Proration details (for mid-cycle changes)
  proration: {
    isProrated: { type: Boolean, default: false },
    originalAmount: { type: Number },
    prorationFactor: { type: Number },
    reason: { type: String },
    calculatedAt: { type: Date }
  },
  
  // Discount information
  discounts: [{
    code: { type: String },
    type: { type: String, enum: ['percentage', 'fixed'] },
    value: { type: Number },
    amount: { type: Number },
    reason: { type: String },
    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'discounts.appliedByModel'
    },
    appliedByModel: {
      type: String,
      enum: ['SuperAdmin', 'SalesUser', 'System']
    }
  }],
  
  // Tax information
  taxDetails: {
    rate: { type: Number, default: 18 }, // GST rate
    amount: { type: Number, default: 0 },
    type: { type: String, default: 'GST' },
    taxId: { type: String }, // Tax registration number
    address: {
      line1: { type: String },
      city: { type: String },
      state: { type: String },
      country: { type: String },
      pincode: { type: String }
    }
  },
  
  // Retry information (for failed transactions)
  retryInfo: {
    maxRetries: { type: Number, default: 3 },
    currentRetry: { type: Number, default: 0 },
    nextRetryAt: { type: Date },
    lastRetryAt: { type: Date },
    retryReason: { type: String }
  },
  
  // Webhook information
  webhooks: [{
    event: { type: String },
    url: { type: String },
    status: { type: String, enum: ['pending', 'sent', 'failed'] },
    response: { type: mongoose.Schema.Types.Mixed },
    sentAt: { type: Date },
    retryCount: { type: Number, default: 0 }
  }],
  
  // Metadata and notes
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  },
  
  notes: [{
    content: { type: String, required: true },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'notes.addedByModel'
    },
    addedByModel: {
      type: String,
      enum: ['SuperAdmin', 'SalesUser', 'User']
    },
    addedAt: { type: Date, default: Date.now },
    isInternal: { type: Boolean, default: false }
  }],
  
  // Audit trail
  auditTrail: [{
    action: { type: String, required: true },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'auditTrail.performedByModel'
    },
    performedByModel: {
      type: String,
      enum: ['SuperAdmin', 'SalesUser', 'User', 'System']
    },
    performedAt: { type: Date, default: Date.now },
    details: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String }
  }],
  
  // Soft delete
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'deletedByModel'
  },
  deletedByModel: {
    type: String,
    enum: ['SuperAdmin', 'System']
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
addOnTransactionSchema.index({ tenant: 1, createdAt: -1 });
addOnTransactionSchema.index({ status: 1, dueDate: 1 });
addOnTransactionSchema.index({ type: 1, status: 1 });
addOnTransactionSchema.index({ 'paymentDetails.gatewayTransactionId': 1 });
addOnTransactionSchema.index({ invoiceNumber: 1 }, { unique: true, sparse: true });
addOnTransactionSchema.index({ 'retryInfo.nextRetryAt': 1 });

// Virtual for net amount after refunds
addOnTransactionSchema.virtual('netAmount').get(function() {
  return this.amount.total - this.totalRefunded;
});

// Virtual for payment status
addOnTransactionSchema.virtual('paymentStatus').get(function() {
  if (this.totalRefunded >= this.amount.total) return 'refunded';
  if (this.totalRefunded > 0) return 'partially_refunded';
  if (this.status === 'completed') return 'paid';
  if (this.status === 'failed') return 'failed';
  return 'pending';
});

// Virtual for formatted amounts
addOnTransactionSchema.virtual('formattedAmount').get(function() {
  const currency = this.amount.currency || 'INR';
  const symbol = currency === 'INR' ? '₹' : '$';
  
  return {
    subtotal: `${symbol}${this.amount.subtotal}`,
    tax: `${symbol}${this.amount.tax}`,
    discount: `${symbol}${this.amount.discount}`,
    total: `${symbol}${this.amount.total}`,
    refunded: `${symbol}${this.totalRefunded}`,
    net: `${symbol}${this.netAmount}`
  };
});

// Pre-save middleware
addOnTransactionSchema.pre('save', function(next) {
  // Generate transaction ID if not provided
  if (!this.transactionId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.transactionId = `TXN-${timestamp}-${random}`;
  }
  
  // Generate invoice number for completed transactions
  if (this.status === 'completed' && !this.invoiceNumber) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.invoiceNumber = `INV-${year}${month}${day}-${random}`;
  }
  
  // Calculate total refunded amount
  this.totalRefunded = this.refunds.reduce((total, refund) => {
    return refund.status === 'completed' ? total + refund.amount : total;
  }, 0);
  
  // Set paid date when status changes to completed
  if (this.status === 'completed' && !this.paidAt) {
    this.paidAt = new Date();
  }
  
  // Set failed date when status changes to failed
  if (this.status === 'failed' && !this.failedAt) {
    this.failedAt = new Date();
  }
  
  next();
});

// Instance methods
addOnTransactionSchema.methods.addLineItem = function(itemData) {
  this.lineItems.push(itemData);
  this.recalculateAmounts();
  return this;
};

addOnTransactionSchema.methods.recalculateAmounts = function() {
  let subtotal = 0;
  let tax = 0;
  let discount = 0;
  
  this.lineItems.forEach(item => {
    if (item.type === 'addon') {
      subtotal += item.amount;
    } else if (item.type === 'tax') {
      tax += item.amount;
    } else if (item.type === 'discount') {
      discount += Math.abs(item.amount); // Discounts are negative
    }
  });
  
  this.amount.subtotal = subtotal;
  this.amount.tax = tax;
  this.amount.discount = discount;
  this.amount.total = subtotal + tax - discount;
  
  return this;
};

addOnTransactionSchema.methods.addRefund = function(refundData) {
  const refund = {
    ...refundData,
    status: 'pending'
  };
  
  this.refunds.push(refund);
  return this;
};

addOnTransactionSchema.methods.processRefund = async function(refundId, gatewayResponse) {
  const refund = this.refunds.id(refundId);
  if (!refund) {
    throw new Error('Refund not found');
  }
  
  refund.status = 'completed';
  refund.gatewayResponse = gatewayResponse;
  refund.processedAt = new Date();
  
  // Update total refunded amount
  this.totalRefunded = this.refunds.reduce((total, r) => {
    return r.status === 'completed' ? total + r.amount : total;
  }, 0);
  
  // Update transaction status if fully refunded
  if (this.totalRefunded >= this.amount.total) {
    this.status = 'refunded';
  }
  
  return this.save();
};

addOnTransactionSchema.methods.addAuditEntry = function(action, performedBy, performedByModel, details = {}) {
  this.auditTrail.push({
    action,
    performedBy,
    performedByModel,
    details,
    performedAt: new Date()
  });
  
  return this;
};

addOnTransactionSchema.methods.retry = function() {
  if (this.retryInfo.currentRetry >= this.retryInfo.maxRetries) {
    throw new Error('Maximum retry attempts exceeded');
  }
  
  this.retryInfo.currentRetry += 1;
  this.retryInfo.lastRetryAt = new Date();
  
  // Calculate next retry time (exponential backoff)
  const backoffMinutes = Math.pow(2, this.retryInfo.currentRetry) * 5; // 5, 10, 20 minutes
  this.retryInfo.nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
  
  this.status = 'pending';
  
  return this;
};

addOnTransactionSchema.methods.markCompleted = function(paymentDetails = {}) {
  this.status = 'completed';
  this.paidAt = new Date();
  
  if (paymentDetails.gatewayTransactionId) {
    this.paymentDetails.gatewayTransactionId = paymentDetails.gatewayTransactionId;
  }
  
  if (paymentDetails.gatewayResponse) {
    this.paymentDetails.gatewayResponse = paymentDetails.gatewayResponse;
  }
  
  this.addAuditEntry('payment_completed', null, 'System', paymentDetails);
  
  return this;
};

addOnTransactionSchema.methods.markFailed = function(reason, failureCode = null) {
  this.status = 'failed';
  this.failedAt = new Date();
  this.paymentDetails.failureReason = reason;
  this.paymentDetails.failureCode = failureCode;
  
  this.addAuditEntry('payment_failed', null, 'System', { reason, failureCode });
  
  return this;
};

// Static methods
addOnTransactionSchema.statics.findByTenant = function(tenantId, options = {}) {
  const query = { tenant: tenantId, isDeleted: false };
  
  if (options.status) query.status = options.status;
  if (options.type) query.type = options.type;
  if (options.dateFrom) query.createdAt = { $gte: options.dateFrom };
  if (options.dateTo) {
    query.createdAt = query.createdAt || {};
    query.createdAt.$lte = options.dateTo;
  }
  
  return this.find(query)
    .populate(['tenantAddOn'])
    .sort({ createdAt: -1 })
    .limit(options.limit || 50);
};

addOnTransactionSchema.statics.findPendingRetries = function() {
  return this.find({
    status: 'failed',
    'retryInfo.currentRetry': { $lt: this.retryInfo?.maxRetries || 3 },
    'retryInfo.nextRetryAt': { $lte: new Date() },
    isDeleted: false
  });
};

addOnTransactionSchema.statics.getRevenueStats = async function(filters = {}) {
  const match = { 
    status: 'completed',
    isDeleted: false,
    ...filters 
  };
  
  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount.total' },
        totalTransactions: { $sum: 1 },
        averageTransaction: { $avg: '$amount.total' },
        totalRefunded: { $sum: '$totalRefunded' }
      }
    },
    {
      $project: {
        _id: 0,
        totalRevenue: 1,
        totalTransactions: 1,
        averageTransaction: { $round: ['$averageTransaction', 2] },
        totalRefunded: 1,
        netRevenue: { $subtract: ['$totalRevenue', '$totalRefunded'] }
      }
    }
  ]);
};

addOnTransactionSchema.statics.getMonthlyRevenue = async function(year = new Date().getFullYear()) {
  return this.aggregate([
    {
      $match: {
        status: 'completed',
        createdAt: {
          $gte: new Date(year, 0, 1),
          $lt: new Date(year + 1, 0, 1)
        },
        isDeleted: false
      }
    },
    {
      $group: {
        _id: { $month: '$createdAt' },
        revenue: { $sum: '$amount.total' },
        transactions: { $sum: 1 },
        refunds: { $sum: '$totalRefunded' }
      }
    },
    {
      $project: {
        month: '$_id',
        revenue: 1,
        transactions: 1,
        refunds: 1,
        netRevenue: { $subtract: ['$revenue', '$refunds'] }
      }
    },
    { $sort: { month: 1 } }
  ]);
};

module.exports = mongoose.model('AddOnTransaction', addOnTransactionSchema);