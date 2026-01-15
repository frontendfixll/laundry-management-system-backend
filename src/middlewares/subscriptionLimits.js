const Tenancy = require('../models/Tenancy');

/**
 * Middleware to check subscription limits before creating resources
 * Usage: checkLimit('max_orders', Order, { tenancy: req.user.tenancy })
 */
const checkLimit = (limitKey, Model, queryBuilder) => {
  return async (req, res, next) => {
    try {
      const tenancyId = req.user?.tenancy;

      if (!tenancyId) {
        return res.status(400).json({
          success: false,
          message: 'Tenancy not found'
        });
      }

      // Get tenancy with subscription features
      const tenancy = await Tenancy.findById(tenancyId);

      if (!tenancy) {
        return res.status(400).json({
          success: false,
          message: 'Tenancy not found'
        });
      }

      // Get limit from subscription features
      const limit = tenancy.subscription?.features?.[limitKey];

      // If limit is -1 (unlimited) or not set, allow
      if (limit === -1 || limit === undefined) {
        return next();
      }

      // Build query to count existing resources
      const query = typeof queryBuilder === 'function' 
        ? queryBuilder(req) 
        : queryBuilder;

      // Count existing resources
      const currentCount = await Model.countDocuments(query);

      console.log(`🔍 Limit check for ${limitKey}:`, {
        limit,
        currentCount,
        canCreate: currentCount < limit
      });

      // Check if limit exceeded
      if (currentCount >= limit) {
        const limitNames = {
          max_orders: 'orders',
          max_branches: 'branches',
          max_staff: 'staff members',
          max_customers: 'customers'
        };

        const resourceName = limitNames[limitKey] || limitKey.replace('max_', '');

        return res.status(403).json({
          success: false,
          message: `${resourceName.charAt(0).toUpperCase() + resourceName.slice(1)} limit exceeded. Your plan allows ${limit} ${resourceName}. Please upgrade your plan to create more.`,
          limit: {
            feature: limitKey,
            max: limit,
            current: currentCount,
            exceeded: true
          }
        });
      }

      // Attach limit info to request for reference
      req.subscriptionLimit = {
        feature: limitKey,
        max: limit,
        current: currentCount,
        remaining: limit - currentCount
      };

      next();
    } catch (error) {
      console.error('Subscription limit check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to check subscription limits'
      });
    }
  };
};

/**
 * Check if a feature is enabled in subscription
 */
const checkFeature = (featureKey) => {
  return async (req, res, next) => {
    try {
      const tenancyId = req.user?.tenancy;

      if (!tenancyId) {
        return res.status(400).json({
          success: false,
          message: 'Tenancy not found'
        });
      }

      const tenancy = await Tenancy.findById(tenancyId);

      if (!tenancy) {
        return res.status(400).json({
          success: false,
          message: 'Tenancy not found'
        });
      }

      // Check if feature is enabled
      const isEnabled = tenancy.hasFeature(featureKey);

      if (!isEnabled) {
        return res.status(403).json({
          success: false,
          message: `This feature is not available in your current plan. Please upgrade to access ${featureKey.replace(/_/g, ' ')}.`,
          feature: featureKey,
          enabled: false
        });
      }

      next();
    } catch (error) {
      console.error('Feature check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to check feature availability'
      });
    }
  };
};

/**
 * Get current usage stats for a tenancy
 */
const getUsageStats = async (req, res) => {
  try {
    const tenancyId = req.user?.tenancy;

    if (!tenancyId) {
      return res.status(400).json({
        success: false,
        message: 'Tenancy not found'
      });
    }

    const tenancy = await Tenancy.findById(tenancyId);

    if (!tenancy) {
      return res.status(404).json({
        success: false,
        message: 'Tenancy not found'
      });
    }

    // Get all limits from subscription
    const features = tenancy.subscription?.features || {};
    const limits = {};

    // Extract limit features (those starting with max_)
    for (const [key, value] of Object.entries(features)) {
      if (key.startsWith('max_')) {
        limits[key] = {
          max: value === -1 ? 'Unlimited' : value,
          current: 0, // Will be populated below
          percentage: 0
        };
      }
    }

    // Get actual counts
    const Branch = require('../models/Branch');
    const User = require('../models/User');
    const Order = require('../models/Order');

    if (limits.max_branches) {
      const branchCount = await Branch.countDocuments({ 
        tenancy: tenancyId, 
        isActive: true 
      });
      limits.max_branches.current = branchCount;
      if (limits.max_branches.max !== 'Unlimited') {
        limits.max_branches.percentage = Math.round((branchCount / limits.max_branches.max) * 100);
      }
    }

    if (limits.max_staff) {
      const staffCount = await User.countDocuments({ 
        tenancy: tenancyId, 
        role: { $in: ['admin', 'branch_admin', 'staff'] },
        isActive: true 
      });
      limits.max_staff.current = staffCount;
      if (limits.max_staff.max !== 'Unlimited') {
        limits.max_staff.percentage = Math.round((staffCount / limits.max_staff.max) * 100);
      }
    }

    if (limits.max_customers) {
      const customerCount = await User.countDocuments({ 
        tenancy: tenancyId, 
        role: 'customer',
        isActive: true 
      });
      limits.max_customers.current = customerCount;
      if (limits.max_customers.max !== 'Unlimited') {
        limits.max_customers.percentage = Math.round((customerCount / limits.max_customers.max) * 100);
      }
    }

    if (limits.max_orders) {
      const orderCount = await Order.countDocuments({ 
        tenancy: tenancyId
      });
      limits.max_orders.current = orderCount;
      if (limits.max_orders.max !== 'Unlimited') {
        limits.max_orders.percentage = Math.round((orderCount / limits.max_orders.max) * 100);
      }
    }

    return res.json({
      success: true,
      data: {
        plan: tenancy.subscription?.plan || 'free',
        status: tenancy.subscription?.status || 'active',
        limits,
        features: Object.entries(features)
          .filter(([key]) => !key.startsWith('max_'))
          .reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
          }, {})
      }
    });
  } catch (error) {
    console.error('Get usage stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch usage statistics'
    });
  }
};

module.exports = {
  checkLimit,
  checkFeature,
  getUsageStats
};
