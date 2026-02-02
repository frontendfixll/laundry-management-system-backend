/**
 * Enhanced RBAC Middleware
 * Supports the comprehensive roles system from droles.md
 */

const SuperAdmin = require('../models/SuperAdmin');
const SuperAdminRole = require('../models/SuperAdminRole');
const User = require('../models/User');
const Role = require('../models/Role');
const { SECURITY_RULES } = require('../config/roleDefinitions');

/**
 * Enhanced permission checker for SuperAdmins
 * @param {string} module - Module name (e.g., 'platform_settings', 'tenant_crud')
 * @param {string} action - Action name (e.g., 'view', 'create', 'update', 'delete', 'export')
 * @returns {Function} Express middleware function
 */
const requirePlatformPermission = (module, action) => {
  return async (req, res, next) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.user._id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      // Fetch SuperAdmin with roles populated
      const superadmin = await SuperAdmin.findById(req.user._id)
        .populate('roles');
      
      if (!superadmin || !superadmin.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Access denied - SuperAdmin account inactive'
        });
      }
      
      // Check if has permission across all roles
      let hasPermission = false;
      
      if (superadmin.roles && superadmin.roles.length > 0) {
        // Check new RBAC system
        for (const role of superadmin.roles) {
          if (role.isActive && role.hasPermission(module, action)) {
            hasPermission = true;
            break;
          }
        }
      } else {
        // Fallback to legacy permissions for backward compatibility
        const legacyModuleMap = {
          'platform_settings': 'settings',
          'tenant_crud': 'admins',
          'subscription_plans': 'billing',
          'payments_revenue': 'finances',
          'audit_logs': 'audit'
        };
        
        const legacyModule = legacyModuleMap[module];
        if (legacyModule && superadmin.permissions && superadmin.permissions[legacyModule]) {
          hasPermission = true;
        }
      }
      
      if (!hasPermission) {
        // Log permission denial for audit
        console.warn(`🚫 Permission denied: ${superadmin.email} attempted ${module}.${action}`);
        
        return res.status(403).json({
          success: false,
          message: `Permission denied: ${module}.${action}`,
          required: { module, action },
          userRoles: superadmin.roles?.map(r => r.slug) || []
        });
      }
      
      // Permission granted, add to request for logging
      req.grantedPermission = `${module}.${action}`;
      req.userRoles = superadmin.roles?.map(r => r.slug) || ['legacy'];
      
      next();
    } catch (error) {
      console.error('Platform permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

/**
 * Enhanced permission checker for Tenant users
 * @param {string} module - Module name (e.g., 'orders_view', 'staff_management')
 * @param {string} action - Action name (e.g., 'view', 'create', 'edit', 'delete')
 * @returns {Function} Express middleware function
 */
const requireTenantPermission = (module, action) => {
  return async (req, res, next) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.user._id) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      // Fetch User with role populated
      const user = await User.findById(req.user._id)
        .populate('roleId')
        .populate('tenancy');
      
      if (!user || !user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Access denied - User account inactive'
        });
      }
      
      // Ensure user has tenancy context
      if (!user.tenancy) {
        return res.status(403).json({
          success: false,
          message: 'Access denied - No tenancy context'
        });
      }
      
      // Check if has permission
      let hasPermission = false;
      
      if (user.roleId && user.roleId.isActive) {
        // Check new RBAC system
        hasPermission = user.roleId.hasPermission(module, action);
      } else {
        // Fallback to legacy permissions for backward compatibility
        if (user.permissions && user.permissions[module] && user.permissions[module][action]) {
          hasPermission = true;
        }
      }
      
      if (!hasPermission) {
        // Log permission denial for audit
        console.warn(`🚫 Tenant permission denied: ${user.email} attempted ${module}.${action} in tenancy ${user.tenancy._id}`);
        
        return res.status(403).json({
          success: false,
          message: `Permission denied: ${module}.${action}`,
          required: { module, action },
          userRole: user.roleId?.slug || user.role,
          tenancy: user.tenancy._id
        });
      }
      
      // Permission granted, add to request for logging
      req.grantedPermission = `${module}.${action}`;
      req.userRole = user.roleId?.slug || user.role;
      req.tenancyId = user.tenancy._id;
      
      next();
    } catch (error) {
      console.error('Tenant permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

/**
 * Check if user has any of the specified permissions (OR logic)
 * @param {Array} permissions - Array of {module, action} objects
 * @param {string} userType - 'platform' or 'tenant'
 * @returns {Function} Express middleware function
 */
const requireAnyPermission = (permissions, userType = 'tenant') => {
  return async (req, res, next) => {
    try {
      let hasAnyPermission = false;
      const checkedPermissions = [];
      
      for (const { module, action } of permissions) {
        try {
          // Create a mock response to capture the result
          const mockRes = {
            status: () => ({ json: () => {} }),
            json: () => {}
          };
          
          let mockNext = () => { hasAnyPermission = true; };
          
          // Use appropriate permission checker
          const checker = userType === 'platform' 
            ? requirePlatformPermission(module, action)
            : requireTenantPermission(module, action);
          
          await checker(req, mockRes, mockNext);
          
          if (hasAnyPermission) {
            checkedPermissions.push(`${module}.${action}`);
            break;
          }
        } catch (error) {
          // Continue checking other permissions
          continue;
        }
      }
      
      if (!hasAnyPermission) {
        return res.status(403).json({
          success: false,
          message: 'Permission denied - insufficient privileges',
          required: permissions.map(p => `${p.module}.${p.action}`),
          checked: checkedPermissions
        });
      }
      
      next();
    } catch (error) {
      console.error('Any permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

/**
 * Check if user has all of the specified permissions (AND logic)
 * @param {Array} permissions - Array of {module, action} objects
 * @param {string} userType - 'platform' or 'tenant'
 * @returns {Function} Express middleware function
 */
const requireAllPermissions = (permissions, userType = 'tenant') => {
  return async (req, res, next) => {
    try {
      const results = [];
      
      for (const { module, action } of permissions) {
        try {
          // Create a mock response to capture the result
          let hasPermission = false;
          const mockRes = {
            status: () => ({ json: () => {} }),
            json: () => {}
          };
          
          let mockNext = () => { hasPermission = true; };
          
          // Use appropriate permission checker
          const checker = userType === 'platform' 
            ? requirePlatformPermission(module, action)
            : requireTenantPermission(module, action);
          
          await checker(req, mockRes, mockNext);
          
          results.push({
            permission: `${module}.${action}`,
            granted: hasPermission
          });
          
          if (!hasPermission) {
            return res.status(403).json({
              success: false,
              message: 'Permission denied - missing required permissions',
              required: permissions.map(p => `${p.module}.${p.action}`),
              results
            });
          }
        } catch (error) {
          results.push({
            permission: `${module}.${action}`,
            granted: false,
            error: error.message
          });
          
          return res.status(403).json({
            success: false,
            message: 'Permission denied - permission check failed',
            required: permissions.map(p => `${p.module}.${p.action}`),
            results
          });
        }
      }
      
      next();
    } catch (error) {
      console.error('All permissions check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

/**
 * Enforce security rules from droles.md
 * @param {string} rule - Security rule name
 * @returns {Function} Express middleware function
 */
const enforceSecurityRule = (rule) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      
      switch (rule) {
        case 'FINANCIAL_SEPARATION':
          // Only finance roles can access financial actions
          const financialActions = SECURITY_RULES.FINANCE_ONLY_ACTIONS;
          const requestedAction = req.grantedPermission;
          
          if (financialActions.some(action => requestedAction?.includes(action))) {
            const userRole = req.userRole || req.userRoles?.[0];
            const isFinanceRole = ['platform_finance', 'tenant_finance_manager'].includes(userRole);
            
            if (!isFinanceRole) {
              return res.status(403).json({
                success: false,
                message: 'Financial operations restricted to finance roles only',
                rule: 'FINANCIAL_SEPARATION'
              });
            }
          }
          break;
          
        case 'RULE_ENGINE_ACCESS':
          // Only specific roles can access rule engine
          const allowedRoles = SECURITY_RULES.RULE_ENGINE_ACCESS;
          const userRole = req.userRole || req.userRoles?.[0];
          
          if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
              success: false,
              message: 'Rule engine access restricted to authorized roles only',
              rule: 'RULE_ENGINE_ACCESS',
              allowedRoles
            });
          }
          break;
          
        case 'READ_ONLY_ENFORCEMENT':
          // Read-only roles cannot perform write operations
          const readOnlyRoles = SECURITY_RULES.READ_ONLY_ROLES;
          const userRole2 = req.userRole || req.userRoles?.[0];
          const isWriteOperation = ['create', 'update', 'delete'].some(action => 
            req.grantedPermission?.includes(action)
          );
          
          if (readOnlyRoles.includes(userRole2) && isWriteOperation) {
            return res.status(403).json({
              success: false,
              message: 'Write operations not allowed for read-only roles',
              rule: 'READ_ONLY_ENFORCEMENT'
            });
          }
          break;
          
        default:
          console.warn(`Unknown security rule: ${rule}`);
      }
      
      next();
    } catch (error) {
      console.error('Security rule enforcement error:', error);
      return res.status(500).json({
        success: false,
        message: 'Security rule enforcement failed'
      });
    }
  };
};

/**
 * Attach user's effective permissions to request object
 * @returns {Function} Express middleware function
 */
const attachEffectivePermissions = () => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      let effectivePermissions = [];
      
      if (user.role === 'superadmin' || user.role === 'sales_admin') {
        // Platform user
        const superadmin = await SuperAdmin.findById(user._id).populate('roles');
        
        if (superadmin && superadmin.roles) {
          superadmin.roles.forEach(role => {
            if (role.isActive) {
              effectivePermissions = effectivePermissions.concat(role.getEnabledPermissions());
            }
          });
        }
      } else {
        // Tenant user
        const tenantUser = await User.findById(user._id).populate('roleId');
        
        if (tenantUser && tenantUser.roleId && tenantUser.roleId.isActive) {
          effectivePermissions = tenantUser.roleId.getEnabledPermissions();
        }
      }
      
      // Remove duplicates and attach to request
      req.effectivePermissions = [...new Set(effectivePermissions)];
      
      next();
    } catch (error) {
      console.error('Attach permissions error:', error);
      // Don't fail the request, just continue without permissions
      req.effectivePermissions = [];
      next();
    }
  };
};

module.exports = {
  requirePlatformPermission,
  requireTenantPermission,
  requireAnyPermission,
  requireAllPermissions,
  enforceSecurityRule,
  attachEffectivePermissions
};