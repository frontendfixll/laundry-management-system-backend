/**
 * Plan Limits Middleware
 * Enforces subscription plan limits for tenancies
 */

const Tenancy = require('../models/Tenancy');
const Order = require('../models/Order');
const User = require('../models/User');
const Branch = require('../models/Branch');

/**
 * Check if tenancy can create more orders based on plan limits
 */
const checkOrderLimit = async (req, res, next) => {
  try {
    // Get tenancy from request (set by tenant middleware)
    const tenancyId = req.tenancy?._id || req.body.tenancyId || req.user?.tenancy;
    
    if (!tenancyId) {
      // No tenancy context - allow (might be superadmin or system)
      return next();
    }

    const tenancy = await Tenancy.findById(tenancyId);
    
    if (!tenancy) {
      return res.status(404).json({
        success: false,
        message: 'Tenancy not found'
      });
    }

    // Check subscription status
    if (!tenancy.isSubscriptionActive()) {
      return res.status(403).json({
        success: false,
        error: 'SUBSCRIPTION_INACTIVE',
        message: 'Your subscription is not active. Please renew to continue.'
      });
    }

    const maxOrders = tenancy.subscription?.features?.maxOrders || 100;
    
    // -1 means unlimited
    if (maxOrders === -1) {
      return next();
    }

    // Count orders this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const orderCount = await Order.countDocuments({
      tenancy: tenancyId,
      createdAt: { $gte: startOfMonth }
    });

    if (orderCount >= maxOrders) {
      return res.status(403).json({
        success: false,
        error: 'ORDER_LIMIT_REACHED',
        message: `You have reached your monthly order limit of ${maxOrders}. Please upgrade your plan.`,
        data: {
          currentOrders: orderCount,
          maxOrders: maxOrders,
          plan: tenancy.subscription?.plan || 'free'
        }
      });
    }

    // Add remaining orders info to request
    req.planLimits = {
      ordersUsed: orderCount,
      ordersRemaining: maxOrders - orderCount,
      maxOrders: maxOrders
    };

    next();
  } catch (error) {
    console.error('Check order limit error:', error);
    next(); // Don't block on error, just log
  }
};

/**
 * Check if tenancy can add more staff based on plan limits
 */
const checkStaffLimit = async (req, res, next) => {
  try {
    const tenancyId = req.tenancy?._id || req.body.tenancyId || req.admin?.tenancy;
    
    if (!tenancyId) {
      return next();
    }

    const tenancy = await Tenancy.findById(tenancyId);
    
    if (!tenancy) {
      return res.status(404).json({
        success: false,
        message: 'Tenancy not found'
      });
    }

    const maxStaff = tenancy.subscription?.features?.maxStaff || 5;
    
    // -1 means unlimited
    if (maxStaff === -1) {
      return next();
    }

    // Count current staff
    const staffCount = await User.countDocuments({
      tenancy: tenancyId,
      role: { $in: ['staff', 'driver', 'branch_manager'] },
      isActive: true
    });

    if (staffCount >= maxStaff) {
      return res.status(403).json({
        success: false,
        error: 'STAFF_LIMIT_REACHED',
        message: `You have reached your staff limit of ${maxStaff}. Please upgrade your plan.`,
        data: {
          currentStaff: staffCount,
          maxStaff: maxStaff,
          plan: tenancy.subscription?.plan || 'free'
        }
      });
    }

    req.planLimits = {
      ...req.planLimits,
      staffUsed: staffCount,
      staffRemaining: maxStaff - staffCount,
      maxStaff: maxStaff
    };

    next();
  } catch (error) {
    console.error('Check staff limit error:', error);
    next();
  }
};

/**
 * Check if tenancy can add more branches based on plan limits
 */
const checkBranchLimit = async (req, res, next) => {
  try {
    const tenancyId = req.tenancy?._id || req.body.tenancyId || req.admin?.tenancy;
    
    if (!tenancyId) {
      return next();
    }

    const tenancy = await Tenancy.findById(tenancyId);
    
    if (!tenancy) {
      return res.status(404).json({
        success: false,
        message: 'Tenancy not found'
      });
    }

    const maxBranches = tenancy.subscription?.features?.maxBranches || 1;
    
    // -1 means unlimited
    if (maxBranches === -1) {
      return next();
    }

    // Count current branches
    const branchCount = await Branch.countDocuments({
      tenancy: tenancyId,
      isActive: true
    });

    if (branchCount >= maxBranches) {
      return res.status(403).json({
        success: false,
        error: 'BRANCH_LIMIT_REACHED',
        message: `You have reached your branch limit of ${maxBranches}. Please upgrade your plan.`,
        data: {
          currentBranches: branchCount,
          maxBranches: maxBranches,
          plan: tenancy.subscription?.plan || 'free'
        }
      });
    }

    req.planLimits = {
      ...req.planLimits,
      branchesUsed: branchCount,
      branchesRemaining: maxBranches - branchCount,
      maxBranches: maxBranches
    };

    next();
  } catch (error) {
    console.error('Check branch limit error:', error);
    next();
  }
};

/**
 * Check if tenancy can add more customers based on plan limits
 */
const checkCustomerLimit = async (req, res, next) => {
  try {
    const tenancyId = req.tenancy?._id || req.body.tenancyId;
    
    if (!tenancyId) {
      return next();
    }

    const tenancy = await Tenancy.findById(tenancyId);
    
    if (!tenancy) {
      return res.status(404).json({
        success: false,
        message: 'Tenancy not found'
      });
    }

    const maxCustomers = tenancy.subscription?.features?.maxCustomers || 500;
    
    // -1 means unlimited
    if (maxCustomers === -1) {
      return next();
    }

    // Count current customers
    const customerCount = await User.countDocuments({
      tenancy: tenancyId,
      role: 'customer',
      isActive: true
    });

    if (customerCount >= maxCustomers) {
      return res.status(403).json({
        success: false,
        error: 'CUSTOMER_LIMIT_REACHED',
        message: `You have reached your customer limit of ${maxCustomers}. Please upgrade your plan.`,
        data: {
          currentCustomers: customerCount,
          maxCustomers: maxCustomers,
          plan: tenancy.subscription?.plan || 'free'
        }
      });
    }

    req.planLimits = {
      ...req.planLimits,
      customersUsed: customerCount,
      customersRemaining: maxCustomers - customerCount,
      maxCustomers: maxCustomers
    };

    next();
  } catch (error) {
    console.error('Check customer limit error:', error);
    next();
  }
};

/**
 * Get current plan usage stats for a tenancy
 */
const getPlanUsage = async (tenancyId) => {
  try {
    const tenancy = await Tenancy.findById(tenancyId);
    if (!tenancy) return null;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [orderCount, staffCount, branchCount, customerCount] = await Promise.all([
      Order.countDocuments({ tenancy: tenancyId, createdAt: { $gte: startOfMonth } }),
      User.countDocuments({ tenancy: tenancyId, role: { $in: ['staff', 'driver', 'branch_manager'] }, isActive: true }),
      Branch.countDocuments({ tenancy: tenancyId, isActive: true }),
      User.countDocuments({ tenancy: tenancyId, role: 'customer', isActive: true })
    ]);

    const features = tenancy.subscription?.features || {};

    return {
      plan: tenancy.subscription?.plan || 'free',
      orders: {
        used: orderCount,
        max: features.maxOrders || 100,
        remaining: (features.maxOrders || 100) === -1 ? 'Unlimited' : Math.max(0, (features.maxOrders || 100) - orderCount)
      },
      staff: {
        used: staffCount,
        max: features.maxStaff || 5,
        remaining: (features.maxStaff || 5) === -1 ? 'Unlimited' : Math.max(0, (features.maxStaff || 5) - staffCount)
      },
      branches: {
        used: branchCount,
        max: features.maxBranches || 1,
        remaining: (features.maxBranches || 1) === -1 ? 'Unlimited' : Math.max(0, (features.maxBranches || 1) - branchCount)
      },
      customers: {
        used: customerCount,
        max: features.maxCustomers || 500,
        remaining: (features.maxCustomers || 500) === -1 ? 'Unlimited' : Math.max(0, (features.maxCustomers || 500) - customerCount)
      }
    };
  } catch (error) {
    console.error('Get plan usage error:', error);
    return null;
  }
};

module.exports = {
  checkOrderLimit,
  checkStaffLimit,
  checkBranchLimit,
  checkCustomerLimit,
  getPlanUsage
};
