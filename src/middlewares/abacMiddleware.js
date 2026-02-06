const abacEngine = require('../services/abacEngine');

/**
 * ABAC Middleware - Runs after RBAC to provide fine-grained access control
 * @param {Object} options - ABAC configuration options
 * @param {string} options.action - Action being performed
 * @param {string} options.resourceType - Type of resource being accessed
 * @param {Function} options.resourceExtractor - Function to extract resource attributes from request
 * @param {boolean} options.skipOnRBACFailure - Skip ABAC if RBAC already failed
 * @returns {Function} Express middleware function
 */
const requireABACPermission = (options = {}) => {
  return async (req, res, next) => {
    try {
      // Skip ABAC if RBAC already failed (unless explicitly configured otherwise)
      if (options.skipOnRBACFailure && res.headersSent) {
        return;
      }

      // Extract user information (should be set by auth middleware)
      const user = req.user || req.admin;
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required for ABAC evaluation'
        });
      }

      // Build ABAC context
      const context = await buildABACContext(req, user, options);
      
      // Evaluate ABAC policies
      const decision = await abacEngine.evaluate(context);
      
      // Handle decision
      if (decision.decision === 'ALLOW') {
        // Add ABAC info to request for logging
        req.abacDecision = decision;
        console.log(`🔓 ABAC: Access granted for ${user.email || user.name} on ${options.action || 'unknown'} ${options.resourceType || 'resource'}`);
        return next();
      } else {
        // Access denied
        console.log(`🔒 ABAC: Access DENIED for ${user.email || user.name} on ${options.action || 'unknown'} ${options.resourceType || 'resource'}`);
        
        // Find the specific policy that denied access
        const denyingPolicy = decision.appliedPolicies.find(p => p.matched && p.effect === 'DENY');
        const reason = denyingPolicy ? denyingPolicy.reason : 'Access denied by ABAC policies';
        
        return res.status(403).json({
          success: false,
          message: 'Access denied by ABAC policy',
          reason,
          policyViolation: denyingPolicy ? {
            policyId: denyingPolicy.policyId,
            policyName: denyingPolicy.policyName
          } : null,
          evaluationTime: decision.evaluationTime
        });
      }
      
    } catch (error) {
      console.error('ABAC Middleware Error:', error);
      
      // Default to DENY on error for security
      return res.status(500).json({
        success: false,
        message: 'ABAC evaluation failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  };
};

/**
 * Build ABAC evaluation context from request
 */
async function buildABACContext(req, user, options) {
  // Subject attributes (user information)
  const subject = {
    id: user._id?.toString() || user.id,
    role: user.role,
    platform_role: user.role, // For SuperAdmin users
    tenant_id: user.tenancy?.toString() || user.tenant_id?.toString(),
    is_active: user.isActive,
    is_read_only: user.isReadOnly || false,
    approval_limit: user.approvalLimit || 0,
    department: user.department,
    email: user.email,
    permissions: user.permissions || {}
  };

  // Action attributes
  const action = {
    action: options.action || extractActionFromMethod(req.method),
    method: req.method,
    scope: options.scope || 'TENANT'
  };

  // Resource attributes
  let resource = {
    resource_type: options.resourceType || 'unknown',
    id: req.params.id,
    scope: options.scope || 'TENANT'
  };

  // Use custom resource extractor if provided
  if (options.resourceExtractor && typeof options.resourceExtractor === 'function') {
    try {
      const customResource = await options.resourceExtractor(req, user);
      resource = { ...resource, ...customResource };
    } catch (error) {
      console.error('Error in custom resource extractor:', error);
    }
  }

  // Environment attributes
  const environment = {
    current_time: new Date(),
    business_hours: isBusinessHours(),
    incident_mode: process.env.INCIDENT_MODE === 'true',
    ip_address: req.ip || req.connection.remoteAddress,
    user_agent: req.get('User-Agent'),
    endpoint: req.originalUrl,
    method: req.method,
    request_frequency: await getRequestFrequency(user._id || user.id),
    network_trust: isNetworkTrusted(req.ip)
  };

  return { subject, action, resource, environment };
}

/**
 * Extract action from HTTP method
 */
function extractActionFromMethod(method) {
  const methodMap = {
    'GET': 'view',
    'POST': 'create',
    'PUT': 'update',
    'PATCH': 'update',
    'DELETE': 'delete'
  };
  
  return methodMap[method] || 'unknown';
}

/**
 * Check if current time is within business hours
 */
function isBusinessHours() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Business hours: Monday-Friday, 9 AM - 6 PM
  return day >= 1 && day <= 5 && hour >= 9 && hour < 18;
}

/**
 * Get request frequency for rate limiting checks
 */
async function getRequestFrequency(userId) {
  // Simple in-memory rate tracking (in production, use Redis)
  if (!global.requestCounts) {
    global.requestCounts = new Map();
  }
  
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute window
  const userKey = userId.toString();
  
  if (!global.requestCounts.has(userKey)) {
    global.requestCounts.set(userKey, []);
  }
  
  const requests = global.requestCounts.get(userKey);
  
  // Remove old requests outside the window
  const recentRequests = requests.filter(timestamp => now - timestamp < windowMs);
  
  // Add current request
  recentRequests.push(now);
  global.requestCounts.set(userKey, recentRequests);
  
  return recentRequests.length;
}

/**
 * Check if network is trusted
 */
function isNetworkTrusted(ip) {
  // Define trusted networks (internal IPs, VPN ranges, etc.)
  const trustedNetworks = [
    '127.0.0.1',
    '::1',
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16'
  ];
  
  // Simple check for localhost and private networks
  return ip === '127.0.0.1' || 
         ip === '::1' || 
         ip.startsWith('10.') || 
         ip.startsWith('192.168.') ||
         (ip.startsWith('172.') && parseInt(ip.split('.')[1]) >= 16 && parseInt(ip.split('.')[1]) <= 31);
}

/**
 * Tenant isolation ABAC middleware
 */
const requireTenantIsolation = (resourceExtractor) => {
  return requireABACPermission({
    action: 'access',
    resourceType: 'tenant_resource',
    resourceExtractor: async (req, user) => {
      let resourceTenantId = null;
      
      if (resourceExtractor && typeof resourceExtractor === 'function') {
        const extracted = await resourceExtractor(req);
        resourceTenantId = extracted.tenant_id;
      } else {
        // Default extraction from request body or params
        resourceTenantId = req.body?.tenancy || req.params?.tenantId || req.query?.tenantId;
      }
      
      return {
        tenant_id: resourceTenantId?.toString(),
        resource_type: 'tenant_resource'
      };
    }
  });
};

/**
 * Financial limits ABAC middleware
 */
const requireFinancialLimits = (amountExtractor) => {
  return requireABACPermission({
    action: 'approve',
    resourceType: 'financial_transaction',
    resourceExtractor: async (req, user) => {
      let amount = 0;
      
      if (amountExtractor && typeof amountExtractor === 'function') {
        amount = await amountExtractor(req);
      } else {
        // Default extraction from request body
        amount = req.body?.amount || req.body?.refund?.amount || 0;
      }
      
      return {
        amount: Number(amount),
        resource_type: 'financial_transaction'
      };
    }
  });
};

/**
 * Read-only enforcement ABAC middleware
 */
const requireWriteAccess = () => {
  return requireABACPermission({
    action: 'write',
    resourceType: 'any',
    resourceExtractor: async (req, user) => {
      return {
        resource_type: 'any',
        requires_write: true
      };
    }
  });
};

/**
 * Business hours restriction ABAC middleware
 */
const requireBusinessHours = (resourceType = 'time_sensitive_resource') => {
  return requireABACPermission({
    action: 'approve',
    resourceType,
    resourceExtractor: async (req, user) => {
      return {
        resource_type: resourceType,
        time_sensitive: true
      };
    }
  });
};

module.exports = {
  requireABACPermission,
  requireTenantIsolation,
  requireFinancialLimits,
  requireWriteAccess,
  requireBusinessHours
};