const mongoose = require('mongoose')

const securityEventSchema = new mongoose.Schema({
  // Event identification
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  
  // Event classification
  eventType: {
    type: String,
    required: true,
    enum: [
      'LOGIN_FAILED',
      'LOGIN_BRUTE_FORCE',
      'PERMISSION_DENIED',
      'SUSPICIOUS_ACTIVITY',
      'DATA_BREACH_ATTEMPT',
      'UNAUTHORIZED_ACCESS',
      'PRIVILEGE_ESCALATION',
      'ACCOUNT_COMPROMISE',
      'MALICIOUS_REQUEST',
      'RATE_LIMIT_EXCEEDED',
      'SUSPICIOUS_LOCATION',
      'UNUSUAL_BEHAVIOR',
      'SECURITY_POLICY_VIOLATION',
      'SYSTEM_INTRUSION',
      'DATA_EXFILTRATION'
    ],
    index: true
  },
  
  severity: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true
  },
  
  // Source information
  sourceIp: {
    type: String,
    required: true,
    index: true
  },
  
  sourceCountry: String,
  sourceCity: String,
  sourceISP: String,
  
  userAgent: String,
  
  // User context (if applicable)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true
  },
  
  username: String,
  userEmail: String,
  userRole: String,
  
  // Tenant context
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    default: null,
    index: true
  },
  
  // Event details
  description: {
    type: String,
    required: true
  },
  
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Request information
  requestMethod: String,
  requestUrl: String,
  requestHeaders: mongoose.Schema.Types.Mixed,
  requestBody: mongoose.Schema.Types.Mixed,
  responseStatus: Number,
  
  // Detection information
  detectionMethod: {
    type: String,
    enum: ['automated', 'manual', 'third_party', 'user_report'],
    default: 'automated'
  },
  
  detectionRule: String,
  detectionScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 50
  },
  
  // Risk assessment
  riskScore: {
    type: Number,
    min: 0,
    max: 100,
    required: true
  },
  
  riskFactors: [String],
  
  // Response and mitigation
  status: {
    type: String,
    enum: ['detected', 'investigating', 'confirmed', 'false_positive', 'mitigated', 'resolved'],
    default: 'detected',
    index: true
  },
  
  responseActions: [{
    action: {
      type: String,
      enum: [
        'BLOCK_IP',
        'LOCK_ACCOUNT',
        'REQUIRE_MFA',
        'NOTIFY_ADMIN',
        'LOG_ONLY',
        'RATE_LIMIT',
        'QUARANTINE',
        'ESCALATE'
      ]
    },
    timestamp: Date,
    performedBy: String,
    details: String,
    automated: Boolean
  }],
  
  // Investigation details
  investigation: {
    assignedTo: String,
    assigneeId: mongoose.Schema.Types.ObjectId,
    startDate: Date,
    endDate: Date,
    findings: String,
    evidence: [String],
    conclusion: String
  },
  
  // Related events
  relatedEvents: [{
    eventId: String,
    relationship: String,
    timestamp: Date
  }],
  
  // Pattern analysis
  pattern: {
    isPartOfPattern: {
      type: Boolean,
      default: false
    },
    patternId: String,
    patternType: String,
    similarEvents: Number
  },
  
  // Compliance and reporting
  complianceFlags: [{
    type: String,
    enum: ['GDPR_BREACH', 'PCI_INCIDENT', 'SOC2_VIOLATION', 'REGULATORY_REPORT']
  }],
  
  reportedToAuthorities: {
    type: Boolean,
    default: false
  },
  
  reportingDetails: {
    reportedDate: Date,
    reportedBy: String,
    authorities: [String],
    reportReference: String
  },
  
  // Resolution
  resolved: {
    type: Boolean,
    default: false
  },
  
  resolvedDate: Date,
  resolvedBy: String,
  resolutionNotes: String,
  
  // False positive handling
  falsePositive: {
    type: Boolean,
    default: false
  },
  
  falsePositiveReason: String,
  markedByUserId: mongoose.Schema.Types.ObjectId,
  
  // Archival
  archived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  collection: 'securityevents'
})

// Indexes for performance
securityEventSchema.index({ timestamp: -1, severity: 1 })
securityEventSchema.index({ eventType: 1, timestamp: -1 })
securityEventSchema.index({ sourceIp: 1, timestamp: -1 })
securityEventSchema.index({ userId: 1, timestamp: -1 })
securityEventSchema.index({ tenantId: 1, timestamp: -1 })
securityEventSchema.index({ status: 1, severity: 1 })
securityEventSchema.index({ riskScore: -1, timestamp: -1 })

// Compound indexes
securityEventSchema.index({ eventType: 1, severity: 1, timestamp: -1 })
securityEventSchema.index({ sourceIp: 1, eventType: 1, timestamp: -1 })

// Static method to create security event
securityEventSchema.statics.createEvent = async function(eventData) {
  const eventId = `SEC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  // Calculate risk score based on event type and other factors
  let riskScore = 50 // Default
  
  const riskMapping = {
    'LOGIN_FAILED': 20,
    'LOGIN_BRUTE_FORCE': 80,
    'PERMISSION_DENIED': 30,
    'SUSPICIOUS_ACTIVITY': 60,
    'DATA_BREACH_ATTEMPT': 95,
    'UNAUTHORIZED_ACCESS': 85,
    'PRIVILEGE_ESCALATION': 90,
    'ACCOUNT_COMPROMISE': 95,
    'MALICIOUS_REQUEST': 70,
    'RATE_LIMIT_EXCEEDED': 40,
    'SUSPICIOUS_LOCATION': 50,
    'UNUSUAL_BEHAVIOR': 45,
    'SECURITY_POLICY_VIOLATION': 60,
    'SYSTEM_INTRUSION': 95,
    'DATA_EXFILTRATION': 100
  }
  
  riskScore = riskMapping[eventData.eventType] || 50
  
  // Adjust risk score based on user role
  if (eventData.userRole) {
    const roleMultipliers = {
      'Super Admin': 1.5,
      'Platform Support': 1.3,
      'Platform Finance Admin': 1.4,
      'Platform Auditor': 1.2,
      'Tenant Admin': 1.1
    }
    riskScore *= (roleMultipliers[eventData.userRole] || 1.0)
  }
  
  riskScore = Math.min(100, Math.max(0, riskScore))
  
  const securityEvent = new this({
    ...eventData,
    eventId,
    riskScore,
    timestamp: eventData.timestamp || new Date()
  })
  
  return await securityEvent.save()
}

// Static method to get security dashboard
securityEventSchema.statics.getSecurityDashboard = async function(hours = 24) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000)
  
  const pipeline = [
    { $match: { timestamp: { $gte: startTime }, archived: false } },
    {
      $group: {
        _id: null,
        totalEvents: { $sum: 1 },
        criticalEvents: {
          $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] }
        },
        highRiskEvents: {
          $sum: { $cond: [{ $gte: ['$riskScore', 80] }, 1, 0] }
        },
        unresolvedEvents: {
          $sum: { $cond: [{ $eq: ['$resolved', false] }, 1, 0] }
        },
        falsePositives: {
          $sum: { $cond: [{ $eq: ['$falsePositive', true] }, 1, 0] }
        },
        avgRiskScore: { $avg: '$riskScore' }
      }
    }
  ]
  
  const eventsByType = await this.aggregate([
    { $match: { timestamp: { $gte: startTime }, archived: false } },
    {
      $group: {
        _id: '$eventType',
        count: { $sum: 1 },
        avgRiskScore: { $avg: '$riskScore' },
        maxSeverity: { $max: '$severity' }
      }
    },
    { $sort: { count: -1 } }
  ])
  
  const eventsByIP = await this.aggregate([
    { $match: { timestamp: { $gte: startTime }, archived: false } },
    {
      $group: {
        _id: '$sourceIp',
        count: { $sum: 1 },
        eventTypes: { $addToSet: '$eventType' },
        maxRiskScore: { $max: '$riskScore' }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ])
  
  const dashboard = await this.aggregate(pipeline)
  
  return {
    summary: dashboard[0] || {
      totalEvents: 0,
      criticalEvents: 0,
      highRiskEvents: 0,
      unresolvedEvents: 0,
      falsePositives: 0,
      avgRiskScore: 0
    },
    eventsByType,
    eventsByIP
  }
}

// Static method to detect patterns
securityEventSchema.statics.detectPatterns = async function() {
  // Detect brute force patterns
  const bruteForcePatterns = await this.aggregate([
    {
      $match: {
        eventType: 'LOGIN_FAILED',
        timestamp: { $gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
        archived: false
      }
    },
    {
      $group: {
        _id: { sourceIp: '$sourceIp', username: '$username' },
        count: { $sum: 1 },
        events: { $push: '$_id' }
      }
    },
    { $match: { count: { $gte: 5 } } } // 5+ failed attempts
  ])
  
  // Detect suspicious location patterns
  const locationPatterns = await this.aggregate([
    {
      $match: {
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
        userId: { $ne: null },
        sourceCountry: { $ne: null },
        archived: false
      }
    },
    {
      $group: {
        _id: '$userId',
        countries: { $addToSet: '$sourceCountry' },
        events: { $push: '$_id' }
      }
    },
    { $match: { 'countries.1': { $exists: true } } } // Multiple countries
  ])
  
  return {
    bruteForcePatterns,
    locationPatterns
  }
}

// Method to add response action
securityEventSchema.methods.addResponseAction = async function(action, performedBy, details = '', automated = false) {
  this.responseActions.push({
    action,
    timestamp: new Date(),
    performedBy,
    details,
    automated
  })
  
  return await this.save()
}

// Method to resolve event
securityEventSchema.methods.resolve = async function(resolvedBy, notes = '') {
  this.resolved = true
  this.resolvedDate = new Date()
  this.resolvedBy = resolvedBy
  this.resolutionNotes = notes
  this.status = 'resolved'
  
  return await this.save()
}

module.exports = mongoose.model('SecurityEvent', securityEventSchema)