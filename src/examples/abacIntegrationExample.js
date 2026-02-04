/**
 * ABAC Integration Examples
 * 
 * This file shows how to integrate ABAC middleware with existing routes
 * to provide fine-grained access control after RBAC checks.
 */

const express = require('express');
const router = express.Router();
const { requireSuperAdminPermission } = require('../middlewares/rbacMiddleware');
const { 
  requireABACPermission, 
  requireTenantIsolation, 
  requireFinancialLimits,
  requireWriteAccess,
  requireBusinessHours 
} = require('../middlewares/abacMiddleware');
const superAdminAuth = require('../middlewares/superAdminAuth');

// Example 1: Basic ABAC integration with RBAC
// Order: Auth -> RBAC -> ABAC -> Controller
router.get('/tenancies/:id', 
  superAdminAuth, // 1. Authentication
  requireSuperAdminPermission('tenancies', 'view'), // 2. RBAC check
  requireABACPermission({ // 3. ABAC check
    action: 'view',
    resourceType: 'tenancy',
    resourceExtractor: async (req, user) => {
      return {
        tenant_id: req.params.id,
        resource_type: 'tenancy'
      };
    }
  }),
  async (req, res) => {
    // Controller logic here
    res.json({ success: true, message: 'Access granted' });
  }
);

// Example 2: Tenant isolation for tenant-scoped resources
router.get('/orders/:id',
  superAdminAuth,
  requireSuperAdminPermission('orders', 'view'),
  requireTenantIsolation(async (req) => {
    // Extract tenant ID from order
    const Order = require('../models/Order');
    const order = await Order.findById(req.params.id);
    return { tenant_id: order?.tenancy?.toString() };
  }),
  async (req, res) => {
    // Controller logic here
    res.json({ success: true, message: 'Order access granted' });
  }
);

// Example 3: Financial limits for approval operations
router.post('/refunds/:id/approve',
  superAdminAuth,
  requireSuperAdminPermission('refunds', 'approve'),
  requireFinancialLimits(async (req) => {
    // Extract refund amount
    const Refund = require('../models/Refund');
    const refund = await Refund.findById(req.params.id);
    return refund?.amount || 0;
  }),
  async (req, res) => {
    // Controller logic here
    res.json({ success: true, message: 'Refund approved' });
  }
);

// Example 4: Read-only enforcement for write operations
router.post('/tenancies',
  superAdminAuth,
  requireSuperAdminPermission('tenancies', 'create'),
  requireWriteAccess(), // Prevents read-only users from creating
  async (req, res) => {
    // Controller logic here
    res.json({ success: true, message: 'Tenancy created' });
  }
);

// Example 5: Business hours restriction for sensitive operations
router.post('/payouts/:id/approve',
  superAdminAuth,
  requireSuperAdminPermission('payouts', 'approve'),
  requireBusinessHours('payout'), // Only during business hours
  requireFinancialLimits(async (req) => {
    const Payout = require('../models/Payout');
    const payout = await Payout.findById(req.params.id);
    return payout?.amount || 0;
  }),
  async (req, res) => {
    // Controller logic here
    res.json({ success: true, message: 'Payout approved' });
  }
);

// Example 6: Custom ABAC policy for complex scenarios
router.post('/automation/rules',
  superAdminAuth,
  requireSuperAdminPermission('automation', 'create'),
  requireABACPermission({
    action: 'create',
    resourceType: 'automation_rule',
    resourceExtractor: async (req, user) => {
      return {
        automation_scope: req.body.scope, // PLATFORM or TENANT
        resource_type: 'automation_rule',
        tenant_id: req.body.tenantId
      };
    }
  }),
  async (req, res) => {
    // Controller logic here
    res.json({ success: true, message: 'Automation rule created' });
  }
);

// Example 7: Notification safety for real-time events
router.post('/notifications/send',
  superAdminAuth,
  requireSuperAdminPermission('notifications', 'create'),
  requireABACPermission({
    action: 'notify',
    resourceType: 'notification',
    resourceExtractor: async (req, user) => {
      return {
        event_tenant_id: req.body.tenantId,
        resource_type: 'notification',
        notification_type: req.body.type
      };
    }
  }),
  async (req, res) => {
    // Controller logic here
    res.json({ success: true, message: 'Notification sent' });
  }
);

/**
 * Integration Guidelines:
 * 
 * 1. ALWAYS run ABAC after RBAC, never before
 * 2. Use specific ABAC middleware for common patterns (tenant isolation, financial limits)
 * 3. Use generic requireABACPermission for custom scenarios
 * 4. Always provide resourceExtractor for dynamic resource attributes
 * 5. ABAC decisions are logged automatically for audit
 * 6. ABAC failures return 403 with specific policy violation details
 * 7. Test ABAC policies thoroughly before deploying to production
 */

module.exports = router;