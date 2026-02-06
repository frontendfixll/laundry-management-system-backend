const mongoose = require('mongoose');

// ABAC Audit Log Schema
const abacLogSchema = new mongoose.Schema({
  // Decision Information
  decisionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Request Context
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  userRole: {
    type: String,
    required: true
  },
  userTenantId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  
  // Action Details
  action: {
    type: String,
    required: true,
    index: true
  },
  resourceType: {
    type: String,
    required: true,
    index: true
  },
  resourceId: {
    type: String,
    index: true
  },
  
  // ABAC Decision
  decision: {
    type: String,
    enum: ['ALLOW', 'DENY'],
    required: true,
    index: true
  },
  
  // Policy Information
  appliedPolicies: [{
    policyId: String,
    policyName: String,
    effect: String,
    matched: Boolean
  }],
  
  // Evaluation Details
  evaluationTime: {
    type: Number, // milliseconds
    required: true
  },
  
  // Request Attributes (for audit trail)
  subjectAttributes: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  actionAttributes: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  resourceAttributes: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  environmentAttributes: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  
  // Additional Context
  ipAddress: String,
  userAgent: String,
  endpoint: String,
  method: String,
  
  // Error Information (if any)
  error: {
    message: String,
    stack: String
  },
  
  // Retention
  expiresAt: {
    type: Date,
    default: function() {
      // Default 1 month retention
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    },
    index: { expireAfterSeconds: 0 }
  }
}, {
  timestamps: true
});

// Indexes for performance and queries
abacLogSchema.index({ userId: 1, createdAt: -1 });
abacLogSchema.index({ decision: 1, createdAt: -1 });
abacLogSchema.index({ resourceType: 1, action: 1, createdAt: -1 });
abacLogSchema.index({ userTenantId: 1, createdAt: -1 });
abacLogSchema.index({ 'appliedPolicies.policyId': 1 });

// Static method to create log entry
abacLogSchema.statics.createLog = function(logData) {
  const crypto = require('crypto');
  
  return this.create({
    decisionId: crypto.randomUUID(),
    ...logData,
    evaluationTime: logData.evaluationTime || 0
  });
};

// Static method to get logs for user
abacLogSchema.statics.getLogsForUser = function(userId, limit = 100) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select('-subjectAttributes -actionAttributes -resourceAttributes -environmentAttributes');
};

// Static method to get logs for policy
abacLogSchema.statics.getLogsForPolicy = function(policyId, limit = 100) {
  return this.find({ 'appliedPolicies.policyId': policyId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static method to get denial logs
abacLogSchema.statics.getDenialLogs = function(filters = {}, limit = 100) {
  const query = { decision: 'DENY', ...filters };
  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static method to get statistics
abacLogSchema.statics.getStatistics = function(timeRange = 24) {
  const startTime = new Date(Date.now() - timeRange * 60 * 60 * 1000);
  
  return this.aggregate([
    { $match: { createdAt: { $gte: startTime } } },
    {
      $group: {
        _id: '$decision',
        count: { $sum: 1 },
        avgEvaluationTime: { $avg: '$evaluationTime' }
      }
    }
  ]);
};

module.exports = mongoose.model('ABACLog', abacLogSchema);