const SuperAdmin = require('../models/SuperAdmin');
const SuperAdminRole = require('../models/SuperAdminRole');

/**
 * Check if SuperAdmin has specific permission
 * @param {string} module - Module name (e.g., 'tenancies', 'superadmins')
 * @param {string} action - Action name (e.g., 'view', 'create', 'update', 'delete', 'export')
 * @returns {Function} Express middleware function
 */
const requireSuperAdminPermission = (module, action) => {
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
          message: 'Access denied'
        });
      }
      
      // Check if has permission
      const hasPermission = await superadmin.hasPermission(module, action);
      
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: `Permission denied: ${module}.${action}`,
          required: { module, action }
        });
      }
      
      // Permission granted, proceed
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

/**
 * Check if SuperAdmin has any of the specified permissions
 * @param {Array<{module: string, action: string}>} permissions - Array of permission objects
 * @returns {Function} Express middleware function
 */
const requireAnyPermission = (permissions) => {
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
          message: 'Access denied'
        });
      }
      
      // Check if has any of the specified permissions
      for (const { module, action } of permissions) {
        const hasPermission = await superadmin.hasPermission(module, action);
        if (hasPermission) {
          // Has at least one permission, allow access
          return next();
        }
      }
      
      // No permissions matched
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        required: permissions
      });
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

/**
 * Check if SuperAdmin has all of the specified permissions
 * @param {Array<{module: string, action: string}>} permissions - Array of permission objects
 * @returns {Function} Express middleware function
 */
const requireAllPermissions = (permissions) => {
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
          message: 'Access denied'
        });
      }
      
      // Check if has all of the specified permissions
      for (const { module, action } of permissions) {
        const hasPermission = await superadmin.hasPermission(module, action);
        if (!hasPermission) {
          // Missing at least one permission
          return res.status(403).json({
            success: false,
            message: `Permission denied: ${module}.${action}`,
            required: permissions
          });
        }
      }
      
      // Has all permissions, allow access
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

/**
 * Attach user's effective permissions to request object
 * Useful for conditional UI rendering or complex permission logic
 * @returns {Function} Express middleware function
 */
const attachPermissions = async (req, res, next) => {
  try {
    if (req.user && req.user._id) {
      const superadmin = await SuperAdmin.findById(req.user._id)
        .populate('roles');
      
      if (superadmin && superadmin.isActive) {
        req.userPermissions = await superadmin.getEffectivePermissions();
      }
    }
    next();
  } catch (error) {
    console.error('Attach permissions error:', error);
    next(); // Continue even if attachment fails
  }
};

module.exports = {
  requireSuperAdminPermission,
  requireAnyPermission,
  requireAllPermissions,
  attachPermissions
};
