const mongoose = require('mongoose')

const complianceRecordSchema = new mongoose.Schema({
  // Compliance framework
  framework: {
    type: String,
    required: true,
    enum: ['GDPR', 'PCI_DSS', 'SOC2_TYPE_I', 'SOC2_TYPE_II', 'HIPAA', 'CCPA', 'ISO_27001'],
    index: true
  },
  
  // Specific requirement within the framework
  requirement: {
    type: String,
    required: true,
    index: true
  },
  
  // Requirement details
  requirementId: {
    type: String,
    required: true
  },
  
  description: {
    type: String,
    required: true
  },
  
  category: {
    type: String,
    required: true,
    enum: [
      'Data Protection',
      'Access Control', 
      'Audit Logging',
      'Data Retention',
      'Encryption',
      'Network Security',
      'Incident Response',
      'Business Continuity',
      'Risk Management',
      'Privacy Controls'
    ]
  },
  
  // Compliance status
  status: {
    type: String,
    required: true,
    enum: ['compliant', 'non_compliant', 'pending_review', 'in_progress', 'not_applicable'],
    default: 'pending_review'
  },
  
  // Risk level if non-compliant
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  
  // Assessment details
  lastAssessment: {
    date: {
      type: Date,
      required: true,
      default: Date.now
    },
    assessedBy: {
      type: String,
      required: true
    },
    assessorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    method: {
      type: String,
      enum: ['automated', 'manual', 'external_audit', 'self_assessment'],
      default: 'manual'
    },
    evidence: [{
      type: String,
      description: String,
      url: String,
      uploadDate: Date
    }],
    notes: String
  },
  
  // Next review schedule
  nextReview: {
    type: Date,
    required: true,
    index: true
  },
  
  reviewFrequency: {
    type: String,
    enum: ['weekly', 'monthly', 'quarterly', 'semi_annually', 'annually'],
    default: 'quarterly'
  },
  
  // Remediation if non-compliant
  remediation: {
    required: {
      type: Boolean,
      default: false
    },
    plan: String,
    assignedTo: String,
    assigneeId: mongoose.Schema.Types.ObjectId,
    dueDate: Date,
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed', 'overdue'],
      default: 'not_started'
    },
    completedDate: Date,
    verifiedBy: String,
    verificationDate: Date
  },
  
  // Historical compliance data
  history: [{
    date: Date,
    status: String,
    assessedBy: String,
    notes: String,
    evidence: [String]
  }],
  
  // Automated monitoring
  automatedCheck: {
    enabled: {
      type: Boolean,
      default: false
    },
    checkType: {
      type: String,
      enum: ['database_query', 'log_analysis', 'file_check', 'api_call', 'script_execution']
    },
    checkQuery: String,
    checkFrequency: {
      type: String,
      enum: ['hourly', 'daily', 'weekly'],
      default: 'daily'
    },
    lastCheck: Date,
    nextCheck: Date,
    checkResults: [{
      date: Date,
      result: String,
      status: String,
      details: mongoose.Schema.Types.Mixed
    }]
  },
  
  // Tenant-specific compliance (null for platform-wide)
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    default: null,
    index: true
  },
  
  // Tags for categorization
  tags: [String],
  
  // External references
  externalReferences: [{
    type: String,
    url: String,
    description: String
  }],
  
  // Compliance score contribution
  scoreWeight: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  
  // Active status
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'compliancerecords'
})

// Indexes
complianceRecordSchema.index({ framework: 1, status: 1 })
complianceRecordSchema.index({ nextReview: 1, isActive: 1 })
complianceRecordSchema.index({ tenantId: 1, framework: 1 })
complianceRecordSchema.index({ category: 1, riskLevel: 1 })
complianceRecordSchema.index({ 'remediation.dueDate': 1, 'remediation.status': 1 })

// Static method to get compliance dashboard
complianceRecordSchema.statics.getComplianceDashboard = async function(tenantId = null) {
  const matchStage = tenantId ? { tenantId } : { tenantId: null }
  
  const pipeline = [
    { $match: { ...matchStage, isActive: true } },
    {
      $group: {
        _id: '$framework',
        total: { $sum: 1 },
        compliant: {
          $sum: { $cond: [{ $eq: ['$status', 'compliant'] }, 1, 0] }
        },
        nonCompliant: {
          $sum: { $cond: [{ $eq: ['$status', 'non_compliant'] }, 1, 0] }
        },
        pendingReview: {
          $sum: { $cond: [{ $eq: ['$status', 'pending_review'] }, 1, 0] }
        },
        highRisk: {
          $sum: { $cond: [{ $and: [
            { $eq: ['$status', 'non_compliant'] },
            { $in: ['$riskLevel', ['high', 'critical']] }
          ]}, 1, 0] }
        },
        overdue: {
          $sum: { $cond: [{ $lt: ['$nextReview', new Date()] }, 1, 0] }
        }
      }
    },
    {
      $project: {
        framework: '$_id',
        total: 1,
        compliant: 1,
        nonCompliant: 1,
        pendingReview: 1,
        highRisk: 1,
        overdue: 1,
        complianceRate: {
          $multiply: [
            { $divide: ['$compliant', '$total'] },
            100
          ]
        }
      }
    }
  ]
  
  return await this.aggregate(pipeline)
}

// Static method to get overdue reviews
complianceRecordSchema.statics.getOverdueReviews = async function() {
  return await this.find({
    nextReview: { $lt: new Date() },
    isActive: true
  }).sort({ nextReview: 1 })
}

// Static method to calculate overall compliance score
complianceRecordSchema.statics.calculateComplianceScore = async function(tenantId = null) {
  const matchStage = tenantId ? { tenantId } : { tenantId: null }
  
  const pipeline = [
    { $match: { ...matchStage, isActive: true } },
    {
      $group: {
        _id: null,
        totalWeight: { $sum: '$scoreWeight' },
        compliantWeight: {
          $sum: {
            $cond: [
              { $eq: ['$status', 'compliant'] },
              '$scoreWeight',
              0
            ]
          }
        }
      }
    },
    {
      $project: {
        score: {
          $multiply: [
            { $divide: ['$compliantWeight', '$totalWeight'] },
            100
          ]
        }
      }
    }
  ]
  
  const result = await this.aggregate(pipeline)
  return result[0]?.score || 0
}

// Method to update compliance status
complianceRecordSchema.methods.updateStatus = async function(newStatus, assessedBy, assessorId, notes = '', evidence = []) {
  // Add to history
  this.history.push({
    date: new Date(),
    status: this.status,
    assessedBy: this.lastAssessment.assessedBy,
    notes: this.lastAssessment.notes
  })
  
  // Update current status
  this.status = newStatus
  this.lastAssessment = {
    date: new Date(),
    assessedBy,
    assessorId,
    method: 'manual',
    evidence,
    notes
  }
  
  // Set next review date based on frequency
  const frequencyDays = {
    weekly: 7,
    monthly: 30,
    quarterly: 90,
    semi_annually: 180,
    annually: 365
  }
  
  this.nextReview = new Date(Date.now() + frequencyDays[this.reviewFrequency] * 24 * 60 * 60 * 1000)
  
  return await this.save()
}

module.exports = mongoose.model('ComplianceRecord', complianceRecordSchema)