const jwt = require('jsonwebtoken');
const SalesUser = require('../models/SalesUser');
const CenterAdmin = require('../models/CenterAdmin');
const SuperAdmin = require('../models/SuperAdmin');
const { getTokenFromRequest, getSuperAdminTokenFromRequest } = require('../utils/cookieConfig');

/**
 * Authenticate Sales User OR SuperAdmin
 * Allows both sales users and superadmin to access sales routes
 */
const authenticateSalesOrSuperAdmin = async (req, res, next) => {
  try {
    // Try to get token from both sales and superadmin sources
    let token = getTokenFromRequest(req) || getSuperAdminTokenFromRequest(req);
    
    console.log('🔐 Sales/SuperAdmin Auth - Request URL:', req.originalUrl);
    console.log('🔐 Sales/SuperAdmin Auth - Token received:', token ? `${token.substring(0, 30)}...` : 'NO TOKEN');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('🔐 Sales/SuperAdmin Auth - Decoded token:', { 
        userId: decoded.salesUserId || decoded.adminId, 
        email: decoded.email, 
        role: decoded.role,
        sessionId: decoded.sessionId 
      });
    } catch (error) {
      console.log('🔐 Sales/SuperAdmin Auth - JWT verify error:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    // Check if token is for sales_admin, center_admin, or superadmin
    const validRoles = ['sales_admin', 'center_admin', 'superadmin'];
    if (!validRoles.includes(decoded.role)) {
      console.log('🔐 Sales/SuperAdmin Auth - Role mismatch! Role:', decoded.role);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Sales or SuperAdmin role required.'
      });
    }

    let user;
    let userType;

    // Handle Sales User
    if (decoded.role === 'sales_admin') {
      user = await SalesUser.findById(decoded.salesUserId).select('-password');
      userType = 'sales';
      
      if (!user) {
        console.log('🔐 Sales/SuperAdmin Auth - Sales user not found:', decoded.salesUserId);
        return res.status(401).json({
          success: false,
          message: 'Sales user not found'
        });
      }

      // Check if account is active
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Sales account is deactivated'
        });
      }

      // Check if account is locked
      if (user.isLocked && user.isLocked()) {
        return res.status(403).json({
          success: false,
          message: 'Sales account is temporarily locked'
        });
      }

      // Verify session if sessionId is present
      if (decoded.sessionId) {
        const session = user.sessions.find(
          s => s.sessionId === decoded.sessionId && s.isActive
        );
        
        if (!session) {
          return res.status(401).json({
            success: false,
            message: 'Sales session expired or invalid'
          });
        }

        // Check if session has expired
        if (new Date(session.expiresAt) < new Date()) {
          return res.status(401).json({
            success: false,
            message: 'Sales session has expired'
          });
        }

        // Update last activity
        session.lastActivity = new Date();
        await user.save();
      }

      // Attach sales user to request
      req.salesUser = user;
      req.isSalesAdmin = true;
    }
    
    // Handle SuperAdmin
    else if (decoded.role === 'center_admin' || decoded.role === 'superadmin') {
      // Try SuperAdmin model first, then CenterAdmin
      user = await SuperAdmin.findById(decoded.adminId);
      if (!user) {
        user = await CenterAdmin.findById(decoded.adminId);
      }
      userType = 'superadmin';
      
      if (!user) {
        console.log('🔐 Sales/SuperAdmin Auth - Admin not found:', decoded.adminId);
        return res.status(401).json({
          success: false,
          message: 'Admin not found'
        });
      }

      // Check if admin is active
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Admin account is deactivated'
        });
      }

      // Attach admin to request
      req.admin = user;
      req.isSuperAdmin = true;
    }

    // Attach common user info
    req.user = user;
    req.userType = userType;
    req.sessionId = decoded.sessionId;
    
    console.log(`✅ Sales/SuperAdmin Auth - Authentication successful for ${userType}:`, user.email);
    next();
  } catch (error) {
    console.error('❌ Sales/SuperAdmin Auth - Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

/**
 * Check if user (sales or superadmin) has specific permission
 * SuperAdmin has all permissions, Sales users check their specific permissions
 */
const requireSalesOrSuperAdminPermission = (module, action) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // SuperAdmin has all permissions
      if (req.isSuperAdmin) {
        console.log(`✅ Permission granted to SuperAdmin: ${module}.${action}`);
        next();
        return;
      }

      // Sales user - check specific permissions
      if (req.isSalesAdmin && req.salesUser) {
        const hasPermission = req.salesUser.hasPermission(module, action);
        
        if (!hasPermission) {
          return res.status(403).json({
            success: false,
            message: `Permission denied: ${module}.${action}`,
            required: { module, action }
          });
        }

        console.log(`✅ Permission granted to Sales user: ${module}.${action}`);
        next();
        return;
      }

      // Fallback - no valid user type
      return res.status(403).json({
        success: false,
        message: 'Invalid user type for permission check'
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
 * Log user actions for audit trail (works for both sales and superadmin)
 */
const logSalesOrSuperAdminAction = (action, module) => {
  return async (req, res, next) => {
    try {
      // Store action details in request for later logging
      req.auditLog = {
        action,
        module,
        userId: req.salesUser?._id || req.admin?._id,
        userEmail: req.salesUser?.email || req.admin?.email,
        userType: req.userType,
        timestamp: new Date(),
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      };
      
      next();
    } catch (error) {
      console.error('Audit log error:', error);
      next(); // Don't block request if logging fails
    }
  };
};

module.exports = {
  authenticateSalesOrSuperAdmin,
  requireSalesOrSuperAdminPermission,
  logSalesOrSuperAdminAction
};