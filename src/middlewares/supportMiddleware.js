const { sendError } = require('../utils/helpers');

// Middleware to check if user has support role
const requireSupportRole = (req, res, next) => {
  if (!req.user) {
    return sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
  }

  if (req.user.role !== 'support') {
    return sendError(res, 'FORBIDDEN', 'Support role required', 403);
  }

  next();
};

// Middleware to check if user can manage support (admin role)
const requireSupportManagement = (req, res, next) => {
  if (!req.user) {
    return sendError(res, 'UNAUTHORIZED', 'Authentication required', 401);
  }

  if (req.user.role !== 'admin') {
    return sendError(res, 'FORBIDDEN', 'Admin role required to manage support', 403);
  }

  // Check if admin has support management permissions
  if (!req.user.hasPermission('support', 'manage')) {
    return sendError(res, 'FORBIDDEN', 'Insufficient permissions to manage support', 403);
  }

  next();
};

module.exports = {
  requireSupportRole,
  requireSupportManagement
};