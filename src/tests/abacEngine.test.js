const mongoose = require('mongoose');
const ABACPolicy = require('../models/ABACPolicy');
const ABACLog = require('../models/ABACLog');
const abacEngine = require('../services/abacEngine');

// Mock MongoDB connection for testing
jest.mock('mongoose');

describe('ABAC Engine', () => {
  beforeEach(() => {
    // Clear policy cache before each test
    abacEngine.policyCache.clear();
    abacEngine.lastCacheUpdate = null;
  });

  describe('Policy Evaluation', () => {
    test('should allow access when no policies match', async () => {
      // Mock empty policy result
      ABACPolicy.find = jest.fn().mockResolvedValue([]);
      ABACLog.createLog = jest.fn().mockResolvedValue({});

      const context = {
        subject: { id: 'user1', role: 'admin', tenant_id: 'tenant1' },
        action: { action: 'view' },
        resource: { resource_type: 'order', tenant_id: 'tenant1' },
        environment: { business_hours: true }
      };

      const result = await abacEngine.evaluate(context);
      
      expect(result.decision).toBe('ALLOW');
      expect(result.appliedPolicies).toHaveLength(0);
    });

    test('should deny access when DENY policy matches', async () => {
      // Mock policy that denies access
      const denyPolicy = {
        policyId: 'TEST_DENY',
        name: 'Test Deny Policy',
        effect: 'DENY',
        priority: 100,
        subjectAttributes: [
          { name: 'role', operator: 'equals', value: 'admin' }
        ],
        actionAttributes: [],
        resourceAttributes: [],
        environmentAttributes: []
      };

      ABACPolicy.find = jest.fn().mockResolvedValue([denyPolicy]);
      ABACLog.createLog = jest.fn().mockResolvedValue({});

      const context = {
        subject: { id: 'user1', role: 'admin', tenant_id: 'tenant1' },
        action: { action: 'view' },
        resource: { resource_type: 'order', tenant_id: 'tenant1' },
        environment: { business_hours: true }
      };

      const result = await abacEngine.evaluate(context);
      
      expect(result.decision).toBe('DENY');
      expect(result.appliedPolicies).toHaveLength(1);
      expect(result.appliedPolicies[0].matched).toBe(true);
    });

    test('should handle tenant isolation policy', async () => {
      const tenantIsolationPolicy = {
        policyId: 'TENANT_ISOLATION',
        name: 'Tenant Isolation Policy',
        effect: 'DENY',
        priority: 1000,
        subjectAttributes: [],
        actionAttributes: [],
        resourceAttributes: [
          { name: 'tenant_id', operator: 'not_equals', value: '${subject.tenant_id}' }
        ],
        environmentAttributes: []
      };

      ABACPolicy.find = jest.fn().mockResolvedValue([tenantIsolationPolicy]);
      ABACLog.createLog = jest.fn().mockResolvedValue({});

      // Test case 1: Same tenant - should allow
      let context = {
        subject: { id: 'user1', role: 'admin', tenant_id: 'tenant1' },
        action: { action: 'view' },
        resource: { resource_type: 'order', tenant_id: 'tenant1' },
        environment: { business_hours: true }
      };

      let result = await abacEngine.evaluate(context);
      expect(result.decision).toBe('ALLOW');

      // Test case 2: Different tenant - should deny
      context.resource.tenant_id = 'tenant2';
      result = await abacEngine.evaluate(context);
      expect(result.decision).toBe('DENY');
    });

    test('should handle financial approval limits', async () => {
      const financialLimitsPolicy = {
        policyId: 'FINANCIAL_APPROVAL_LIMITS',
        name: 'Financial Approval Limits',
        effect: 'DENY',
        priority: 800,
        subjectAttributes: [],
        actionAttributes: [
          { name: 'action', operator: 'equals', value: 'approve' }
        ],
        resourceAttributes: [
          { name: 'amount', operator: 'greater_than', value: '${subject.approval_limit}' }
        ],
        environmentAttributes: []
      };

      ABACPolicy.find = jest.fn().mockResolvedValue([financialLimitsPolicy]);
      ABACLog.createLog = jest.fn().mockResolvedValue({});

      // Test case 1: Amount within limit - should allow
      let context = {
        subject: { id: 'user1', role: 'finance', approval_limit: 1000 },
        action: { action: 'approve' },
        resource: { resource_type: 'refund', amount: 500 },
        environment: { business_hours: true }
      };

      let result = await abacEngine.evaluate(context);
      expect(result.decision).toBe('ALLOW');

      // Test case 2: Amount exceeds limit - should deny
      context.resource.amount = 1500;
      result = await abacEngine.evaluate(context);
      expect(result.decision).toBe('DENY');
    });

    test('should handle read-only enforcement', async () => {
      const readOnlyPolicy = {
        policyId: 'READ_ONLY_ENFORCEMENT',
        name: 'Read-Only User Enforcement',
        effect: 'DENY',
        priority: 900,
        subjectAttributes: [
          { name: 'is_read_only', operator: 'equals', value: true }
        ],
        actionAttributes: [
          { name: 'action', operator: 'in', value: ['create', 'update', 'delete', 'approve'] }
        ],
        resourceAttributes: [],
        environmentAttributes: []
      };

      ABACPolicy.find = jest.fn().mockResolvedValue([readOnlyPolicy]);
      ABACLog.createLog = jest.fn().mockResolvedValue({});

      // Test case 1: Read-only user viewing - should allow
      let context = {
        subject: { id: 'user1', role: 'auditor', is_read_only: true },
        action: { action: 'view' },
        resource: { resource_type: 'order' },
        environment: { business_hours: true }
      };

      let result = await abacEngine.evaluate(context);
      expect(result.decision).toBe('ALLOW');

      // Test case 2: Read-only user creating - should deny
      context.action.action = 'create';
      result = await abacEngine.evaluate(context);
      expect(result.decision).toBe('DENY');
    });

    test('should handle business hours restrictions', async () => {
      const businessHoursPolicy = {
        policyId: 'BUSINESS_HOURS_PAYOUTS',
        name: 'Business Hours Payout Restriction',
        effect: 'DENY',
        priority: 700,
        subjectAttributes: [],
        actionAttributes: [
          { name: 'action', operator: 'equals', value: 'approve' }
        ],
        resourceAttributes: [
          { name: 'resource_type', operator: 'equals', value: 'payout' }
        ],
        environmentAttributes: [
          { name: 'business_hours', operator: 'equals', value: false }
        ]
      };

      ABACPolicy.find = jest.fn().mockResolvedValue([businessHoursPolicy]);
      ABACLog.createLog = jest.fn().mockResolvedValue({});

      // Test case 1: During business hours - should allow
      let context = {
        subject: { id: 'user1', role: 'finance' },
        action: { action: 'approve' },
        resource: { resource_type: 'payout', amount: 1000 },
        environment: { business_hours: true }
      };

      let result = await abacEngine.evaluate(context);
      expect(result.decision).toBe('ALLOW');

      // Test case 2: Outside business hours - should deny
      context.environment.business_hours = false;
      result = await abacEngine.evaluate(context);
      expect(result.decision).toBe('DENY');
    });
  });

  describe('Attribute Evaluation', () => {
    test('should correctly evaluate equals operator', () => {
      const attribute = { name: 'role', operator: 'equals', value: 'admin' };
      const contextValues = { role: 'admin' };
      
      const result = abacEngine.evaluateAttribute(attribute, contextValues);
      expect(result.matched).toBe(true);
    });

    test('should correctly evaluate not_equals operator', () => {
      const attribute = { name: 'role', operator: 'not_equals', value: 'admin' };
      const contextValues = { role: 'user' };
      
      const result = abacEngine.evaluateAttribute(attribute, contextValues);
      expect(result.matched).toBe(true);
    });

    test('should correctly evaluate in operator', () => {
      const attribute = { name: 'action', operator: 'in', value: ['create', 'update', 'delete'] };
      const contextValues = { action: 'create' };
      
      const result = abacEngine.evaluateAttribute(attribute, contextValues);
      expect(result.matched).toBe(true);
    });

    test('should correctly evaluate greater_than operator', () => {
      const attribute = { name: 'amount', operator: 'greater_than', value: 100 };
      const contextValues = { amount: 150 };
      
      const result = abacEngine.evaluateAttribute(attribute, contextValues);
      expect(result.matched).toBe(true);
    });

    test('should resolve template variables', () => {
      const value = '${subject.tenant_id}';
      const context = { subject: { tenant_id: 'tenant123' } };
      
      const resolved = abacEngine.resolveValue(value, context);
      expect(resolved).toBe('tenant123');
    });
  });

  describe('Policy Cache', () => {
    test('should cache policies for performance', async () => {
      const mockPolicies = [
        { policyId: 'TEST1', scope: 'PLATFORM', isActive: true },
        { policyId: 'TEST2', scope: 'TENANT', isActive: true }
      ];

      ABACPolicy.find = jest.fn().mockResolvedValue(mockPolicies);

      const context = {
        subject: { role: 'admin' },
        action: { action: 'view' },
        resource: { resource_type: 'test' },
        environment: { business_hours: true }
      };

      // First call should hit database
      await abacEngine.loadPolicies(context);
      expect(ABACPolicy.find).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await abacEngine.loadPolicies(context);
      expect(ABACPolicy.find).toHaveBeenCalledTimes(1);
    });

    test('should refresh cache when timeout expires', async () => {
      const mockPolicies = [
        { policyId: 'TEST1', scope: 'PLATFORM', isActive: true }
      ];

      ABACPolicy.find = jest.fn().mockResolvedValue(mockPolicies);

      // Set cache timeout to 0 to force refresh
      abacEngine.cacheTimeout = 0;
      abacEngine.lastCacheUpdate = Date.now() - 1000;

      const context = {
        subject: { role: 'admin' },
        action: { action: 'view' },
        resource: { resource_type: 'test' },
        environment: { business_hours: true }
      };

      await abacEngine.loadPolicies(context);
      expect(ABACPolicy.find).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should default to DENY on evaluation error', async () => {
      // Mock database error
      ABACPolicy.find = jest.fn().mockRejectedValue(new Error('Database error'));
      ABACLog.createLog = jest.fn().mockResolvedValue({});

      const context = {
        subject: { id: 'user1', role: 'admin' },
        action: { action: 'view' },
        resource: { resource_type: 'order' },
        environment: { business_hours: true }
      };

      const result = await abacEngine.evaluate(context);
      
      expect(result.decision).toBe('DENY');
      expect(result.error).toBeDefined();
    });

    test('should handle malformed policy gracefully', async () => {
      const malformedPolicy = {
        policyId: 'MALFORMED',
        name: 'Malformed Policy',
        effect: 'DENY',
        priority: 100,
        subjectAttributes: [
          { name: 'role', operator: 'invalid_operator', value: 'admin' }
        ],
        actionAttributes: [],
        resourceAttributes: [],
        environmentAttributes: []
      };

      ABACPolicy.find = jest.fn().mockResolvedValue([malformedPolicy]);
      ABACLog.createLog = jest.fn().mockResolvedValue({});

      const context = {
        subject: { id: 'user1', role: 'admin' },
        action: { action: 'view' },
        resource: { resource_type: 'order' },
        environment: { business_hours: true }
      };

      const result = await abacEngine.evaluate(context);
      
      // Should not crash, policy should not match due to invalid operator
      expect(result.decision).toBe('ALLOW');
      expect(result.appliedPolicies[0].matched).toBe(false);
    });
  });
});

module.exports = {};