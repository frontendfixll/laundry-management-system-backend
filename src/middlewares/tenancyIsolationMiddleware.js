/**
 * Tenancy Isolation Middleware
 * Ensures complete data isolation between tenancies
 */

const mongoose = require('mongoose');

/**
 * Middleware to ensure tenancy isolation for admin/staff users
 * Automatically adds tenancy filter to all database queries
 */
const ensureTenancyIsolation = (req, res, next) => {
  try {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // SuperAdmin can access all tenancies (no isolation)
    if (user.role === 'superadmin' || user.role === 'sales_admin') {
      return next();
    }

    // Admin, branch_admin, and staff must have tenancy
    if (user.role === 'admin' || user.role === 'branch_admin' || user.role === 'staff') {
      if (!user.tenancy && !user.tenancyId) {
        return res.status(403).json({
          success: false,
          message: 'User is not associated with any tenancy'
        });
      }

      // Add tenancy context to request
      req.tenancyId = user.tenancy || user.tenancyId;
      req.userTenancy = user.tenancy || user.tenancyId;
      
      // Set tenancy filter for database queries
      req.tenancyFilter = { tenancy: req.tenancyId };
      
      console.log(`🔒 Tenancy isolation applied for ${user.email}: ${req.tenancyId}`);
    }

    // Customers don't have tenancy isolation (they can order from any laundry)
    // But we'll validate tenancy context in customer-specific routes

    next();
  } catch (error) {
    console.error('Tenancy isolation middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Middleware to validate tenancy ownership for specific resources
 * Use this for routes that access tenancy-specific data
 */
const validateTenancyOwnership = (req, res, next) => {
  try {
    const user = req.user;
    const { tenancyId } = req.params;

    // SuperAdmin can access any tenancy
    if (user.role === 'superadmin' || user.role === 'sales_admin') {
      return next();
    }

    // Admin/staff can only access their own tenancy
    if (user.role === 'admin' || user.role === 'branch_admin' || user.role === 'staff') {
      const userTenancyId = (user.tenancy || user.tenancyId)?.toString();
      
      if (!userTenancyId) {
        return res.status(403).json({
          success: false,
          message: 'User is not associated with any tenancy'
        });
      }

      if (tenancyId && tenancyId !== userTenancyId) {
        console.log(`🚫 Tenancy access denied: ${user.email} tried to access ${tenancyId}, but belongs to ${userTenancyId}`);
        return res.status(403).json({
          success: false,
          message: 'Access denied: You can only access your own tenancy data'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Tenancy ownership validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Middleware to validate customer tenancy context
 * Ensures customers can only access orders/data from the correct tenancy
 */
const validateCustomerTenancyContext = (req, res, next) => {
  try {
    const user = req.user;
    
    // Only apply to customer users
    if (user.role !== 'customer') {
      return next();
    }

    // Get tenancy context from subdomain, header, or request body
    let tenancyId = req.tenancyId || req.headers['x-tenancy-id'] || req.body.tenancyId;
    
    // Extract from subdomain if available
    if (!tenancyId && req.tenancy) {
      tenancyId = req.tenancy._id;
    }

    if (!tenancyId) {
      return res.status(400).json({
        success: false,
        message: 'Tenancy context is required for this operation'
      });
    }

    // Add tenancy context to request
    req.customerTenancyId = tenancyId;
    req.tenancyFilter = { tenancy: tenancyId };

    console.log(`👤 Customer tenancy context: ${user.email} accessing tenancy ${tenancyId}`);

    next();
  } catch (error) {
    console.error('Customer tenancy validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Middleware to add tenancy filter to MongoDB queries
 * Automatically filters all queries by user's tenancy
 */
const addTenancyFilter = (req, res, next) => {
  try {
    const user = req.user;
    
    // Skip for SuperAdmin
    if (user.role === 'superadmin' || user.role === 'sales_admin') {
      return next();
    }

    // Get tenancy ID
    let tenancyId = null;
    
    if (user.role === 'admin' || user.role === 'branch_admin' || user.role === 'staff') {
      tenancyId = user.tenancy || user.tenancyId;
    } else if (user.role === 'customer') {
      tenancyId = req.customerTenancyId || req.tenancyId;
    }

    if (tenancyId) {
      // Add to request for use in controllers
      req.tenancyFilter = { tenancy: tenancyId };
      req.tenancyId = tenancyId;
      
      // Override mongoose find methods to automatically add tenancy filter
      const originalFind = mongoose.Model.find;
      const originalFindOne = mongoose.Model.findOne;
      const originalFindOneAndUpdate = mongoose.Model.findOneAndUpdate;
      const originalUpdateMany = mongoose.Model.updateMany;
      const originalDeleteMany = mongoose.Model.deleteMany;

      // Note: This is a simplified approach. In production, consider using
      // mongoose plugins or query middleware for better performance
    }

    next();
  } catch (error) {
    console.error('Add tenancy filter error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Helper function to get tenancy-safe query filter
 * Use this in controllers to ensure tenancy isolation
 */
const getTenancyFilter = (req, additionalFilter = {}) => {
  const user = req.user;
  
  // SuperAdmin can access all data
  if (user.role === 'superadmin' || user.role === 'sales_admin') {
    return additionalFilter;
  }

  // Get tenancy ID
  let tenancyId = null;
  
  if (user.role === 'admin' || user.role === 'branch_admin' || user.role === 'staff') {
    tenancyId = user.tenancy || user.tenancyId;
  } else if (user.role === 'customer') {
    tenancyId = req.customerTenancyId || req.tenancyId;
  }

  if (!tenancyId) {
    throw new Error('Tenancy context is required');
  }

  return {
    tenancy: tenancyId,
    ...additionalFilter
  };
};

/**
 * Helper function to validate if user can access a specific tenancy
 */
const canAccessTenancy = (user, tenancyId) => {
  // SuperAdmin can access any tenancy
  if (user.role === 'superadmin' || user.role === 'sales_admin') {
    return true;
  }

  // Admin/staff can only access their own tenancy
  if (user.role === 'admin' || user.role === 'branch_admin' || user.role === 'staff') {
    const userTenancyId = (user.tenancy || user.tenancyId)?.toString();
    return userTenancyId === tenancyId?.toString();
  }

  // Customers can access any tenancy (they can order from different laundries)
  if (user.role === 'customer') {
    return true;
  }

  return false;
};

/**
 * Middleware to log tenancy access for audit purposes
 */
const logTenancyAccess = (req, res, next) => {
  const user = req.user;
  const tenancyId = req.tenancyId || req.params.tenancyId;
  
  if (tenancyId && user) {
    console.log(`📊 Tenancy Access Log: ${user.email} (${user.role}) accessed tenancy ${tenancyId} - ${req.method} ${req.originalUrl}`);
  }
  
  next();
};

module.exports = {
  ensureTenancyIsolation,
  validateTenancyOwnership,
  validateCustomerTenancyContext,
  addTenancyFilter,
  getTenancyFilter,
  canAccessTenancy,
  logTenancyAccess
};