const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

// Controllers
const {
  getMarketplaceAddOns,
  getAddOnDetails,
  purchaseAddOn,
  getTenantAddOns,
  cancelAddOn,
  getAddOnUsageStats
} = require('../controllers/addOnController');

// Middleware
const { protect: auth } = require('../middlewares/auth');
const { checkAddOnEligibility, getTenantLimits } = require('../middlewares/addOnMiddleware');

// Validation rules
const purchaseValidation = [
  param('addOnId').isMongoId().withMessage('Invalid add-on ID'),
  body('billingCycle')
    .isIn(['monthly', 'yearly', 'one-time'])
    .withMessage('Invalid billing cycle'),
  body('quantity')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Quantity must be between 1 and 100'),
  body('paymentMethodId')
    .notEmpty()
    .withMessage('Payment method is required'),
  body('couponCode')
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage('Invalid coupon code'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('Metadata must be an object')
];

const cancelValidation = [
  param('tenantAddOnId').isMongoId().withMessage('Invalid tenant add-on ID'),
  body('reason')
    .optional()
    .isLength({ min: 5, max: 500 })
    .withMessage('Reason must be between 5 and 500 characters'),
  body('effectiveDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid effective date')
];

// Public routes (no auth required)
/**
 * @route GET /api/addons/marketplace
 * @desc Get marketplace add-ons (public for marketing site)
 * @access Public
 */
router.get('/marketplace', [
  query('category').optional().isIn(['capacity', 'feature', 'usage', 'branding', 'integration', 'support']),
  query('search').optional().isLength({ max: 100 }),
  query('sortBy').optional().isIn(['popular', 'price_low', 'price_high', 'newest', 'name']),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('page').optional().isInt({ min: 1 }),
  query('priceRange').optional().matches(/^\d+-\d+$/),
  query('features').optional().isLength({ max: 200 })
], getMarketplaceAddOns);

/**
 * @route GET /api/addons/:addOnId
 * @desc Get add-on details
 * @access Public
 */
router.get('/:addOnId', [
  param('addOnId').isMongoId().withMessage('Invalid add-on ID')
], getAddOnDetails);

// Protected routes (auth required)
/**
 * @route POST /api/addons/:addOnId/purchase
 * @desc Purchase add-on
 * @access Private (Tenant Admin)
 */
router.post('/:addOnId/purchase', 
  auth, 
  checkAddOnEligibility,
  purchaseValidation, 
  purchaseAddOn
);

/**
 * @route GET /api/addons/tenant/my-addons
 * @desc Get tenant's add-ons
 * @access Private (Tenant Admin)
 */
router.get('/tenant/my-addons', [
  auth,
  query('status').optional().isIn(['active', 'trial', 'suspended', 'cancelled', 'expired']),
  query('category').optional().isIn(['capacity', 'feature', 'usage', 'branding', 'integration', 'support']),
  query('includeUsage').optional().isBoolean()
], getTenantAddOns);

/**
 * @route POST /api/addons/tenant/:tenantAddOnId/cancel
 * @desc Cancel add-on
 * @access Private (Tenant Admin)
 */
router.post('/tenant/:tenantAddOnId/cancel', 
  auth, 
  cancelValidation, 
  cancelAddOn
);

/**
 * @route GET /api/addons/tenant/usage-stats
 * @desc Get add-on usage statistics
 * @access Private (Tenant Admin)
 */
router.get('/tenant/usage-stats', [
  auth,
  query('period').optional().isIn(['7d', '30d', '90d', '1y']),
  query('addOnId').optional().isMongoId()
], getAddOnUsageStats);

/**
 * @route GET /api/addons/tenant/limits
 * @desc Get tenant's effective limits including add-ons
 * @access Private (Tenant Admin)
 */
router.get('/tenant/limits', auth, getTenantLimits);

module.exports = router;