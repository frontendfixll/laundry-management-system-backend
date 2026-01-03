const mongoose = require('mongoose')

const auditLogSchema = new mongoose.Schema({
  // User Information
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userType: { type: String, required: true, enum: ['superadmin', 'admin', 'staff', 'customer', 'system'] },
  userEmail: { type: String, required: true },
  
  // Action Details
  action: { type: String, required: true }, // login, logout, create_order, update_branch, etc.
  category: { type: String, required: true, enum: ['auth', 'orders', 'branches', 'users', 'finances', 'financial', 'settings', 'system', 'audit', 'risk_management', 'analytics', 'pricing', 'logistics'] },
  description: { type: String, required: true },
  
  // Request Information
  ipAddress: { type: String, required: true },
  userAgent: { type: String },
  sessionId: { type: String },
  
  // Resource Information
  resourceType: { type: String }, // order, branch, user, etc.
  resourceId: { type: String },
  
  // Changes (for update operations)
  changes: {
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed }
  },
  
  // Status and Result
  status: { type: String, required: true, enum: ['success', 'failure', 'warning'] },
  errorMessage: { type: String },
  
  // Additional Metadata
  metadata: { type: mongoose.Schema.Types.Mixed },
  
  // Timestamps
  timestamp: { type: Date, default: Date.now },
  
  // Risk Assessment
  riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
  
  // Location (if available)
  location: {
    country: { type: String },
    city: { type: String },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number }
    }
  }
}, {
  timestamps: true
})

// Indexes for efficient querying
auditLogSchema.index({ userId: 1, timestamp: -1 })
auditLogSchema.index({ userType: 1, timestamp: -1 })
auditLogSchema.index({ action: 1, timestamp: -1 })
auditLogSchema.index({ category: 1, timestamp: -1 })
auditLogSchema.index({ ipAddress: 1, timestamp: -1 })
auditLogSchema.index({ riskLevel: 1, timestamp: -1 })
auditLogSchema.index({ timestamp: -1 })

// Static method to log action
auditLogSchema.statics.logAction = async function(logData) {
  try {
    const auditLog = new this(logData)
    await auditLog.save()
    return auditLog
  } catch (error) {
    console.error('Failed to create audit log:', error)
    throw error
  }
}

// Static method to get user activity
auditLogSchema.statics.getUserActivity = async function(userId, options = {}) {
  const {
    limit = 50,
    skip = 0,
    category,
    startDate,
    endDate,
    riskLevel
  } = options
  
  const query = { userId }
  
  if (category) query.category = category
  if (riskLevel) query.riskLevel = riskLevel
  if (startDate || endDate) {
    query.timestamp = {}
    if (startDate) query.timestamp.$gte = new Date(startDate)
    if (endDate) query.timestamp.$lte = new Date(endDate)
  }
  
  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip)
    .lean()
}

// Static method to get suspicious activities
auditLogSchema.statics.getSuspiciousActivities = async function(options = {}) {
  const {
    limit = 100,
    hours = 24
  } = options
  
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000)
  
  return this.find({
    timestamp: { $gte: startTime },
    $or: [
      { riskLevel: { $in: ['high', 'critical'] } },
      { status: 'failure' },
      { action: { $in: ['failed_login', 'suspicious_ip', 'multiple_sessions'] } }
    ]
  })
  .sort({ timestamp: -1 })
  .limit(limit)
  .lean()
}

module.exports = mongoose.model('AuditLog', auditLogSchema)