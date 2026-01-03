const mongoose = require('mongoose')

const blacklistEntrySchema = new mongoose.Schema({
  // Entry Identification
  entryId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  
  // Entity Details
  entityType: {
    type: String,
    required: true,
    enum: ['customer', 'driver', 'vendor', 'branch_staff', 'phone_number', 'email', 'device', 'ip_address']
  },
  
  entityId: { 
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'entityModel'
  },
  entityModel: {
    type: String,
    enum: ['User', 'Branch', 'Vendor']
  },
  
  // Identification Details
  identifiers: {
    name: String,
    email: String,
    phone: String,
    deviceId: String,
    ipAddress: String,
    nationalId: String, // Aadhaar, PAN, etc.
    drivingLicense: String,
    bankAccount: String
  },
  
  // Blacklist Details
  reason: { 
    type: String, 
    required: true,
    enum: [
      'fraud',
      'payment_default',
      'abusive_behavior',
      'fake_orders',
      'policy_violation',
      'security_threat',
      'spam',
      'identity_theft',
      'chargeback_abuse',
      'other'
    ]
  },
  
  description: { type: String, required: true },
  severity: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  
  // Status
  status: {
    type: String,
    required: true,
    enum: ['active', 'inactive', 'under_review', 'appealed', 'expired'],
    default: 'active'
  },
  
  // Scope and Restrictions
  restrictions: {
    blockOrders: { type: Boolean, default: true },
    blockRegistration: { type: Boolean, default: true },
    blockPayments: { type: Boolean, default: false },
    blockCommunication: { type: Boolean, default: false },
    blockRefunds: { type: Boolean, default: false },
    customRestrictions: [String]
  },
  
  // Geographic Scope
  scope: {
    type: String,
    enum: ['global', 'regional', 'city', 'branch'],
    default: 'global'
  },
  affectedBranches: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Branch' 
  }],
  affectedCities: [String],
  affectedRegions: [String],
  
  // Evidence and Documentation
  evidence: [{
    type: String,
    enum: ['complaint', 'transaction', 'communication', 'investigation', 'legal_document', 'other'],
    description: String,
    fileUrl: String,
    referenceId: String, // ID of related complaint, transaction, etc.
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Related Entities
  relatedComplaints: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Complaint' 
  }],
  relatedTransactions: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Transaction' 
  }],
  relatedOrders: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Order' 
  }],
  
  // Validity Period
  effectiveFrom: { type: Date, default: Date.now },
  expiresAt: Date, // Optional expiration date
  isTemporary: { type: Boolean, default: false },
  
  // Review and Appeal
  lastReviewedAt: Date,
  lastReviewedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CenterAdmin'
  },
  reviewNotes: String,
  
  appealStatus: {
    type: String,
    enum: ['none', 'submitted', 'under_review', 'approved', 'rejected'],
    default: 'none'
  },
  appealSubmittedAt: Date,
  appealReason: String,
  appealDecision: String,
  appealDecidedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CenterAdmin'
  },
  appealDecidedAt: Date,
  
  // Risk Assessment
  riskScore: { 
    type: Number, 
    min: 0, 
    max: 100,
    default: 50
  },
  riskFactors: [String],
  
  // Monitoring
  violationCount: { type: Number, default: 1 },
  lastViolationDate: { type: Date, default: Date.now },
  monitoringLevel: {
    type: String,
    enum: ['none', 'basic', 'enhanced', 'strict'],
    default: 'basic'
  },
  
  // Automation
  autoDetected: { type: Boolean, default: false },
  detectionRules: [String], // Rules that triggered auto-detection
  
  // Audit Trail
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CenterAdmin',
    required: true
  },
  lastModifiedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CenterAdmin'
  },
  
  // Additional Metadata
  tags: [String],
  internalNotes: String,
  
  // Statistics
  blockAttempts: { type: Number, default: 0 },
  lastBlockAttempt: Date
}, {
  timestamps: true
})

// Indexes for performance
blacklistEntrySchema.index({ entityType: 1, status: 1 })
blacklistEntrySchema.index({ 'identifiers.email': 1 })
blacklistEntrySchema.index({ 'identifiers.phone': 1 })
blacklistEntrySchema.index({ 'identifiers.deviceId': 1 })
blacklistEntrySchema.index({ 'identifiers.ipAddress': 1 })
blacklistEntrySchema.index({ effectiveFrom: 1, expiresAt: 1 })
blacklistEntrySchema.index({ riskScore: -1 })
blacklistEntrySchema.index({ createdAt: -1 })

// Generate unique entry ID
blacklistEntrySchema.pre('save', async function(next) {
  if (!this.entryId) {
    const prefix = 'BL'
    const typePrefix = this.entityType.substring(0, 3).toUpperCase()
    const timestamp = Date.now().toString().slice(-6)
    const random = Math.random().toString(36).substring(2, 4).toUpperCase()
    this.entryId = `${prefix}${typePrefix}${timestamp}${random}`
  }
  next()
})

// Methods
blacklistEntrySchema.methods.activate = async function(activatedBy) {
  this.status = 'active'
  this.lastModifiedBy = activatedBy
  return await this.save()
}

blacklistEntrySchema.methods.deactivate = async function(deactivatedBy, reason) {
  this.status = 'inactive'
  this.lastModifiedBy = deactivatedBy
  this.internalNotes = `Deactivated: ${reason}`
  return await this.save()
}

blacklistEntrySchema.methods.addEvidence = function(evidenceData) {
  this.evidence.push({
    ...evidenceData,
    uploadedAt: new Date()
  })
  return this.save()
}

blacklistEntrySchema.methods.submitAppeal = async function(reason) {
  this.appealStatus = 'submitted'
  this.appealSubmittedAt = new Date()
  this.appealReason = reason
  return await this.save()
}

blacklistEntrySchema.methods.processAppeal = async function(decision, decidedBy, notes) {
  this.appealStatus = decision
  this.appealDecision = notes
  this.appealDecidedBy = decidedBy
  this.appealDecidedAt = new Date()
  
  if (decision === 'approved') {
    this.status = 'inactive'
  }
  
  return await this.save()
}

blacklistEntrySchema.methods.recordBlockAttempt = async function() {
  this.blockAttempts += 1
  this.lastBlockAttempt = new Date()
  return await this.save()
}

blacklistEntrySchema.methods.isActive = function() {
  if (this.status !== 'active') return false
  if (this.expiresAt && new Date() > this.expiresAt) return false
  return true
}

blacklistEntrySchema.methods.checkExpiry = function() {
  if (this.expiresAt && new Date() > this.expiresAt && this.status === 'active') {
    this.status = 'expired'
    return this.save()
  }
  return Promise.resolve(this)
}

// Static methods
blacklistEntrySchema.statics.checkEntity = async function(entityType, identifiers) {
  const query = {
    entityType,
    status: 'active',
    $or: []
  }
  
  // Build query based on available identifiers
  if (identifiers.email) {
    query.$or.push({ 'identifiers.email': identifiers.email })
  }
  if (identifiers.phone) {
    query.$or.push({ 'identifiers.phone': identifiers.phone })
  }
  if (identifiers.deviceId) {
    query.$or.push({ 'identifiers.deviceId': identifiers.deviceId })
  }
  if (identifiers.ipAddress) {
    query.$or.push({ 'identifiers.ipAddress': identifiers.ipAddress })
  }
  if (identifiers.nationalId) {
    query.$or.push({ 'identifiers.nationalId': identifiers.nationalId })
  }
  
  if (query.$or.length === 0) return null
  
  const entry = await this.findOne(query)
  if (entry) {
    await entry.recordBlockAttempt()
  }
  
  return entry
}

blacklistEntrySchema.statics.getBlacklistStats = async function() {
  const pipeline = [
    {
      $group: {
        _id: '$entityType',
        total: { $sum: 1 },
        active: {
          $sum: {
            $cond: [{ $eq: ['$status', 'active'] }, 1, 0]
          }
        },
        highRisk: {
          $sum: {
            $cond: [{ $gte: ['$riskScore', 80] }, 1, 0]
          }
        }
      }
    }
  ]
  
  const result = await this.aggregate(pipeline)
  
  const stats = {
    totalEntries: 0,
    activeEntries: 0,
    highRiskEntries: 0,
    byType: {}
  }
  
  result.forEach(item => {
    stats.totalEntries += item.total
    stats.activeEntries += item.active
    stats.highRiskEntries += item.highRisk
    stats.byType[item._id] = {
      total: item.total,
      active: item.active,
      highRisk: item.highRisk
    }
  })
  
  return stats
}

blacklistEntrySchema.statics.getExpiringEntries = async function(days = 7) {
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + days)
  
  return await this.find({
    status: 'active',
    expiresAt: { $lte: futureDate, $gte: new Date() }
  }).populate('createdBy', 'name email')
}

blacklistEntrySchema.statics.getPendingAppeals = async function() {
  return await this.find({
    appealStatus: { $in: ['submitted', 'under_review'] }
  })
  .populate('createdBy', 'name email')
  .sort({ appealSubmittedAt: 1 })
}

blacklistEntrySchema.statics.getHighRiskEntries = async function() {
  return await this.find({
    status: 'active',
    riskScore: { $gte: 80 }
  })
  .populate('createdBy', 'name email')
  .sort({ riskScore: -1 })
}

module.exports = mongoose.model('BlacklistEntry', blacklistEntrySchema)