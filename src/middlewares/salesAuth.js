const jwt = require('jsonwebtoken');
const SalesUser = require('../models/SalesUser');
const { getTokenFromRequest } = require('../utils/cookieConfig');

/**
 * Authenticate Sales User
 * Verifies JWT token and attaches sales user to request
 */
const authenticateSales = async (req, res, next) => {
  try {
    // Get token from cookie or header
    let token = getTokenFromRequest(req);
    
    console.log('🔐 Sales Auth - Request URL:', req.originalUrl);
    console.log('🔐 Sales Auth - Token received:', token ? `${token.substring(0, 30)}...` : 'NO TOKEN');
    
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
      console.log('🔐 Sales Auth - Decoded token:', { 
        salesUserId: decoded.salesUserId, 
        email: decoded.email, 
        role: decoded.role,
        sessionId: decoded.sessionId 
      });
    } catch (error) {
      console.log('🔐 Sales Auth - JWT verify error:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    // Check if token is for sales_admin
    if (decoded.role !== 'sales_admin') {
      console.log('🔐 Sales Auth - Role mismatch! Role:', decoded.role);
      return res.status(403).json({
        success: false,
        message: 'Access denied. Sales role required.'
      });
    }

    // Find sales user
    const salesUser = await SalesUser.findById(decoded.salesUserId).select('-password');
    
    if (!salesUser) {
      console.log('🔐 Sales Auth - Sales user not found:', decoded.salesUserId);
      return res.status(401).json({
        success: false,
        message: 'Sales user not found'
      });
    }

    // Check if account is active
    if (!salesUser.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Check if account is locked
    if (salesUser.isLocked()) {
      return res.status(403).json({
        success: false,
        message: 'Account is temporarily locked due to multiple failed login attempts'
      });
    }

    // Verify session if sessionId is present
    if (decoded.sessionId) {
      const session = salesUser.sessions.find(
        s => s.sessionId === decoded.sessionId && s.isActive
      );
      
      if (!session) {
        return res.status(401).json({
          success: false,
          message: 'Session expired or invalid'
        });
      }

      // Check if session has expired
      if (new Date(session.expiresAt) < new Date()) {
        return res.status(401).json({
          success: false,
          message: 'Session has expired'
        });
      }

      // Update last activity
      session.lastActivity = new Date();
      await salesUser.save();
    }

    // Attach sales user to request
    req.user = salesUser;
    req.salesUser = salesUser;
    req.isSalesAdmin = true;
    
    console.log('✅ Sales Auth - Authentication successful for:', salesUser.email);
    next();
  } catch (error) {
    console.error('❌ Sales Auth - Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication'
    });
  }
};

/**
 * Check if sales user has specific permission
 * @param {string} module - Module name (e.g., 'leads', 'trials')
 * @param {string} action - Action name (e.g., 'view', 'create', 'update')
 */
const requireSalesPermission = (module, action) => {
  return async (req, res, next) => {
    try {
      if (!req.salesUser) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const hasPermission = req.salesUser.hasPermission(module, action);
      
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: `Permission denied: ${module}.${action}`,
          required: { module, action }
        });
      }

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
 * Log sales user actions for audit trail
 */
const logSalesAction = (action, module) => {
  return async (req, res, next) => {
    try {
      // Store action details in request for later logging
      req.auditLog = {
        action,
        module,
        salesUserId: req.salesUser?._id,
        salesUserEmail: req.salesUser?.email,
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
  authenticateSales,
  requireSalesPermission,
  logSalesAction
};
