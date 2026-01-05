const Tenancy = require('../models/Tenancy');

/**
 * Middleware to extract tenancy from subdomain/domain
 * This runs on customer-facing routes to identify which laundry they're accessing
 */
const extractTenancy = async (req, res, next) => {
  try {
    // Get domain from request
    const host = req.get('host') || '';
    const origin = req.get('origin') || '';
    
    // Try to extract subdomain
    let tenancyIdentifier = null;
    
    // Check for X-Tenancy-ID header (for API calls)
    if (req.headers['x-tenancy-id']) {
      tenancyIdentifier = req.headers['x-tenancy-id'];
      const tenancy = await Tenancy.findById(tenancyIdentifier);
      if (tenancy && tenancy.status === 'active') {
        req.tenancy = tenancy;
        req.tenancyId = tenancy._id;
        return next();
      }
    }
    
    // Check for X-Tenancy-Slug header
    if (req.headers['x-tenancy-slug']) {
      const tenancy = await Tenancy.findOne({ 
        slug: req.headers['x-tenancy-slug'],
        status: 'active'
      });
      if (tenancy) {
        req.tenancy = tenancy;
        req.tenancyId = tenancy._id;
        return next();
      }
    }
    
    // Extract from subdomain (e.g., quickwash.laundry-platform.com)
    const subdomain = host.split('.')[0];
    if (subdomain && subdomain !== 'www' && subdomain !== 'api' && subdomain !== 'admin') {
      const tenancy = await Tenancy.findByDomain(host);
      if (tenancy) {
        req.tenancy = tenancy;
        req.tenancyId = tenancy._id;
        return next();
      }
    }
    
    // No tenancy found - continue without (for public routes)
    next();
  } catch (error) {
    console.error('Tenancy extraction error:', error);
    next();
  }
};

/**
 * Middleware to require tenancy - fails if no tenancy found
 */
const requireTenancy = async (req, res, next) => {
  await extractTenancy(req, res, () => {
    if (!req.tenancy) {
      return res.status(400).json({
        success: false,
        message: 'Tenancy not found. Please access via your laundry portal.'
      });
    }
    next();
  });
};

/**
 * Middleware to inject tenancy from authenticated user
 * For admin routes where user is already authenticated
 */
const injectTenancyFromUser = async (req, res, next) => {
  try {
    // If user is authenticated and has tenancy (admin/staff users)
    if (req.user && req.user.tenancy) {
      const tenancy = await Tenancy.findById(req.user.tenancy);
      if (tenancy && tenancy.status === 'active') {
        req.tenancy = tenancy;
        req.tenancyId = tenancy._id;
      }
    }
    // Customers don't have tenancy field - they can order from any laundry
    // tenancyId for customers comes from request body/query when needed
    next();
  } catch (error) {
    console.error('Inject tenancy error:', error);
    next();
  }
};

/**
 * Middleware to check if tenancy subscription is active
 */
const checkTenancySubscription = async (req, res, next) => {
  if (!req.tenancy) {
    return next();
  }
  
  if (!req.tenancy.isSubscriptionActive()) {
    return res.status(403).json({
      success: false,
      message: 'Subscription expired. Please contact support to renew.',
      code: 'SUBSCRIPTION_EXPIRED'
    });
  }
  
  next();
};

/**
 * Helper to add tenancy filter to queries
 */
const addTenancyFilter = (query, tenancyId) => {
  if (tenancyId) {
    return { ...query, tenancy: tenancyId };
  }
  return query;
};

/**
 * Helper to add tenancy to new documents
 */
const addTenancyToDocument = (doc, tenancyId) => {
  if (tenancyId) {
    doc.tenancy = tenancyId;
  }
  return doc;
};

module.exports = {
  extractTenancy,
  requireTenancy,
  injectTenancyFromUser,
  checkTenancySubscription,
  addTenancyFilter,
  addTenancyToDocument
};
