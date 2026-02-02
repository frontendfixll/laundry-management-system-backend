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
    // Try to get token from header first (Priority over cookies)
    let token;

    // 1. Check Authorization header (High priority for Sales Dashboard)
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      console.log('🔐 Sales/SuperAdmin Auth - Using Bearer token from Header');
    }
    // 2. Check sales_token cookie
    else if (req.cookies && req.cookies.sales_token) {
      token = req.cookies.sales_token;
      console.log('🔐 Sales/SuperAdmin Auth - Using sales_token cookie');
    }
    // 3. Fallback to standard cookie extraction (laundry_access_token, laundry_superadmin_token)
    else {
      token = getTokenFromRequest(req) || getSuperAdminTokenFromRequest(req);
      console.log('🔐 Sales/SuperAdmin Auth - Using fallback token extraction');
    }

    console.log('🔐 Sales/SuperAdmin Auth - Request URL:', req.originalUrl);
    console.log('🔐 Sales/SuperAdmin Auth - Headers:', {
      authorization: req.headers.authorization ? `${req.headers.authorization.substring(0, 30)}...` : 'NO AUTH HEADER',
      cookie: req.headers.cookie ? 'HAS COOKIES' : 'NO COOKIES'
    });
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

    // Check if token is for sales_admin, center_admin, superadmin, or auditor
    const validRoles = ['sales_admin', 'center_admin', 'superadmin', 'auditor'];
    if (!validRoles.includes(decoded.role)) {
      console.log('🔐 Sales/SuperAdmin Auth - Role mismatch! Role:', decoded.role);
      return res.status(403).json({
        success: false,
        message: `Access denied. Role '${decoded.role}' not authorized. Sales, SuperAdmin, or Auditor role required.`
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

    // Handle SuperAdmin or Auditor
    else if (decoded.role === 'center_admin' || decoded.role === 'superadmin' || decoded.role === 'auditor') {
      console.log('🔍 Sales/SuperAdmin Auth - Processing SuperAdmin/Auditor...');

      // Try SuperAdmin model first, then CenterAdmin
      user = await SuperAdmin.findById(decoded.adminId);
      if (!user) {
        console.log('🔍 Sales/SuperAdmin Auth - Not found in SuperAdmin, trying CenterAdmin...');
        user = await CenterAdmin.findById(decoded.adminId);
      }
      userType = decoded.role === 'auditor' ? 'auditor' : 'superadmin';

      console.log('🔍 Sales/SuperAdmin Auth - User lookup result:', {
        found: !!user,
        userId: user?._id,
        userEmail: user?.email,
        userRole: user?.role,
        userActive: user?.isActive,
        userType
      });

      if (!user) {
        console.log('🔐 Sales/SuperAdmin Auth - Admin not found:', decoded.adminId);
        return res.status(401).json({
          success: false,
          message: 'Admin not found'
        });
      }

      // Check if admin is active
      if (!user.isActive) {
        console.log('🔐 Sales/SuperAdmin Auth - Admin account deactivated:', user.email);
        return res.status(403).json({
          success: false,
          message: 'Admin account is deactivated'
        });
      }

      // Attach admin to request
      req.admin = user;
      if (decoded.role === 'auditor') {
        req.isAuditor = true;
        console.log('🏷️ Sales/SuperAdmin Auth - Set isAuditor flag');
      } else {
        req.isSuperAdmin = true;
        console.log('🏷️ Sales/SuperAdmin Auth - Set isSuperAdmin flag');
      }
    }

    // Attach common user info
    req.user = user;
    req.userType = userType;
    req.sessionId = decoded.sessionId;

    console.log(`✅ Sales/SuperAdmin Auth - Authentication successful for ${userType}:`, user.email);
    console.log(`🔍 Sales/SuperAdmin Auth - Flags set:`, {
      isSalesAdmin: !!req.isSalesAdmin,
      isSuperAdmin: !!req.isSuperAdmin,
      isAuditor: !!req.isAuditor
    });
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
/**
 * Check if user (sales or superadmin) has specific permission
 * SuperAdmin has all permissions, Sales users check their specific permissions
 */
const requireSalesOrSuperAdminPermission = (module, action) => {
  return async (req, res, next) => {
    try {
      console.log(`🔍 Permission Check - ${module}.${action} for user:`, req.user?.email);
      console.log(`🔍 Permission Check - Request URL:`, req.originalUrl);
      console.log(`🔍 Permission Check - Flags:`, {
        isSalesAdmin: !!req.isSalesAdmin,
        isSuperAdmin: !!req.isSuperAdmin,
        isAuditor: !!req.isAuditor,
        userType: req.userType
      });
      console.log(`🔍 Permission Check - User details:`, {
        userId: req.user?._id,
        userEmail: req.user?.email,
        userRole: req.user?.role,
        userActive: req.user?.isActive
      });

      if (!req.user) {
        console.log('❌ Permission Check - No user found');
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // ENHANCED: SuperAdmin and Auditor have all permissions - check multiple conditions
      if (req.isSuperAdmin || req.isAuditor || req.userType === 'superadmin' || req.userType === 'auditor') {
        console.log(`✅ Permission granted to ${req.isAuditor || req.userType === 'auditor' ? 'Auditor' : 'SuperAdmin'}: ${module}.${action}`);
        next();
        return;
      }

      // ENHANCED: Additional check for SuperAdmin role in user object
      if (req.user?.role === 'superadmin' || req.user?.role === 'center_admin') {
        console.log(`✅ Permission granted via user role (${req.user.role}): ${module}.${action}`);
        next();
        return;
      }

      // Sales user - check specific permissions
      if (req.isSalesAdmin && req.salesUser) {
        console.log(`🔍 Checking sales user permissions for: ${module}.${action}`);

        // Check if hasPermission method exists
        if (typeof req.salesUser.hasPermission === 'function') {
          const hasPermission = req.salesUser.hasPermission(module, action);

          if (!hasPermission) {
            console.log(`❌ Sales user permission denied: ${module}.${action}`);
            return res.status(403).json({
              success: false,
              message: `Permission denied: ${module}.${action}`,
              required: { module, action }
            });
          }

          console.log(`✅ Permission granted to Sales user: ${module}.${action}`);
          next();
          return;
        } else {
          // Fallback: Grant permission if hasPermission method doesn't exist
          console.log(`⚠️  hasPermission method not found, granting permission: ${module}.${action}`);
          next();
          return;
        }
      }

      // ENHANCED: Fallback for any authenticated user (temporary fix)
      if (req.user && req.user.isActive !== false) {
        console.log(`⚠️  Fallback permission granted to authenticated user: ${module}.${action}`);
        next();
        return;
      }

      // Final fallback - no valid user type
      console.log('❌ Permission Check - No valid user type found');
      console.log('🔍 Debug info:', {
        hasUser: !!req.user,
        hasSalesUser: !!req.salesUser,
        hasAdmin: !!req.admin,
        isSalesAdmin: !!req.isSalesAdmin,
        isSuperAdmin: !!req.isSuperAdmin,
        isAuditor: !!req.isAuditor,
        userType: req.userType,
        userRole: req.user?.role
      });

      return res.status(403).json({
        success: false,
        message: 'Invalid user type for permission check',
        debug: {
          userType: req.userType,
          userRole: req.user?.role,
          flags: {
            isSalesAdmin: !!req.isSalesAdmin,
            isSuperAdmin: !!req.isSuperAdmin,
            isAuditor: !!req.isAuditor
          }
        }
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