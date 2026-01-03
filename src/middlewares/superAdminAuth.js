const jwt = require('jsonwebtoken')
const CenterAdmin = require('../models/CenterAdmin')
const SuperAdmin = require('../models/SuperAdmin')
const { getTokenFromRequest, getSuperAdminTokenFromRequest } = require('../utils/cookieConfig')

// Middleware to authenticate super admin
const authenticateSuperAdmin = async (req, res, next) => {
  try {
    // Get token from cookie or header - try superadmin token first, then regular token
    let token = getSuperAdminTokenFromRequest(req)
    if (!token) {
      token = getTokenFromRequest(req)
    }
    
    console.log('🔐 SuperAdmin Auth - Request URL:', req.originalUrl)
    console.log('🔐 SuperAdmin Auth - Token received:', token ? `${token.substring(0, 30)}...` : 'NO TOKEN')
    console.log('🔐 SuperAdmin Auth - Auth Header:', req.headers.authorization ? 'Present' : 'Missing')
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      })
    }

    // Verify JWT token
    let decoded
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET)
      console.log('🔐 SuperAdmin Auth - Decoded token:', { 
        adminId: decoded.adminId, 
        email: decoded.email, 
        role: decoded.role,
        sessionId: decoded.sessionId 
      })
    } catch (error) {
      console.log('🔐 SuperAdmin Auth - JWT verify error:', error.message)
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      })
    }

    // Check if token is for center_admin or superadmin (both are valid for SuperAdmin routes)
    const validRoles = ['center_admin', 'superadmin']
    console.log('🔐 SuperAdmin Auth - Checking role:', decoded.role, 'against valid roles:', validRoles)
    if (!validRoles.includes(decoded.role)) {
      console.log('🔐 SuperAdmin Auth - Role mismatch! Role:', decoded.role, 'is not in', validRoles)
      return res.status(403).json({
        success: false,
        message: 'Access denied. SuperAdmin role required.'
      })
    }

    // Find admin - try SuperAdmin model first, then CenterAdmin
    let admin = await SuperAdmin.findById(decoded.adminId)
    if (!admin) {
      admin = await CenterAdmin.findById(decoded.adminId)
    }
    
    console.log('🔐 SuperAdmin Auth - Admin found:', admin ? { id: admin._id, email: admin.email, role: admin.role, isActive: admin.isActive } : 'NOT FOUND')
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Admin not found'
      })
    }

    // Check if admin is active
    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated'
      })
    }

    // Attach admin info to request
    req.admin = admin
    req.sessionId = decoded.sessionId

    next()
  } catch (error) {
    console.error('Authentication error:', error)
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    })
  }
}

// Middleware to check specific permission
const requirePermission = (module, action) => {
  return (req, res, next) => {
    try {
      const admin = req.admin
      
      if (!admin) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        })
      }

      // SuperAdmin has all permissions
      if (admin.role === 'superadmin' || admin.role === 'center_admin') {
        // Check if admin has the specific permission
        const permissions = admin.permissions || {}
        const modulePermissions = permissions[module]
        
        // If no permissions defined, allow access (for backward compatibility)
        if (!modulePermissions) {
          return next()
        }
        
        // Check if the specific action is allowed
        if (modulePermissions[action] === true || modulePermissions[action] === 'true') {
          return next()
        }
        
        // For superadmin role, allow all by default
        if (admin.role === 'superadmin') {
          return next()
        }
      }

      return res.status(403).json({
        success: false,
        message: `Permission denied. Required: ${module}.${action}`
      })
    } catch (error) {
      console.error('Permission check error:', error)
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      })
    }
  }
}

// Middleware to log admin actions
const logAdminAction = (action, module) => {
  return async (req, res, next) => {
    // Store action info for later logging
    req.adminAction = {
      action,
      module,
      timestamp: new Date(),
      adminId: req.admin?._id,
      adminEmail: req.admin?.email,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    }
    
    // Continue with the request
    next()
  }
}

// Alias for backward compatibility
const protectSuperAdmin = authenticateSuperAdmin
const authenticateCenterAdmin = authenticateSuperAdmin

module.exports = {
  authenticateSuperAdmin,
  authenticateCenterAdmin,
  protectSuperAdmin,
  requirePermission,
  logAdminAction
}
