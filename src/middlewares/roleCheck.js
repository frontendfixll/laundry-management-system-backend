const { USER_ROLES, LEGACY_ROLE_MAP } = require('../config/constants');

// Helper to normalize role (backward compatibility)
const normalizeRole = (role) => {
  return LEGACY_ROLE_MAP[role] || role;
};

// Check if user has required role
const roleCheck = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    // Normalize user role for backward compatibility
    const userRole = normalizeRole(req.user.role);
    // Normalize allowed roles too
    const normalizedAllowedRoles = allowedRoles.map(normalizeRole);

    if (!normalizedAllowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Insufficient permissions'
      });
    }

    next();
  };
};

// Specific role checkers
const isCustomer = roleCheck(USER_ROLES.CUSTOMER);
const isAdmin = roleCheck(USER_ROLES.ADMIN);
const isStaff = roleCheck(USER_ROLES.STAFF);

// Legacy role checkers (backward compatibility - all map to admin)
const isBranchManager = roleCheck(USER_ROLES.ADMIN);
const isCenterAdmin = roleCheck(USER_ROLES.ADMIN);

// Combined role checkers (simplified - admin handles all management)
const isAdminOrCenterAdmin = roleCheck(USER_ROLES.ADMIN);
const isBranchManagerOrAdmin = roleCheck(USER_ROLES.ADMIN);
const isSupportOrAdmin = roleCheck(USER_ROLES.ADMIN);
const isAdminOrStaff = roleCheck(USER_ROLES.ADMIN, USER_ROLES.STAFF);

// Check if user can access specific branch
const canAccessBranch = (req, res, next) => {
  const { branchId } = req.params;
  const user = req.user;
  const userRole = normalizeRole(user.role);

  // Admin can only access their assigned branch
  if (userRole === USER_ROLES.ADMIN) {
    if (user.assignedBranch && user.assignedBranch.toString() === branchId) {
      return next();
    } else {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Access denied to this branch'
      });
    }
  }

  // Staff can only access their assigned branch
  if (userRole === USER_ROLES.STAFF) {
    if (user.assignedBranch && user.assignedBranch.toString() === branchId) {
      return next();
    } else {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Access denied to this branch'
      });
    }
  }

  // Other roles cannot access branch-specific data
  return res.status(403).json({
    success: false,
    error: 'FORBIDDEN',
    message: 'Insufficient permissions'
  });
};

// Check if user can access specific order
const canAccessOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const user = req.user;
    const userRole = normalizeRole(user.role);
    const Order = require('../models/Order');

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'ORDER_NOT_FOUND',
        message: 'Order not found'
      });
    }

    // Customer can only access their own orders
    if (userRole === USER_ROLES.CUSTOMER) {
      if (order.customer.toString() !== user._id.toString()) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Access denied to this order'
        });
      }
    }

    // Admin can only access orders assigned to their branch
    if (userRole === USER_ROLES.ADMIN) {
      if (!order.branch || order.branch.toString() !== user.assignedBranch.toString()) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Access denied to this order'
        });
      }
    }

    // Staff can only access orders assigned to their branch
    if (userRole === USER_ROLES.STAFF) {
      if (!order.branch || order.branch.toString() !== user.assignedBranch.toString()) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Access denied to this order'
        });
      }
    }

    req.order = order;
    next();
  } catch (error) {
    console.error('Order access check error:', error);
    res.status(500).json({
      success: false,
      error: 'SERVER_ERROR',
      message: 'Error checking order access'
    });
  }
};

// Check if user has specific RBAC permission
const requirePermission = (module, action) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    // Check if user has the permission
    if (req.user.hasPermission && req.user.hasPermission(module, action)) {
      return next();
    }

    // Fallback: check permissions object directly
    if (req.user.permissions && 
        req.user.permissions[module] && 
        req.user.permissions[module][action]) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: `Permission denied: ${module}.${action}`
    });
  };
};

module.exports = {
  roleCheck,
  normalizeRole,
  isCustomer,
  isAdmin,
  isStaff,
  isBranchManager,
  isCenterAdmin,
  isAdminOrCenterAdmin,
  isBranchManagerOrAdmin,
  isSupportOrAdmin,
  isAdminOrStaff,
  canAccessBranch,
  canAccessOrder,
  requirePermission
};