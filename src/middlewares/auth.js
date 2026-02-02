const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SuperAdmin = require('../models/SuperAdmin');
const { verifyAccessToken, verifyToken } = require('../utils/jwt');
const { getTokenFromRequest } = require('../utils/cookieConfig');
const { LEGACY_ROLE_MAP } = require('../config/constants');

// Track failed login attempts
const failedAttempts = new Map();
const FAILED_ATTEMPT_LIMIT = 5;
const FAILED_ATTEMPT_WINDOW = 15 * 60 * 1000; // 15 minutes

// Helper function to track failed attempts
const trackFailedAttempt = async (identifier, userType = 'user') => {
  const key = `${userType}:${identifier}`;
  const now = Date.now();
  
  if (!failedAttempts.has(key)) {
    failedAttempts.set(key, []);
  }
  
  const attempts = failedAttempts.get(key);
  // Remove old attempts outside the window
  const recentAttempts = attempts.filter(time => now - time < FAILED_ATTEMPT_WINDOW);
  recentAttempts.push(now);
  failedAttempts.set(key, recentAttempts);
  
  // Send notification if threshold reached
  if (recentAttempts.length >= FAILED_ATTEMPT_LIMIT) {
    try {
      const NotificationService = require('../services/notificationService');
      
      // Find user to get their ID and tenancy
      let user = null;
      let tenancy = null;
      
      if (userType === 'user') {
        user = await User.findOne({ email: identifier }).select('_id tenancy');
        tenancy = user?.tenancy;
      } else if (userType === 'superadmin') {
        user = await SuperAdmin.findOne({ email: identifier }).select('_id');
      }
      
      if (user) {
        await NotificationService.notifyMultipleLoginAttempts(
          user._id, 
          recentAttempts.length, 
          tenancy
        );
        console.log(`🚨 Security alert sent for ${recentAttempts.length} failed attempts on ${identifier}`);
      }
    } catch (error) {
      console.error('Failed to send security notification:', error);
    }
  }
  
  return recentAttempts.length;
};

// Helper function to clear failed attempts on successful login
const clearFailedAttempts = (identifier, userType = 'user') => {
  const key = `${userType}:${identifier}`;
  failedAttempts.delete(key);
};

// Protect routes - require authentication (User model only)
const protect = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    try {
      const decoded = verifyAccessToken(token);
      
      // Get user from User model with roleId populated
      const user = await User.findById(decoded.userId)
        .select('-password')
        .populate('roleId', 'name slug permissions isActive color');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Token is valid but user no longer exists'
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'User account is deactivated'
        });
      }

      req.user = user;
      req.isSuperAdmin = false;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

// Protect routes - accepts both User and SuperAdmin tokens
const protectAny = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    try {
      const decoded = verifyToken(token);
      
      // Check if it's a superadmin token (has adminId and role=superadmin)
      if (decoded.adminId && decoded.role === 'superadmin') {
        const admin = await SuperAdmin.findById(decoded.adminId).select('-password');
        
        if (admin && admin.isActive) {
          req.user = admin;
          req.isSuperAdmin = true;
          return next();
        }
      }
      
      // Try as regular user (admin, staff, customer)
      if (decoded.userId) {
        const user = await User.findById(decoded.userId)
          .select('-password')
          .populate('roleId', 'name slug permissions isActive color');
        if (user && user.isActive) {
          req.user = user;
          req.isSuperAdmin = false;
          return next();
        }
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid token or user not found'
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

// Restrict to specific roles with backward compatibility
const restrictTo = (...roles) => {
  return (req, res, next) => {
    const userRole = req.user.role;
    
    // Debug logging
    console.log('🔍 restrictTo middleware:', {
      userRole,
      requiredRoles: roles,
      isSuperAdmin: req.isSuperAdmin,
      userId: req.user._id,
      userEmail: req.user.email
    });
    
    // SuperAdmin has access to everything
    if (req.isSuperAdmin) {
      console.log('✅ SuperAdmin access granted');
      return next();
    }
    
    // Map legacy roles to new roles for backward compatibility
    const normalizedRoles = roles.map(role => {
      if (LEGACY_ROLE_MAP && LEGACY_ROLE_MAP[role]) {
        console.warn(`[DEPRECATION] Role '${role}' is deprecated. Use 'admin' instead.`);
        return LEGACY_ROLE_MAP[role];
      }
      return role;
    });
    
    // Also add 'admin' if any legacy role is present
    if (roles.includes('center_admin') || roles.includes('branch_manager')) {
      if (!normalizedRoles.includes('admin')) {
        normalizedRoles.push('admin');
      }
    }
    
    console.log('🔍 Normalized roles:', normalizedRoles);
    
    // If superadmin is in allowed roles, allow it
    if (normalizedRoles.includes('superadmin') && req.isSuperAdmin) {
      console.log('✅ SuperAdmin role access granted');
      return next();
    }
    
    if (!normalizedRoles.includes(userRole)) {
      console.log('❌ Access denied:', { userRole, normalizedRoles });
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    }
    
    console.log('✅ Role access granted');
    next();
  };
};

// Check specific RBAC permission for admin/branch_admin users
const requirePermission = (module, action) => {
  return async (req, res, next) => {
    // SuperAdmin has all permissions
    if (req.isSuperAdmin) {
      return next();
    }
    
    // Only admin and branch_admin roles have RBAC permissions
    if (req.user.role !== 'admin' && req.user.role !== 'branch_admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    
    // If user has roleId, check permissions from Role model
    if (req.user.roleId) {
      try {
        const Role = require('../models/Role');
        const role = await Role.findById(req.user.roleId);
        
        if (role && role.isActive) {
          // Map 'edit' action to 'edit' in Role model (Role uses edit, User uses update)
          const roleAction = action === 'update' ? 'edit' : action;
          
          if (role.hasPermission(module, roleAction)) {
            return next();
          }
          
          return res.status(403).json({
            success: false,
            message: `Permission denied: ${module}.${action}`
          });
        }
      } catch (err) {
        console.error('Role permission check error:', err);
      }
    }
    
    // Fallback to user's direct permissions
    if (!req.user.hasPermission(module, action)) {
      return res.status(403).json({
        success: false,
        message: `Permission denied: ${module}.${action}`
      });
    }
    
    next();
  };
};

// Check if email is verified
const requireEmailVerification = (req, res, next) => {
  if (!req.user.isEmailVerified) {
    return res.status(403).json({
      success: false,
      message: 'Please verify your email address to access this resource',
      requiresEmailVerification: true
    });
  }
  next();
};

// Restrict branch_admin to only access their assigned branch data
const restrictToBranch = (req, res, next) => {
  // SuperAdmin and tenancy admin can access all branches
  if (req.isSuperAdmin || req.user.role === 'admin') {
    return next();
  }
  
  // Branch admin must have an assigned branch
  if (req.user.role === 'branch_admin') {
    if (!req.user.assignedBranch) {
      return res.status(403).json({
        success: false,
        message: 'Branch admin must be assigned to a branch'
      });
    }
    
    // Get branch ID from request (params, query, or body)
    const requestedBranchId = req.params.branchId || req.query.branchId || req.body.branchId;
    
    // If a specific branch is requested, verify it matches assigned branch
    if (requestedBranchId && requestedBranchId.toString() !== req.user.assignedBranch.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only access your assigned branch.'
      });
    }
    
    // Inject branch filter for queries
    req.branchFilter = { branch: req.user.assignedBranch };
    return next();
  }
  
  // Other roles don't have branch restrictions at this level
  next();
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);

    if (token) {
      try {
        const decoded = verifyAccessToken(token);
        const user = await User.findById(decoded.userId).select('-password');
        
        if (user && user.isActive) {
          req.user = user;
        }
      } catch (error) {
        // Token is invalid, but we continue without user
        console.log('Optional auth: Invalid token, continuing without user');
      }
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next();
  }
};

// Protect SuperAdmin routes - require SuperAdmin authentication only
const protectSuperAdmin = async (req, res, next) => {
  try {
    const { getSuperAdminTokenFromRequest } = require('../utils/cookieConfig');
    const token = getSuperAdminTokenFromRequest(req);

    console.log('🔐 SuperAdmin Auth - Token received:', token ? token.substring(0, 30) + '...' : 'NO TOKEN');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    try {
      const decoded = verifyToken(token);
      
      console.log('🔐 SuperAdmin Auth - Decoded token:', {
        adminId: decoded.adminId,
        email: decoded.email,
        role: decoded.role,
        sessionId: decoded.sessionId
      });
      
      // Check if it's a superadmin token
      if (!decoded.adminId || decoded.role !== 'superadmin') {
        console.log('❌ SuperAdmin Auth - Not a superadmin token');
        return res.status(403).json({
          success: false,
          message: 'SuperAdmin access required'
        });
      }
      
      const admin = await SuperAdmin.findById(decoded.adminId).select('-password');
      
      if (!admin) {
        console.log('❌ SuperAdmin Auth - Admin not found');
        return res.status(401).json({
          success: false,
          message: 'SuperAdmin not found'
        });
      }

      if (!admin.isActive) {
        console.log('❌ SuperAdmin Auth - Admin inactive');
        return res.status(401).json({
          success: false,
          message: 'SuperAdmin account is deactivated'
        });
      }

      console.log('✅ SuperAdmin Auth - Admin found:', {
        id: admin._id,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive
      });

      req.user = admin;
      req.isSuperAdmin = true;
      next();
    } catch (error) {
      console.log('❌ SuperAdmin Auth - Token verification failed:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
  } catch (error) {
    console.error('SuperAdmin auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

// Alias for protect middleware (for consistency with route naming)
const authenticateToken = protect;

// Require admin role
const requireAdmin = (req, res, next) => {
  if (req.isSuperAdmin) {
    return next();
  }
  
  if (req.user.role !== 'admin' && req.user.role !== 'branch_admin') {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  
  next();
};

// Require branch admin role (for branch-specific operations)
const requireBranchAdmin = (req, res, next) => {
  if (req.isSuperAdmin) {
    return next();
  }
  
  if (req.user.role !== 'admin' && req.user.role !== 'branch_admin') {
    return res.status(403).json({
      success: false,
      message: 'Branch admin access required'
    });
  }
  
  next();
};

// Require support role or SuperAdmin with Platform Support RBAC role
const requireSupport = (req, res, next) => {
  if (req.isSuperAdmin) {
    // For SuperAdmin users, check if they have Platform Support RBAC role
    if (req.user.roles && req.user.roles.length > 0) {
      const hasPlatformSupport = req.user.roles.some(role => 
        role.slug === 'platform-support' || role.name === 'Platform Support'
      );
      if (hasPlatformSupport) {
        return next();
      }
    }
    
    // Also allow legacy SuperAdmin access for backward compatibility
    if (req.user.role === 'superadmin') {
      return next();
    }
    
    return res.status(403).json({
      success: false,
      message: 'Access denied. Platform Support role required.'
    });
  }
  
  // For regular users, check support role
  if (req.user.role !== 'support') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Support role required.'
    });
  }
  
  next();
};

module.exports = {
  protect,
  protectAny,
  protectSuperAdmin,
  restrictTo,
  restrictToBranch,
  requirePermission,
  requireEmailVerification,
  optionalAuth,
  authenticateToken,
  requireAdmin,
  requireBranchAdmin,
  requireSupport,
  trackFailedAttempt,
  clearFailedAttempts
};
