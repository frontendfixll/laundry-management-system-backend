const mongoose = require('mongoose')

const complaintActionSchema = new mongoose.Schema({
  actionType: {
    type: String,
    required: true,
    enum: ['status_change', 'assignment', 'comment', 'escalation', 'resolution', 'investigation']
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'performedByModel'
  },
  performedByModel: {
    type: String,
    required: true,
    enum: ['User', 'CenterAdmin', 'SupportAgent']
  },
  description: { type: String, required: true },
  previousValue: String,
  newValue: String,
  attachments: [{
    filename: String,
    url: String,
    type: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  isInternal: { type: Boolean, default: false }, // Internal notes not visible to customer
  timestamp: { type: Date, default: Date.now }
})

const complaintSchema = new mongoose.Schema({
  // Complaint Identification
  complaintId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  ticketNumber: String, // External ticket system reference
  
  // Complaint Details
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: {
    type: String,
    required: true,
    enum: [
      'service_quality',
      'delivery_delay',
      'damaged_items',
      'missing_items',
      'billing_issue',
      'staff_behavior',
      'refund_request',
      'technical_issue',
      'fraud_report',
      'other'
    ]
  },
  subcategory: String,
  
  // Severity and Priority
  severity: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  priority: {
    type: String,
    required: true,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  
  // Status Management
  status: {
    type: String,
    required: true,
    enum: ['open', 'in_progress', 'escalated', 'resolved', 'closed', 'reopened'],
    default: 'open'
  },
  
  // Customer Information
  customerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true,
    index: true
  },
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true },
  customerPhone: String,
  
  // Related Entities
  orderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Order',
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
  
  // Assignment
  assignedTo: { 
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'assignedToModel'
  },
  assignedToModel: {
    type: String,
    enum: ['CenterAdmin', 'SupportAgent', 'BranchManager']
  },
  assignedAt: Date,
  assignedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CenterAdmin'
  },
  
  // Escalation Details
  isEscalated: { type: Boolean, default: false },
  escalatedAt: Date,
  escalatedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CenterAdmin'
  },
  escalationReason: String,
  escalationLevel: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  
  // SLA Tracking
  slaTarget: Date, // When complaint should be resolved
  slaBreached: { type: Boolean, default: false },
  slaBreachedAt: Date,
  responseTime: Number, // Time to first response in minutes
  resolutionTime: Number, // Time to resolution in minutes
  
  // Resolution Details
  resolution: String,
  resolutionType: {
    type: String,
    enum: ['refund', 'replacement', 'compensation', 'apology', 'policy_change', 'no_action', 'other']
  },
  resolutionAmount: Number, // Compensation amount if applicable
  resolvedAt: Date,
  resolvedBy: { 
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'resolvedByModel'
  },
  resolvedByModel: {
    type: String,
    enum: ['CenterAdmin', 'SupportAgent', 'BranchManager']
  },
  
  // Customer Satisfaction
  customerSatisfaction: {
    rating: { type: Number, min: 1, max: 5 },
    feedback: String,
    submittedAt: Date
  },
  
  // Investigation Details
  requiresInvestigation: { type: Boolean, default: false },
  investigationStatus: {
    type: String,
    enum: ['not_required', 'pending', 'in_progress', 'completed'],
    default: 'not_required'
  },
  investigationNotes: String,
  investigationFindings: String,
  
  // Fraud Indicators
  fraudRisk: {
    type: String,
    enum: ['none', 'low', 'medium', 'high'],
    default: 'none'
  },
  fraudIndicators: [String],
  
  // Communication
  lastCustomerContact: Date,
  lastInternalUpdate: Date,
  communicationPreference: {
    type: String,
    enum: ['email', 'phone', 'sms', 'whatsapp'],
    default: 'email'
  },
  
  // Attachments and Evidence
  attachments: [{
    filename: String,
    url: String,
    type: String,
    uploadedBy: mongoose.Schema.Types.ObjectId,
    uploadedAt: { type: Date, default: Date.now },
    isEvidence: { type: Boolean, default: false }
  }],
  
  // Action History
  actions: [complaintActionSchema],
  
  // Tags and Classification
  tags: [String],
  internalNotes: String,
  
  // Metrics
  reopenCount: { type: Number, default: 0 },
  escalationCount: { type: Number, default: 0 },
  
  // Closure Details
  closedAt: Date,
  closedBy: { 
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'closedByModel'
  },
  closedByModel: {
    type: String,
    enum: ['CenterAdmin', 'SupportAgent', 'BranchManager']
  },
  closureReason: String,
  
  // Source
  source: {
    type: String,
    enum: ['app', 'website', 'phone', 'email', 'social_media', 'branch'],
    default: 'app'
  }
}, {
  timestamps: true
})

// Indexes for performance
complaintSchema.index({ status: 1, priority: 1 })
complaintSchema.index({ customerId: 1, createdAt: -1 })
complaintSchema.index({ branchId: 1, status: 1 })
complaintSchema.index({ assignedTo: 1, status: 1 })
complaintSchema.index({ slaTarget: 1, status: 1 })
complaintSchema.index({ isEscalated: 1, escalationLevel: 1 })
complaintSchema.index({ category: 1, severity: 1 })
complaintSchema.index({ fraudRisk: 1 })

// Generate unique complaint ID
complaintSchema.pre('save', async function(next) {
  if (!this.complaintId) {
    const prefix = 'CMP'
    const timestamp = Date.now().toString().slice(-8)
    const random = Math.random().toString(36).substring(2, 6).toUpperCase()
    this.complaintId = `${prefix}${timestamp}${random}`
  }
  next()
})

// Methods
complaintSchema.methods.addAction = function(actionData) {
  this.actions.push(actionData)
  this.lastInternalUpdate = new Date()
  return this.save()
}

complaintSchema.methods.escalate = async function(escalatedBy, reason, level = null) {
  this.isEscalated = true
  this.escalatedAt = new Date()
  this.escalatedBy = escalatedBy
  this.escalationReason = reason
  this.escalationCount += 1
  
  if (level !== null) {
    this.escalationLevel = level
  } else {
    this.escalationLevel += 1
  }
  
  // Add action
  await this.addAction({
    actionType: 'escalation',
    performedBy: escalatedBy,
    performedByModel: 'CenterAdmin',
    description: `Complaint escalated to level ${this.escalationLevel}. Reason: ${reason}`,
    newValue: this.escalationLevel.toString()
  })
  
  return await this.save()
}

complaintSchema.methods.assign = async function(assignedTo, assignedBy, assignedToModel = 'CenterAdmin') {
  const previousAssignee = this.assignedTo
  
  this.assignedTo = assignedTo
  this.assignedToModel = assignedToModel
  this.assignedAt = new Date()
  this.assignedBy = assignedBy
  
  // Add action
  await this.addAction({
    actionType: 'assignment',
    performedBy: assignedBy,
    performedByModel: 'CenterAdmin',
    description: `Complaint assigned to ${assignedToModel}`,
    previousValue: previousAssignee?.toString(),
    newValue: assignedTo.toString()
  })
  
  return await this.save()
}

complaintSchema.methods.resolve = async function(resolvedBy, resolution, resolutionType, amount = null) {
  this.status = 'resolved'
  this.resolution = resolution
  this.resolutionType = resolutionType
  this.resolutionAmount = amount
  this.resolvedAt = new Date()
  this.resolvedBy = resolvedBy
  this.resolvedByModel = 'CenterAdmin'
  
  // Calculate resolution time
  this.resolutionTime = Math.floor((new Date() - this.createdAt) / (1000 * 60)) // minutes
  
  // Add action
  await this.addAction({
    actionType: 'resolution',
    performedBy: resolvedBy,
    performedByModel: 'CenterAdmin',
    description: `Complaint resolved: ${resolution}`,
    newValue: resolutionType
  })
  
  return await this.save()
}

complaintSchema.methods.close = async function(closedBy, reason) {
  this.status = 'closed'
  this.closedAt = new Date()
  this.closedBy = closedBy
  this.closedByModel = 'CenterAdmin'
  this.closureReason = reason
  
  // Add action
  await this.addAction({
    actionType: 'status_change',
    performedBy: closedBy,
    performedByModel: 'CenterAdmin',
    description: `Complaint closed: ${reason}`,
    previousValue: 'resolved',
    newValue: 'closed'
  })
  
  return await this.save()
}

complaintSchema.methods.reopen = async function(reopenedBy, reason) {
  this.status = 'reopened'
  this.reopenCount += 1
  
  // Add action
  await this.addAction({
    actionType: 'status_change',
    performedBy: reopenedBy,
    performedByModel: 'CenterAdmin',
    description: `Complaint reopened: ${reason}`,
    previousValue: 'closed',
    newValue: 'reopened'
  })
  
  return await this.save()
}

complaintSchema.methods.checkSLA = function() {
  if (this.slaTarget && new Date() > this.slaTarget && !this.slaBreached) {
    this.slaBreached = true
    this.slaBreachedAt = new Date()
    return true
  }
  return false
}

// Static methods
complaintSchema.statics.getComplaintStats = async function(filters = {}) {
  const pipeline = [
    { $match: filters },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgResolutionTime: { $avg: '$resolutionTime' }
      }
    }
  ]
  
  const result = await this.aggregate(pipeline)
  
  const stats = {
    total: 0,
    open: 0,
    inProgress: 0,
    escalated: 0,
    resolved: 0,
    closed: 0,
    avgResolutionTime: 0
  }
  
  result.forEach(item => {
    stats.total += item.count
    stats[item._id.replace('_', '')] = item.count
    if (item._id === 'resolved' || item._id === 'closed') {
      stats.avgResolutionTime = item.avgResolutionTime || 0
    }
  })
  
  return stats
}

complaintSchema.statics.getEscalatedComplaints = async function() {
  return await this.find({
    isEscalated: true,
    status: { $in: ['escalated', 'in_progress'] }
  })
  .populate('customerId', 'name email phone')
  .populate('assignedTo')
  .populate('branchId', 'name location')
  .sort({ escalationLevel: -1, escalatedAt: -1 })
}

complaintSchema.statics.getSLABreaches = async function() {
  return await this.find({
    slaBreached: true,
    status: { $nin: ['resolved', 'closed'] }
  })
  .populate('customerId', 'name email phone')
  .populate('assignedTo')
  .sort({ slaBreachedAt: -1 })
}

complaintSchema.statics.getFraudSuspicious = async function() {
  return await this.find({
    fraudRisk: { $in: ['medium', 'high'] }
  })
  .populate('customerId', 'name email phone')
  .populate('orderId', 'orderNumber')
  .sort({ createdAt: -1 })
}

module.exports = mongoose.model('Complaint', complaintSchema)