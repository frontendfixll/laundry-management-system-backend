const mongoose = require('mongoose');
const ABACPolicy = require('../models/ABACPolicy');
const SuperAdmin = require('../models/SuperAdmin');
require('dotenv').config();

/**
 * Initialize core ABAC policies
 */
async function initializeCoreABACPolicies() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('📦 Connected to MongoDB for ABAC policy initialization');

    // Find or create a system SuperAdmin for policy creation
    let systemAdmin = await SuperAdmin.findOne({ email: 'system@laundrypro.com' });
    if (!systemAdmin) {
      systemAdmin = new SuperAdmin({
        name: 'System Administrator',
        email: 'system@laundrypro.com',
        password: 'system-generated-password',
        role: 'superadmin',
        isActive: true
      });
      await systemAdmin.save();
      console.log('👤 Created system administrator for ABAC policies');
    }

    // Core policies to initialize
    const corePolicies = [
      {
        name: 'Tenant Isolation Policy',
        description: 'Ensures users can only access resources within their tenant',
        policyId: 'TENANT_ISOLATION',
        scope: 'TENANT',
        category: 'TENANT_ISOLATION',
        effect: 'DENY',
        priority: 1000,
        resourceAttributes: [
          {
            name: 'tenant_id',
            operator: 'not_equals',
            value: '${subject.tenant_id}'
          }
        ],
        subjectAttributes: [],
        actionAttributes: [],
        environmentAttributes: []
      },
      {
        name: 'Read-Only User Enforcement',
        description: 'Prevents read-only users from performing write operations',
        policyId: 'READ_ONLY_ENFORCEMENT',
        scope: 'PLATFORM',
        category: 'READ_ONLY_ENFORCEMENT',
        effect: 'DENY',
        priority: 900,
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
        resourceAttributes: [],
        environmentAttributes: []
      },
      {
        name: 'Financial Approval Limits',
        description: 'Enforces approval limits for financial operations',
        policyId: 'FINANCIAL_APPROVAL_LIMITS',
        scope: 'PLATFORM',
        category: 'FINANCIAL_LIMITS',
        effect: 'DENY',
        priority: 800,
        subjectAttributes: [],
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
            value: '${subject.approval_limit}'
          }
        ],
        environmentAttributes: []
      },
      {
        name: 'Business Hours Payout Restriction',
        description: 'Restricts payout approvals to business hours only',
        policyId: 'BUSINESS_HOURS_PAYOUTS',
        scope: 'PLATFORM',
        category: 'TIME_BOUND_ACTIONS',
        effect: 'DENY',
        priority: 700,
        subjectAttributes: [],
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
        ]
      },
      {
        name: 'Automation Scope Protection',
        description: 'Prevents tenant admins from accessing platform automation',
        policyId: 'AUTOMATION_SCOPE_PROTECTION',
        scope: 'PLATFORM',
        category: 'AUTOMATION_SCOPE',
        effect: 'DENY',
        priority: 600,
        subjectAttributes: [
          {
            name: 'role',
            operator: 'equals',
            value: 'TenantAdmin'
          }
        ],
        actionAttributes: [],
        resourceAttributes: [
          {
            name: 'automation_scope',
            operator: 'equals',
            value: 'PLATFORM'
          }
        ],
        environmentAttributes: []
      },
      {
        name: 'Notification Tenant Safety',
        description: 'Ensures notifications are only sent within tenant boundaries',
        policyId: 'NOTIFICATION_TENANT_SAFETY',
        scope: 'TENANT',
        category: 'NOTIFICATION_SAFETY',
        effect: 'DENY',
        priority: 500,
        subjectAttributes: [],
        actionAttributes: [
          {
            name: 'action',
            operator: 'equals',
            value: 'notify'
          }
        ],
        resourceAttributes: [
          {
            name: 'event_tenant_id',
            operator: 'not_equals',
            value: '${subject.tenant_id}'
          }
        ],
        environmentAttributes: []
      }
    ];

    let createdCount = 0;
    let updatedCount = 0;

    for (const policyData of corePolicies) {
      const existingPolicy = await ABACPolicy.findOne({ policyId: policyData.policyId });
      
      if (existingPolicy) {
        console.log(`⚠️ Policy ${policyData.policyId} already exists, skipping...`);
        continue;
      }

      const policy = new ABACPolicy({
        ...policyData,
        createdBy: systemAdmin._id,
        isActive: true
      });

      await policy.save();
      createdCount++;
      console.log(`✅ Created ABAC policy: ${policyData.policyId}`);
    }

    console.log(`\n🎉 ABAC Policy Initialization Complete!`);
    console.log(`📊 Created: ${createdCount} policies`);
    console.log(`📊 Skipped: ${corePolicies.length - createdCount} existing policies`);

    // Verify all policies are active
    const activePolicies = await ABACPolicy.find({ isActive: true });
    console.log(`\n🔍 Total active ABAC policies: ${activePolicies.length}`);
    
    activePolicies.forEach(policy => {
      console.log(`   - ${policy.policyId}: ${policy.name} (${policy.scope})`);
    });

  } catch (error) {
    console.error('❌ Error initializing ABAC policies:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('📦 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run if called directly
if (require.main === module) {
  initializeCoreABACPolicies();
}

module.exports = initializeCoreABACPolicies;