const ABACPolicy = require('../models/ABACPolicy');
const ABACLog = require('../models/ABACLog');

class ABACEngine {
  constructor() {
    this.policyCache = new Map();
    this.lastCacheUpdate = null;
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Main ABAC evaluation method
   * @param {Object} context - Evaluation context
   * @param {Object} context.subject - Subject attributes (user)
   * @param {Object} context.action - Action attributes
   * @param {Object} context.resource - Resource attributes
   * @param {Object} context.environment - Environment attributes
   * @returns {Promise<Object>} Decision result
   */
  async evaluate(context) {
    const startTime = Date.now();

    try {
      // 1. Load applicable policies
      const policies = await this.loadPolicies(context);

      // 2. Evaluate each policy
      const evaluationResults = [];
      let finalDecision = 'ALLOW'; // Default to ALLOW

      for (const policy of policies) {
        const result = await this.evaluatePolicy(policy, context);
        evaluationResults.push(result);

        // If any DENY policy matches, final decision is DENY
        if (result.matched && policy.effect === 'DENY') {
          finalDecision = 'DENY';
          break; // Stop on first DENY
        }
      }

      const evaluationTime = Date.now() - startTime;

      // 3. Create decision result
      const decision = {
        decision: finalDecision,
        evaluationTime,
        appliedPolicies: evaluationResults,
        context
      };

      // 4. Log the decision
      await this.logDecision(decision);

      // 5. Update policy statistics
      await this.updatePolicyStats(evaluationResults, finalDecision);

      return decision;

    } catch (error) {
      console.error('ABAC Evaluation Error:', error);

      // Log error and default to DENY for security
      await this.logError(context, error, Date.now() - startTime);

      return {
        decision: 'DENY',
        error: error.message,
        evaluationTime: Date.now() - startTime,
        appliedPolicies: [],
        context
      };
    }
  }

  /**
   * Load applicable policies for the context
   */
  async loadPolicies(context) {
    // Check cache first
    if (this.shouldRefreshCache()) {
      await this.refreshPolicyCache();
    }

    const scope = this.determineScope(context);
    const cacheKey = `${scope}_policies`;

    if (this.policyCache.has(cacheKey)) {
      return this.policyCache.get(cacheKey);
    }

    // Load from database
    const policies = await ABACPolicy.find({
      scope,
      isActive: true
    }).sort({ priority: -1 }); // Higher priority first

    this.policyCache.set(cacheKey, policies);
    return policies;
  }

  /**
   * Evaluate a single policy against context
   */
  async evaluatePolicy(policy, context) {
    try {
      const result = {
        policyId: policy.policyId,
        policyName: policy.name,
        effect: policy.effect,
        matched: false,
        reason: ''
      };

      // Check all attribute conditions
      const subjectMatch = this.evaluateAttributes(policy.subjectAttributes, context.subject);
      const actionMatch = this.evaluateAttributes(policy.actionAttributes, context.action);
      const resourceMatch = this.evaluateAttributes(policy.resourceAttributes, context.resource);
      const environmentMatch = this.evaluateAttributes(policy.environmentAttributes, context.environment);

      // Policy matches if ALL attribute groups match (AND logic)
      result.matched = subjectMatch.matched && actionMatch.matched && resourceMatch.matched && environmentMatch.matched;

      if (!result.matched) {
        const failedChecks = [];
        if (!subjectMatch.matched) failedChecks.push(`Subject: ${subjectMatch.reason}`);
        if (!actionMatch.matched) failedChecks.push(`Action: ${actionMatch.reason}`);
        if (!resourceMatch.matched) failedChecks.push(`Resource: ${resourceMatch.reason}`);
        if (!environmentMatch.matched) failedChecks.push(`Environment: ${environmentMatch.reason}`);

        result.reason = `Policy conditions not met: ${failedChecks.join(', ')}`;
      } else {
        result.reason = `All policy conditions matched`;
      }

      return result;

    } catch (error) {
      console.error(`Error evaluating policy ${policy.policyId}:`, error);
      return {
        policyId: policy.policyId,
        policyName: policy.name,
        effect: policy.effect,
        matched: false,
        reason: `Evaluation error: ${error.message}`
      };
    }
  }

  /**
   * Evaluate attribute conditions
   */
  evaluateAttributes(attributes, contextValues) {
    if (!attributes || attributes.length === 0) {
      return { matched: true, reason: 'No conditions to check' };
    }

    for (const attr of attributes) {
      const result = this.evaluateAttribute(attr, contextValues);
      if (!result.matched) {
        return result;
      }
    }

    return { matched: true, reason: 'All attribute conditions matched' };
  }

  /**
   * Evaluate single attribute condition
   */
  evaluateAttribute(attribute, contextValues) {
    const { name, operator, value } = attribute;
    const contextValue = this.resolveValue(contextValues[name], contextValues);
    const expectedValue = this.resolveValue(value, contextValues);

    let matched = false;
    let reason = '';

    try {
      switch (operator) {
        case 'equals':
          matched = contextValue === expectedValue;
          reason = `${name} (${contextValue}) ${matched ? '==' : '!='} ${expectedValue}`;
          break;

        case 'not_equals':
          matched = contextValue !== expectedValue;
          reason = `${name} (${contextValue}) ${matched ? '!=' : '=='} ${expectedValue}`;
          break;

        case 'in':
          matched = Array.isArray(expectedValue) && expectedValue.includes(contextValue);
          reason = `${name} (${contextValue}) ${matched ? 'in' : 'not in'} [${expectedValue}]`;
          break;

        case 'not_in':
          matched = Array.isArray(expectedValue) && !expectedValue.includes(contextValue);
          reason = `${name} (${contextValue}) ${matched ? 'not in' : 'in'} [${expectedValue}]`;
          break;

        case 'greater_than':
          matched = Number(contextValue) > Number(expectedValue);
          reason = `${name} (${contextValue}) ${matched ? '>' : '<='} ${expectedValue}`;
          break;

        case 'less_than':
          matched = Number(contextValue) < Number(expectedValue);
          reason = `${name} (${contextValue}) ${matched ? '<' : '>='} ${expectedValue}`;
          break;

        case 'contains':
          matched = String(contextValue).includes(String(expectedValue));
          reason = `${name} (${contextValue}) ${matched ? 'contains' : 'does not contain'} ${expectedValue}`;
          break;

        case 'regex':
          const regex = new RegExp(expectedValue);
          matched = regex.test(String(contextValue));
          reason = `${name} (${contextValue}) ${matched ? 'matches' : 'does not match'} /${expectedValue}/`;
          break;

        default:
          matched = false;
          reason = `Unknown operator: ${operator}`;
      }
    } catch (error) {
      matched = false;
      reason = `Evaluation error: ${error.message}`;
    }

    return { matched, reason };
  }

  /**
   * Resolve dynamic values (e.g., ${user.tenant_id})
   */
  resolveValue(value, context) {
    if (typeof value !== 'string') {
      return value;
    }

    // Handle template variables like ${user.tenant_id}
    const templateRegex = /\$\{([^}]+)\}/g;
    return value.replace(templateRegex, (match, path) => {
      const keys = path.split('.');
      let result = context;

      for (const key of keys) {
        if (result && typeof result === 'object') {
          result = result[key];
        } else {
          return match; // Return original if path not found
        }
      }

      return result !== undefined ? result : match;
    });
  }

  /**
   * Determine policy scope based on context
   */
  determineScope(context) {
    // Platform scope for platform-level resources
    if (context.resource?.scope === 'PLATFORM' ||
      context.action?.scope === 'PLATFORM' ||
      ['SuperAdmin', 'FinanceAdmin', 'PlatformSupport'].includes(context.subject?.platform_role)) {
      return 'PLATFORM';
    }

    // Tenant scope for tenant-level resources
    return 'TENANT';
  }

  /**
   * Check if policy cache should be refreshed
   */
  shouldRefreshCache() {
    if (!this.lastCacheUpdate) {
      return true;
    }

    return Date.now() - this.lastCacheUpdate > this.cacheTimeout;
  }

  /**
   * Refresh policy cache
   */
  async refreshPolicyCache() {
    try {
      this.policyCache.clear();
      this.lastCacheUpdate = Date.now();
      console.log('🔄 ABAC Policy cache refreshed');
    } catch (error) {
      console.error('Error refreshing ABAC policy cache:', error);
    }
  }

  /**
   * Log ABAC decision
   */
  async logDecision(decision) {
    try {
      const mongoose = require('mongoose');
      const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

      // Prepare log data with valid ObjectIds only
      const logData = {
        userId: isValidObjectId(decision.context.subject.id) ? decision.context.subject.id : decision.context.subject._id,
        userRole: decision.context.subject.role,
        userTenantId: isValidObjectId(decision.context.subject.tenant_id) ? decision.context.subject.tenant_id : null,
        action: decision.context.action.action,
        resourceType: decision.context.resource.resource_type,
        resourceId: decision.context.resource.id,
        decision: decision.decision,
        appliedPolicies: decision.appliedPolicies,
        evaluationTime: decision.evaluationTime,
        subjectAttributes: decision.context.subject,
        actionAttributes: decision.context.action,
        resourceAttributes: decision.context.resource,
        environmentAttributes: decision.context.environment,
        ipAddress: decision.context.environment.ip_address,
        userAgent: decision.context.environment.user_agent,
        endpoint: decision.context.environment.endpoint,
        method: decision.context.environment.method
      };

      // If IDs were invalid strings, they are retained in subjectAttributes but not in the indexed fields to prevent CastError
      // We could also generate a dummy ID if absolutely required, but null (if schema allows) or omitting is safer if not required.
      // Schema says userId is required. So we must provide a valid one or use a dummy.

      if (!isValidObjectId(logData.userId)) {
        // If it's a test/mock user with invalid ID, we generate a random one for logging purposes 
        // OR we simply catch the error. But better to having it succeed.
        // Let's rely on the try-catch for now, but let's actually fix the schema to be more permissive 
        // OR fix the input. 

        // Actually, the user input "user-123" suggests they are using the UI to test.
        // If we want to support that, we should probably just generate a temporary ID if it's invalid.
        logData.userId = new mongoose.Types.ObjectId('000000000000000000000000');
      }

      if (logData.userTenantId && !isValidObjectId(logData.userTenantId)) {
        logData.userTenantId = null;
      }

      await ABACLog.createLog(logData);
    } catch (error) {
      console.error('Error logging ABAC decision:', error);
    }
  }

  /**
   * Log ABAC error
   */
  async logError(context, error, evaluationTime) {
    try {
      await ABACLog.createLog({
        userId: context.subject?.id,
        userRole: context.subject?.role,
        userTenantId: context.subject?.tenant_id,
        action: context.action?.action || 'unknown',
        resourceType: context.resource?.resource_type || 'unknown',
        resourceId: context.resource?.id,
        decision: 'DENY',
        appliedPolicies: [],
        evaluationTime,
        subjectAttributes: context.subject || {},
        actionAttributes: context.action || {},
        resourceAttributes: context.resource || {},
        environmentAttributes: context.environment || {},
        error: {
          message: error.message,
          stack: error.stack
        }
      });
    } catch (logError) {
      console.error('Error logging ABAC error:', logError);
    }
  }

  /**
   * Update policy statistics
   */
  async updatePolicyStats(evaluationResults, finalDecision) {
    try {
      for (const result of evaluationResults) {
        if (result.matched) {
          const policy = await ABACPolicy.findOne({ policyId: result.policyId });
          if (policy) {
            await policy.incrementEvaluation(finalDecision);
          }
        }
      }
    } catch (error) {
      console.error('Error updating policy statistics:', error);
    }
  }

  /**
   * Initialize core policies
   */
  async initializeCorePolicy(policyId, createdBy) {
    try {
      const existingPolicy = await ABACPolicy.findOne({ policyId });
      if (existingPolicy) {
        return existingPolicy;
      }

      const corePolicy = ABACPolicy.getCorePolicy(policyId);
      if (!corePolicy) {
        throw new Error(`Core policy ${policyId} not found`);
      }

      const policy = new ABACPolicy({
        ...corePolicy,
        createdBy,
        subjectAttributes: corePolicy.subjectAttributes || [],
        actionAttributes: corePolicy.actionAttributes || [],
        resourceAttributes: corePolicy.resourceAttributes || [],
        environmentAttributes: corePolicy.environmentAttributes || []
      });

      await policy.save();
      console.log(`✅ Core ABAC policy ${policyId} initialized`);
      return policy;
    } catch (error) {
      console.error(`Error initializing core policy ${policyId}:`, error);
      throw error;
    }
  }
}

// Singleton instance
const abacEngine = new ABACEngine();

module.exports = abacEngine;