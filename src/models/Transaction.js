const mongoose = require('mongoose')

const transactionSchema = new mongoose.Schema({
  // Transaction Identification
  transactionId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  externalTransactionId: String, // Payment gateway transaction ID
  
  // Transaction Details
  type: {
    type: String,
    required: true,
    enum: [
      'payment',           // Customer payment
      'refund',           // Refund to customer
      'settlement',       // Settlement to branch/driver/staff
      'commission',       // Commission deduction
      'penalty',          // Penalty charge
      'bonus',           // Bonus payment
      'adjustment',      // Manual adjustment
      'withdrawal',      // Cash withdrawal
      'deposit'          // Cash deposit
    ]
  },
  
  subType: {
    type: String,
    enum: [
      'order_payment',
      'partial_refund',
      'full_refund',
      'driver_settlement',
      'branch_settlement',
      'staff_settlement',
      'platform_commission',
      'late_penalty',
      'performance_bonus',
      'manual_adjustment',
      'cash_collection',
      'bank_transfer'
    ]
  },
  
  // Amount Details
  amount: { 
    type: Number, 
    required: true,
    min: 0
  },
  currency: { 
    type: String, 
    default: 'INR' 
  },
  
  // Fee and Commission
  platformFee: { type: Number, default: 0 },
  paymentGatewayFee: { type: Number, default: 0 },
  taxes: { type: Number, default: 0 },
  netAmount: { type: Number, required: true }, // Amount after all deductions
  
  // Status
  status: {
    type: String,
    required: true,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'],
    default: 'pending'
  },
  
  // Related Entities
  orderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Order',
    index: true
  },
  customerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    index: true
  },
  branchId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Branch',
    index: true
  },
  driverId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User'
  },
  staffId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User'
  },
  
  // Payment Details
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'upi', 'net_banking', 'wallet', 'bank_transfer'],
    required: true
  },
  paymentGateway: {
    type: String,
    enum: ['razorpay', 'stripe', 'paytm', 'phonepe', 'gpay', 'manual']
  },
  
  // Bank Details (for settlements)
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    accountHolderName: String,
    bankName: String,
    upiId: String
  },
  
  // Approval Details
  requiresApproval: { type: Boolean, default: false },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  approvedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CenterAdmin'
  },
  approvedAt: Date,
  rejectionReason: String,
  
  // Processing Details
  processedAt: Date,
  processedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CenterAdmin'
  },
  
  // Settlement Details
  settlementBatch: String, // For grouping settlements
  settlementDate: Date,
  settlementReference: String,
  
  // Metadata
  description: String,
  notes: String,
  tags: [String],
  
  // Reconciliation
  isReconciled: { type: Boolean, default: false },
  reconciledAt: Date,
  reconciledBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CenterAdmin'
  },
  
  // Failure Details
  failureReason: String,
  failureCode: String,
  retryCount: { type: Number, default: 0 },
  maxRetries: { type: Number, default: 3 },
  
  // Audit Trail
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CenterAdmin',
    required: true
  },
  ipAddress: String,
  userAgent: String,
  
  // Timestamps
  scheduledAt: Date, // For scheduled transactions
  completedAt: Date
}, {
  timestamps: true
})

// Indexes for performance
transactionSchema.index({ type: 1, status: 1 })
transactionSchema.index({ createdAt: -1 })
transactionSchema.index({ amount: -1 })
transactionSchema.index({ branchId: 1, createdAt: -1 })
transactionSchema.index({ customerId: 1, createdAt: -1 })
transactionSchema.index({ settlementDate: 1 })
transactionSchema.index({ requiresApproval: 1, approvalStatus: 1 })

// Generate unique transaction ID
transactionSchema.pre('save', async function(next) {
  if (!this.transactionId) {
    const prefix = this.type.toUpperCase().substring(0, 3)
    const timestamp = Date.now().toString().slice(-8)
    const random = Math.random().toString(36).substring(2, 6).toUpperCase()
    this.transactionId = `${prefix}${timestamp}${random}`
  }
  
  // Calculate net amount if not provided
  if (!this.netAmount) {
    this.netAmount = this.amount - (this.platformFee || 0) - (this.paymentGatewayFee || 0) - (this.taxes || 0)
  }
  
  next()
})

// Methods
transactionSchema.methods.approve = async function(adminId, notes) {
  this.approvalStatus = 'approved'
  this.approvedBy = adminId
  this.approvedAt = new Date()
  if (notes) this.notes = notes
  return await this.save()
}

transactionSchema.methods.reject = async function(adminId, reason) {
  this.approvalStatus = 'rejected'
  this.approvedBy = adminId
  this.approvedAt = new Date()
  this.rejectionReason = reason
  return await this.save()
}

transactionSchema.methods.markCompleted = async function() {
  this.status = 'completed'
  this.completedAt = new Date()
  this.processedAt = new Date()
  return await this.save()
}

transactionSchema.methods.markFailed = async function(reason, code) {
  this.status = 'failed'
  this.failureReason = reason
  this.failureCode = code
  this.retryCount += 1
  return await this.save()
}

// Static methods
transactionSchema.statics.getTransactionStats = async function(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: null,
        totalAmount: { $sum: '$amount' },
        totalNetAmount: { $sum: '$netAmount' },
        totalTransactions: { $sum: 1 },
        avgTransactionAmount: { $avg: '$amount' },
        totalFees: { $sum: { $add: ['$platformFee', '$paymentGatewayFee'] } },
        totalTaxes: { $sum: '$taxes' }
      }
    }
  ]
  
  const result = await this.aggregate(pipeline)
  return result[0] || {
    totalAmount: 0,
    totalNetAmount: 0,
    totalTransactions: 0,
    avgTransactionAmount: 0,
    totalFees: 0,
    totalTaxes: 0
  }
}

transactionSchema.statics.getRevenueByPeriod = async function(startDate, endDate, groupBy = 'day') {
  const groupFormat = {
    day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
    week: { $dateToString: { format: '%Y-W%U', date: '$createdAt' } },
    month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
    year: { $dateToString: { format: '%Y', date: '$createdAt' } }
  }
  
  const pipeline = [
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'completed',
        type: { $in: ['payment', 'settlement'] }
      }
    },
    {
      $group: {
        _id: groupFormat[groupBy],
        revenue: { $sum: '$netAmount' },
        transactions: { $sum: 1 },
        fees: { $sum: { $add: ['$platformFee', '$paymentGatewayFee'] } }
      }
    },
    { $sort: { _id: 1 } }
  ]
  
  return await this.aggregate(pipeline)
}

transactionSchema.statics.getPendingApprovals = async function() {
  return await this.find({
    requiresApproval: true,
    approvalStatus: 'pending'
  })
  .populate('customerId', 'name email phone')
  .populate('branchId', 'name location')
  .populate('orderId', 'orderNumber')
  .sort({ createdAt: -1 })
}

module.exports = mongoose.model('Transaction', transactionSchema)