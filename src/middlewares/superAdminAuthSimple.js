const jwt = require('jsonwebtoken')
const CenterAdmin = require('../models/CenterAdmin')
const SuperAdmin = require('../models/SuperAdmin')
const { getSuperAdminTokenFromRequest } = require('../utils/cookieConfig')

// Simplified middleware to authenticate superadmin
const authenticateSuperAdmin = async (req, res, next) => {
  try {
    // Get token from superadmin cookie or header
    const token = getSuperAdminTokenFromRequest(req)
    
    console.log('🔐 SuperAdmin Auth - Token received:', token ? `${token.substring(0, 30)}...` : 'NO TOKEN')
    
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
    if (!validRoles.includes(decoded.role)) {
      console.log('🔐 SuperAdmin Auth - Role mismatch:', decoded.role, 'not in', validRoles)
      return res.status(403).json({
        success: false,
        message: `Access denied. SuperAdmin role required. Your role: ${decoded.role}`
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

// Alias for backward compatibility
const authenticateCenterAdmin = authenticateSuperAdmin

module.exports = {
  authenticateSuperAdmin,
  authenticateCenterAdmin
}