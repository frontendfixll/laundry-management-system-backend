const mongoose = require('mongoose')

const auditLogSchema = new mongoose.Schema({
  // Core audit information
  timestamp: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  },

  // Who performed the action
  who: {
    type: String,
    required: true,
    index: true
  },

  whoId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  role: {
    type: String,
    required: true,
    enum: [
      'Super Admin',
      'Platform Support',
      'Platform Finance Admin',
      'Platform Auditor',
      'Sales User',
      'Tenant Admin',
      'Tenant User',
      'Customer',
      'System'
    ]
  },

  // What action was performed
  action: {
    type: String,
    required: true,
    index: true,
    enum: [
      // User Management
      'CREATE_USER', 'UPDATE_USER', 'DELETE_USER', 'LOGIN', 'LOGOUT', 'PASSWORD_RESET',
      'ACCOUNT_LOCK', 'ACCOUNT_UNLOCK', 'IMPERSONATE_START', 'IMPERSONATE_END',
      'CREATE_PLATFORM_USER', 'UPDATE_PLATFORM_USER', 'DELETE_PLATFORM_USER',

      // Role & Permission Management
      'CREATE_ROLE', 'UPDATE_ROLE', 'DELETE_ROLE', 'ASSIGN_ROLE', 'REVOKE_ROLE',
      'UPDATE_PERMISSIONS', 'GRANT_PERMISSION', 'REVOKE_PERMISSION',
      'CREATE_SUPERADMIN_ROLE', 'UPDATE_SUPERADMIN_ROLE', 'DELETE_SUPERADMIN_ROLE',

      // Tenancy Management
      'CREATE_TENANCY', 'UPDATE_TENANCY', 'DELETE_TENANCY', 'ACTIVATE_TENANCY', 'DEACTIVATE_TENANCY',

      // Order Management
      'CREATE_ORDER', 'UPDATE_ORDER', 'DELETE_ORDER', 'CANCEL_ORDER', 'REFUND_ORDER',
      'APPROVE_ORDER', 'REJECT_ORDER', 'ASSIGN_ORDER', 'COMPLETE_ORDER',

      // Financial Operations
      'PROCESS_PAYMENT', 'APPROVE_REFUND', 'REJECT_REFUND', 'CREATE_SETTLEMENT',
      'APPROVE_SETTLEMENT', 'REJECT_SETTLEMENT', 'MANUAL_ADJUSTMENT',

      // Support Operations
      'CREATE_TICKET', 'UPDATE_TICKET', 'RESOLVE_TICKET', 'ESCALATE_TICKET',
      'ASSIGN_TICKET', 'CLOSE_TICKET',

      // System Operations
      'SYSTEM_BACKUP', 'SYSTEM_RESTORE', 'CONFIG_CHANGE', 'MAINTENANCE_MODE',
      'DATA_EXPORT', 'DATA_IMPORT', 'BULK_OPERATION',

      // Security Events
      'LOGIN_FAILED', 'PERMISSION_DENIED', 'SUSPICIOUS_ACTIVITY', 'SECURITY_ALERT',
      'PASSWORD_BREACH', 'ACCOUNT_COMPROMISE'
    ]
  },

  // What entity was affected
  entity: {
    type: String,
    required: true,
    enum: [
      'User', 'Role', 'Permission', 'Tenancy', 'Order', 'Transaction', 'Settlement',
      'Ticket', 'Addon', 'Campaign', 'Banner', 'Notification', 'System', 'AuditLog'
    ]
  },

  entityId: {
    type: String,
    required: true,
    index: true
  },

  // Tenant context (null for platform-level actions)
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    default: null,
    index: true
  },

  tenantName: {
    type: String,
    default: null
  },

  // Technical details
  ipAddress: {
    type: String,
    required: true
  },

  userAgent: {
    type: String,
    default: 'Unknown'
  },

  // Outcome of the action
  outcome: {
    type: String,
    required: true,
    enum: ['success', 'failure', 'warning', 'pending'],
    default: 'success'
  },

  // Severity level for security and compliance
  severity: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },

  // Detailed information about the action
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Before and after states for changes
  beforeState: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  afterState: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // Error information for failed actions
  errorMessage: {
    type: String,
    default: null
  },

  errorCode: {
    type: String,
    default: null
  },

  // Session information
  sessionId: {
    type: String,
    default: null
  },

  // Compliance and regulatory flags
  complianceFlags: [{
    type: String,
    enum: ['GDPR', 'PCI_DSS', 'SOC2', 'HIPAA', 'PII_ACCESS', 'FINANCIAL_DATA']
  }],

  // Data retention and archival
  retentionPeriod: {
    type: Number, // Days
    default: 2555 // 7 years default
  },

  archived: {
    type: Boolean,
    default: false
  },

  // Immutability protection
  hash: {
    type: String,
    required: true
  },

  previousHash: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  collection: 'auditlogs'
})

// Indexes for performance
auditLogSchema.index({ timestamp: -1 })
auditLogSchema.index({ who: 1, timestamp: -1 })
auditLogSchema.index({ action: 1, timestamp: -1 })
auditLogSchema.index({ entity: 1, entityId: 1 })
auditLogSchema.index({ tenantId: 1, timestamp: -1 })
auditLogSchema.index({ severity: 1, timestamp: -1 })
auditLogSchema.index({ outcome: 1, timestamp: -1 })
auditLogSchema.index({ complianceFlags: 1 })

// Compound indexes for common queries
auditLogSchema.index({ tenantId: 1, action: 1, timestamp: -1 })
auditLogSchema.index({ who: 1, entity: 1, timestamp: -1 })
auditLogSchema.index({ severity: 1, outcome: 1, timestamp: -1 })

// Static method to create audit log with hash (with backward compatibility)
auditLogSchema.statics.logAction = async function (logData) {
  const crypto = require('crypto')

  // Handle backward compatibility - convert old format to new format
  let normalizedData = {}

  if ((logData.userId || !logData.userId) && logData.userType) {
    // Old format - convert to new format
    normalizedData = {
      who: logData.userEmail || (logData.userId ? logData.userId.toString() : 'Anonymous'),
      whoId: logData.userId || new mongoose.Types.ObjectId(),
      role: this.mapUserTypeToRole(logData.userType),
      action: this.mapOldActionToNew(logData.action),
      entity: logData.entity || 'System',
      entityId: logData.entityId || (logData.userId ? logData.userId.toString() : (logData.whoId ? logData.whoId.toString() : 'system')),
      tenantId: logData.tenantId || null,
      tenantName: logData.tenantName || (logData.tenantId ? 'Tenant' : 'Platform'),
      ipAddress: logData.ipAddress || '127.0.0.1',
      userAgent: logData.userAgent || 'Unknown',
      outcome: this.mapStatusToOutcome(logData.status),
      severity: this.mapRiskToSeverity(logData.riskLevel),
      details: {
        description: logData.description,
        category: logData.category,
        metadata: logData.metadata,
        ...logData.details
      },
      sessionId: logData.sessionId,
      complianceFlags: logData.complianceFlags || []
    }
  } else {
    // New format - use as is
    normalizedData = logData
  }

  // Ensure required fields have defaults
  normalizedData.who = normalizedData.who || 'System'
  normalizedData.whoId = normalizedData.whoId || new mongoose.Types.ObjectId()
  normalizedData.role = normalizedData.role || 'System'
  normalizedData.action = normalizedData.action || 'SYSTEM_ACTION'
  normalizedData.entity = normalizedData.entity || 'System'
  normalizedData.entityId = normalizedData.entityId || 'system'
  normalizedData.ipAddress = normalizedData.ipAddress || '127.0.0.1'
  normalizedData.outcome = normalizedData.outcome || 'success'
  normalizedData.severity = normalizedData.severity || 'low'

  // Get the last audit log for hash chaining
  const lastLog = await this.findOne({}, {}, { sort: { timestamp: -1 } })

  // Create hash for immutability
  const logString = JSON.stringify({
    timestamp: normalizedData.timestamp || new Date(),
    who: normalizedData.who,
    action: normalizedData.action,
    entity: normalizedData.entity,
    entityId: normalizedData.entityId,
    details: normalizedData.details
  })

  const hash = crypto.createHash('sha256').update(logString).digest('hex')
  const previousHash = lastLog ? lastLog.hash : null

  // Create the audit log
  const auditLog = new this({
    ...normalizedData,
    hash,
    previousHash,
    timestamp: normalizedData.timestamp || new Date()
  })

  return await auditLog.save()
}

// Helper methods for backward compatibility
auditLogSchema.statics.mapUserTypeToRole = function (userType) {
  const mapping = {
    'superadmin': 'Super Admin',
    'center_admin': 'Super Admin',
    'sales': 'Sales User',
    'support': 'Platform Support',
    'finance': 'Platform Finance Admin',
    'auditor': 'Platform Auditor',
    // Handle direct role names too
    'Super Admin': 'Super Admin',
    'SuperAdmin': 'Super Admin',
    'Platform Support': 'Platform Support',
    'Platform Finance Admin': 'Platform Finance Admin',
    'Platform Auditor': 'Platform Auditor',
    'Sales User': 'Sales User',
    'Tenant Admin': 'Tenant Admin',
    'Tenant User': 'Tenant User',
    'Customer': 'Customer'
  }
  return mapping[userType] || 'System'
}

auditLogSchema.statics.mapOldActionToNew = function (action) {
  const mapping = {
    'login': 'LOGIN',
    'logout': 'LOGOUT',
    'failed_login': 'LOGIN_FAILED',
    'failed_mfa': 'SECURITY_ALERT',
    'create': 'CREATE_USER',
    'update': 'UPDATE_USER',
    'delete': 'DELETE_USER',
    'ip_change': 'SUSPICIOUS_ACTIVITY',
    'role_assignment': 'ASSIGN_ROLE',
    'permission_grant': 'GRANT_PERMISSION',
    'permission_revoke': 'REVOKE_PERMISSION'
  }
  return mapping[action] || action.toUpperCase()
}

auditLogSchema.statics.mapStatusToOutcome = function (status) {
  const mapping = {
    'success': 'success',
    'failure': 'failure',
    'error': 'failure',
    'warning': 'warning',
    'pending': 'pending'
  }
  return mapping[status] || 'success'
}

auditLogSchema.statics.mapRiskToSeverity = function (riskLevel) {
  const mapping = {
    'low': 'low',
    'medium': 'medium',
    'high': 'high',
    'critical': 'critical'
  }
  return mapping[riskLevel] || 'low'
}

// Static method for compliance queries
auditLogSchema.statics.getComplianceLogs = async function (complianceType, startDate, endDate) {
  return await this.find({
    complianceFlags: complianceType,
    timestamp: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ timestamp: -1 })
}

// Static method for security analysis
auditLogSchema.statics.getSecurityEvents = async function (severity = 'high', hours = 24) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000)

  return await this.find({
    severity: { $in: Array.isArray(severity) ? severity : [severity] },
    timestamp: { $gte: startTime },
    $or: [
      { action: { $in: ['LOGIN_FAILED', 'PERMISSION_DENIED', 'SUSPICIOUS_ACTIVITY'] } },
      { outcome: 'failure' },
      { severity: 'critical' }
    ]
  }).sort({ timestamp: -1 })
}

// Static method for audit trail integrity check
auditLogSchema.statics.verifyIntegrity = async function () {
  const logs = await this.find({}).sort({ timestamp: 1 })
  let previousHash = null
  let integrityIssues = []

  for (let log of logs) {
    if (log.previousHash !== previousHash) {
      integrityIssues.push({
        logId: log._id,
        timestamp: log.timestamp,
        expectedPreviousHash: previousHash,
        actualPreviousHash: log.previousHash
      })
    }
    previousHash = log.hash
  }

  return {
    totalLogs: logs.length,
    integrityIssues: integrityIssues.length,
    issues: integrityIssues
  }
}

// Prevent modification after creation (immutability)
auditLogSchema.pre('findOneAndUpdate', function () {
  throw new Error('Audit logs are immutable and cannot be modified')
})

auditLogSchema.pre('updateOne', function () {
  throw new Error('Audit logs are immutable and cannot be modified')
})

auditLogSchema.pre('updateMany', function () {
  throw new Error('Audit logs are immutable and cannot be modified')
})

module.exports = mongoose.model('AuditLog', auditLogSchema)