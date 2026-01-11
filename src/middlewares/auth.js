const jwt = require('jsonwebtoken');
const User = require('../models/User');
const SuperAdmin = require('../models/SuperAdmin');
const { verifyAccessToken, verifyToken } = require('../utils/jwt');
const { getTokenFromRequest } = require('../utils/cookieConfig');
const { LEGACY_ROLE_MAP } = require('../config/constants');

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
      
      // Get user from User model
      const user = await User.findById(decoded.userId).select('-password');
      
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
        const user = await User.findById(decoded.userId).select('-password');
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
  return (req, res, next) => {
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
    
    // Check if user has the specific permission
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

module.exports = {
  protect,
  protectAny,
  protectSuperAdmin,
  restrictTo,
  restrictToBranch,
  requirePermission,
  requireEmailVerification,
  optionalAuth
};
