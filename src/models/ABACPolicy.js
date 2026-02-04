const mongoose = require('mongoose');

// ABAC Attribute Schema
const attributeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  operator: { 
    type: String, 
    enum: ['equals', 'not_equals', 'in', 'not_in', 'greater_than', 'less_than', 'contains', 'regex'],
    required: true 
  },
  value: { type: mongoose.Schema.Types.Mixed, required: true }
}, { _id: false });

// ABAC Policy Schema
const abacPolicySchema = new mongoose.Schema({
  // Policy Identification
  name: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: 100
  },
  description: { 
    type: String, 
    required: true,
    maxlength: 500
  },
  policyId: { 
    type: String, 
    required: true, 
    unique: true,
    uppercase: true
  },

  // Policy Scope
  scope: {
    type: String,
    enum: ['PLATFORM', 'TENANT'],
    required: true,
    index: true
  },

  // Policy Status
  isActive: { 
    type: Boolean, 
    default: true,
    index: true
  },
  priority: { 
    type: Number, 
    default: 100,
    min: 1,
    max: 1000
  },

  // ABAC Decision Model: SUBJECT + ACTION + RESOURCE + ENVIRONMENT
  
  // Subject Attributes (Who is acting)
  subjectAttributes: [attributeSchema],
  
  // Action Attributes (What they want to do)
  actionAttributes: [attributeSchema],
  
  // Resource Attributes (On what data)
  resourceAttributes: [attributeSchema],
  
  // Environment Attributes (Under what conditions)
  environmentAttributes: [attributeSchema],

  // Policy Decision
  effect: {
    type: String,
    enum: ['ALLOW', 'DENY'],
    required: true
  },

  // Policy Category for organization
  category: {
    type: String,
    enum: [
      'TENANT_ISOLATION',
      'READ_ONLY_ENFORCEMENT', 
      'FINANCIAL_LIMITS',
      'TIME_BOUND_ACTIONS',
      'AUTOMATION_SCOPE',
      'NOTIFICATION_SAFETY',
      'CUSTOM'
    ],
    required: true,
    index: true
  },

  // Audit and Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin'
  },
  
  // Policy versioning
  version: {
    type: Number,
    default: 1
  },
  
  // Hot-reload support
  lastReloaded: {
    type: Date,
    default: Date.now
  },

  // Usage statistics
  evaluationCount: {
    type: Number,
    default: 0
  },
  allowCount: {
    type: Number,
    default: 0
  },
  denyCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for performance
abacPolicySchema.index({ scope: 1, isActive: 1, priority: -1 });
abacPolicySchema.index({ category: 1, isActive: 1 });
abacPolicySchema.index({ policyId: 1 });

// Static method to get core policies
abacPolicySchema.statics.getCorePolicy = function(policyId) {
  const corePolicies = {
    'TENANT_ISOLATION': {
      name: 'Tenant Isolation Policy',
      description: 'Ensures users can only access resources within their tenant',
      policyId: 'TENANT_ISOLATION',
      scope: 'TENANT',
      category: 'TENANT_ISOLATION',
      effect: 'DENY',
      resourceAttributes: [
        {
          name: 'tenant_id',
          operator: 'not_equals',
          value: '${user.tenant_id}'
        }
      ],
      priority: 1000
    },
    'READ_ONLY_ENFORCEMENT': {
      name: 'Read-Only User Enforcement',
      description: 'Prevents read-only users from performing write operations',
      policyId: 'READ_ONLY_ENFORCEMENT',
      scope: 'PLATFORM',
      category: 'READ_ONLY_ENFORCEMENT',
      effect: 'DENY',
      subjectAttributes: [
        {
          name: 'is_read_only',
          operator: 'equals',
          value: true
        }
      ],
      actionAttributes: [
        {
          name: 'action',
          operator: 'in',
          value: ['create', 'update', 'delete', 'approve']
        }
      ],
      priority: 900
    },
    'FINANCIAL_APPROVAL_LIMITS': {
      name: 'Financial Approval Limits',
      description: 'Enforces approval limits for financial operations',
      policyId: 'FINANCIAL_APPROVAL_LIMITS',
      scope: 'PLATFORM',
      category: 'FINANCIAL_LIMITS',
      effect: 'DENY',
      actionAttributes: [
        {
          name: 'action',
          operator: 'equals',
          value: 'approve'
        }
      ],
      resourceAttributes: [
        {
          name: 'amount',
          operator: 'greater_than',
          value: '${user.approval_limit}'
        }
      ],
      priority: 800
    },
    'BUSINESS_HOURS_PAYOUTS': {
      name: 'Business Hours Payout Restriction',
      description: 'Restricts payout approvals to business hours only',
      policyId: 'BUSINESS_HOURS_PAYOUTS',
      scope: 'PLATFORM',
      category: 'TIME_BOUND_ACTIONS',
      effect: 'DENY',
      actionAttributes: [
        {
          name: 'action',
          operator: 'equals',
          value: 'approve'
        }
      ],
      resourceAttributes: [
        {
          name: 'resource_type',
          operator: 'equals',
          value: 'payout'
        }
      ],
      environmentAttributes: [
        {
          name: 'business_hours',
          operator: 'equals',
          value: false
        }
      ],
      priority: 700
    },
    'AUTOMATION_SCOPE_PROTECTION': {
      name: 'Automation Scope Protection',
      description: 'Prevents tenant admins from accessing platform automation',
      policyId: 'AUTOMATION_SCOPE_PROTECTION',
      scope: 'PLATFORM',
      category: 'AUTOMATION_SCOPE',
      effect: 'DENY',
      subjectAttributes: [
        {
          name: 'role',
          operator: 'equals',
          value: 'TenantAdmin'
        }
      ],
      resourceAttributes: [
        {
          name: 'automation_scope',
          operator: 'equals',
          value: 'PLATFORM'
        }
      ],
      priority: 600
    },
    'NOTIFICATION_TENANT_SAFETY': {
      name: 'Notification Tenant Safety',
      description: 'Ensures notifications are only sent within tenant boundaries',
      policyId: 'NOTIFICATION_TENANT_SAFETY',
      scope: 'TENANT',
      category: 'NOTIFICATION_SAFETY',
      effect: 'DENY',
      resourceAttributes: [
        {
          name: 'event_tenant_id',
          operator: 'not_equals',
          value: '${user.tenant_id}'
        }
      ],
      actionAttributes: [
        {
          name: 'action',
          operator: 'equals',
          value: 'notify'
        }
      ],
      priority: 500
    }
  };

  return corePolicies[policyId] || null;
};

// Method to increment evaluation count
abacPolicySchema.methods.incrementEvaluation = function(decision) {
  this.evaluationCount += 1;
  if (decision === 'ALLOW') {
    this.allowCount += 1;
  } else {
    this.denyCount += 1;
  }
  return this.save({ validateBeforeSave: false });
};

// Method to check if policy needs reload
abacPolicySchema.methods.needsReload = function() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  return this.updatedAt > this.lastReloaded || this.lastReloaded < fiveMinutesAgo;
};

// Method to mark as reloaded
abacPolicySchema.methods.markReloaded = function() {
  this.lastReloaded = new Date();
  return this.save({ validateBeforeSave: false });
};

module.exports = mongoose.model('ABACPolicy', abacPolicySchema);