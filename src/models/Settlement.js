const mongoose = require('mongoose')

const settlementItemSchema = new mongoose.Schema({
  transactionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Transaction',
    required: true
  },
  orderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Order'
  },
  amount: { type: Number, required: true },
  commission: { type: Number, default: 0 },
  penalty: { type: Number, default: 0 },
  bonus: { type: Number, default: 0 },
  netAmount: { type: Number, required: true },
  description: String
})

const settlementSchema = new mongoose.Schema({
  // Settlement Identification
  settlementId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  batchId: String, // For grouping multiple settlements
  
  // Settlement Details
  type: {
    type: String,
    required: true,
    enum: ['driver', 'branch', 'staff', 'vendor', 'partner']
  },
  
  // Recipient Details
  recipientId: { 
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'recipientModel'
  },
  recipientModel: {
    type: String,
    required: true,
    enum: ['User', 'Branch', 'Vendor']
  },
  recipientName: { type: String, required: true },
  recipientEmail: String,
  recipientPhone: String,
  
  // Amount Details
  grossAmount: { type: Number, required: true }, // Total before deductions
  totalCommission: { type: Number, default: 0 },
  totalPenalty: { type: Number, default: 0 },
  totalBonus: { type: Number, default: 0 },
  platformFee: { type: Number, default: 0 },
  taxes: { type: Number, default: 0 },
  netAmount: { type: Number, required: true }, // Final settlement amount
  currency: { type: String, default: 'INR' },
  
  // Settlement Items
  items: [settlementItemSchema],
  
  // Period
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  
  // Status
  status: {
    type: String,
    required: true,
    enum: ['draft', 'pending_approval', 'approved', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'draft'
  },
  
  // Payment Details
  paymentMethod: {
    type: String,
    enum: ['bank_transfer', 'upi', 'cash', 'cheque', 'wallet'],
    required: true
  },
  
  // Bank Details
  bankDetails: {
    accountNumber: String,
    ifscCode: String,
    accountHolderName: String,
    bankName: String,
    branchName: String,
    upiId: String
  },
  
  // Processing Details
  paymentReference: String, // Bank reference number
  paymentGatewayResponse: mongoose.Schema.Types.Mixed,
  
  // Approval Workflow
  requiresApproval: { type: Boolean, default: true },
  approvalLevel: {
    type: String,
    enum: ['admin', 'finance_team'],
    default: 'admin'
  },
  
  approvals: [{
    level: String,
    approvedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User'
    },
    approvedAt: Date,
    status: {
      type: String,
      enum: ['approved', 'rejected'],
      required: true
    },
    comments: String
  }],
  
  // Scheduling
  scheduledDate: Date,
  processedAt: Date,
  completedAt: Date,
  
  // Reconciliation
  isReconciled: { type: Boolean, default: false },
  reconciledAt: Date,
  reconciledBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User'
  },
  reconciliationNotes: String,
  
  // Failure Handling
  failureReason: String,
  failureCode: String,
  retryCount: { type: Number, default: 0 },
  maxRetries: { type: Number, default: 3 },
  
  // Metadata
  description: String,
  notes: String,
  tags: [String],
  
  // Audit Trail
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true
  },
  lastModifiedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User'
  },
  
  // Additional Info
  attachments: [{
    filename: String,
    url: String,
    type: String,
    uploadedAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
})

// Indexes
settlementSchema.index({ type: 1, status: 1 })
settlementSchema.index({ recipientId: 1, createdAt: -1 })
settlementSchema.index({ periodStart: 1, periodEnd: 1 })
settlementSchema.index({ scheduledDate: 1 })
settlementSchema.index({ requiresApproval: 1, status: 1 })

// Generate unique settlement ID
settlementSchema.pre('save', async function(next) {
  if (!this.settlementId) {
    const prefix = this.type.toUpperCase().substring(0, 3)
    const timestamp = Date.now().toString().slice(-8)
    const random = Math.random().toString(36).substring(2, 4).toUpperCase()
    this.settlementId = `SET${prefix}${timestamp}${random}`
  }
  
  // Calculate net amount if not provided
  if (!this.netAmount) {
    this.netAmount = this.grossAmount - 
                    (this.totalCommission || 0) - 
                    (this.totalPenalty || 0) + 
                    (this.totalBonus || 0) - 
                    (this.platformFee || 0) - 
                    (this.taxes || 0)
  }
  
  next()
})

// Methods
settlementSchema.methods.addApproval = async function(level, adminId, status, comments) {
  this.approvals.push({
    level,
    approvedBy: adminId,
    approvedAt: new Date(),
    status,
    comments
  })
  
  // Update overall status based on approvals
  if (status === 'approved') {
    if (level === this.approvalLevel) {
      this.status = 'approved'
    }
  } else if (status === 'rejected') {
    this.status = 'cancelled'
  }
  
  return await this.save()
}

settlementSchema.methods.markProcessing = async function() {
  this.status = 'processing'
  this.processedAt = new Date()
  return await this.save()
}

settlementSchema.methods.markCompleted = async function(paymentReference) {
  this.status = 'completed'
  this.completedAt = new Date()
  if (paymentReference) {
    this.paymentReference = paymentReference
  }
  return await this.save()
}

settlementSchema.methods.markFailed = async function(reason, code) {
  this.status = 'failed'
  this.failureReason = reason
  this.failureCode = code
  this.retryCount += 1
  return await this.save()
}

settlementSchema.methods.canRetry = function() {
  return this.status === 'failed' && this.retryCount < this.maxRetries
}

// Static methods
settlementSchema.statics.getSettlementStats = async function(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$netAmount' }
      }
    }
  ]
  
  const result = await this.aggregate(pipeline)
  
  const stats = {
    total: { count: 0, amount: 0 },
    completed: { count: 0, amount: 0 },
    pending: { count: 0, amount: 0 },
    failed: { count: 0, amount: 0 }
  }
  
  result.forEach(item => {
    stats.total.count += item.count
    stats.total.amount += item.totalAmount
    
    if (item._id === 'completed') {
      stats.completed = { count: item.count, amount: item.totalAmount }
    } else if (['draft', 'pending_approval', 'approved', 'processing'].includes(item._id)) {
      stats.pending.count += item.count
      stats.pending.amount += item.totalAmount
    } else if (item._id === 'failed') {
      stats.failed = { count: item.count, amount: item.totalAmount }
    }
  })
  
  return stats
}

settlementSchema.statics.getPendingApprovals = async function() {
  return await this.find({
    requiresApproval: true,
    status: { $in: ['pending_approval', 'draft'] }
  })
  .populate('recipientId')
  .populate('createdBy', 'name email')
  .sort({ createdAt: -1 })
}

settlementSchema.statics.getScheduledSettlements = async function(date = new Date()) {
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)
  
  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)
  
  return await this.find({
    scheduledDate: { $gte: startOfDay, $lte: endOfDay },
    status: 'approved'
  })
  .populate('recipientId')
}

settlementSchema.statics.generateBatchSettlement = async function(type, recipientIds, periodStart, periodEnd, createdBy) {
  const batchId = `BATCH_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`
  const settlements = []
  
  for (const recipientId of recipientIds) {
    // This would be implemented based on business logic
    // to calculate settlement amounts for each recipient
    const settlement = new this({
      type,
      recipientId,
      recipientModel: type === 'driver' ? 'User' : 'Branch',
      periodStart,
      periodEnd,
      batchId,
      createdBy,
      // Additional fields would be calculated based on transactions
    })
    
    settlements.push(settlement)
  }
  
  return await this.insertMany(settlements)
}

module.exports = mongoose.model('Settlement', settlementSchema)