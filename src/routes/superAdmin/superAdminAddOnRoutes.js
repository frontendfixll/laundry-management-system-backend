const express = require('express');
const { body, param, query } = require('express-validator');
const router = express.Router();

// Controllers
const {
  getAllAddOns,
  getAddOn,
  createAddOn,
  updateAddOn,
  deleteAddOn,
  getAddOnAnalytics,
  assignAddOnToTenant,
  getAddOnSubscribers,
  getAddOnCategories
} = require('../../controllers/superAdmin/superAdminAddOnController');

// Middleware
const { authenticateSuperAdmin } = require('../../middlewares/superAdminAuth');

// Validation rules
const createAddOnValidation = [
  body('name')
    .notEmpty()
    .isLength({ min: 3, max: 100 })
    .withMessage('Name must be between 3 and 100 characters'),
  body('displayName')
    .notEmpty()
    .isLength({ min: 3, max: 150 })
    .withMessage('Display name must be between 3 and 150 characters'),
  body('description')
    .notEmpty()
    .isLength({ min: 10, max: 500 })
    .withMessage('Description must be between 10 and 500 characters'),
  body('category')
    .isIn(['capacity', 'feature', 'usage', 'branding', 'integration', 'support'])
    .withMessage('Invalid category'),
  body('billingCycle')
    .isIn(['monthly', 'yearly', 'one-time', 'usage-based'])
    .withMessage('Invalid billing cycle'),
  body('pricing')
    .isObject()
    .withMessage('Pricing must be an object'),
  body('pricing.monthly')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Monthly price must be a positive number'),
  body('pricing.yearly')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Yearly price must be a positive number'),
  body('pricing.oneTime')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('One-time price must be a positive number'),
  body('config')
    .isObject()
    .withMessage('Config must be an object'),
  body('status')
    .optional()
    .isIn(['draft', 'active', 'hidden', 'deprecated'])
    .withMessage('Invalid status'),
  body('maxQuantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Max quantity must be at least 1'),
  body('trialDays')
    .optional()
    .isInt({ min: 0, max: 365 })
    .withMessage('Trial days must be between 0 and 365'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('benefits')
    .optional()
    .isArray()
    .withMessage('Benefits must be an array'),
  body('features')
    .optional()
    .isArray()
    .withMessage('Features must be an array'),
  body('eligibility')
    .optional()
    .isObject()
    .withMessage('Eligibility must be an object'),
  body('showOnMarketplace')
    .optional()
    .isBoolean()
    .withMessage('showOnMarketplace must be a boolean'),
  body('showOnPricingPage')
    .optional()
    .isBoolean()
    .withMessage('showOnPricingPage must be a boolean'),
  body('isPopular')
    .optional()
    .isBoolean()
    .withMessage('isPopular must be a boolean'),
  body('isRecommended')
    .optional()
    .isBoolean()
    .withMessage('isRecommended must be a boolean'),
  body('isFeatured')
    .optional()
    .isBoolean()
    .withMessage('isFeatured must be a boolean')
];

const updateAddOnValidation = [
  param('addOnId').isMongoId().withMessage('Invalid add-on ID'),
  ...createAddOnValidation.map(rule => rule.optional())
];

const assignAddOnValidation = [
  param('addOnId').isMongoId().withMessage('Invalid add-on ID'),
  body('tenantId')
    .isMongoId()
    .withMessage('Invalid tenant ID'),
  body('billingCycle')
    .optional()
    .isIn(['monthly', 'yearly', 'one-time', 'usage-based'])
    .withMessage('Invalid billing cycle'),
  body('quantity')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Quantity must be between 1 and 100'),
  body('customPricing')
    .optional()
    .isObject()
    .withMessage('Custom pricing must be an object'),
  body('discount')
    .optional()
    .isObject()
    .withMessage('Discount must be an object'),
  body('discount.type')
    .if(body('discount').exists())
    .isIn(['percentage', 'fixed'])
    .withMessage('Discount type must be percentage or fixed'),
  body('discount.value')
    .if(body('discount').exists())
    .isFloat({ min: 0 })
    .withMessage('Discount value must be positive'),
  body('trialDays')
    .optional()
    .isInt({ min: 0, max: 365 })
    .withMessage('Trial days must be between 0 and 365'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters')
];

// Routes

/**
 * @route GET /api/superadmin/addons
 * @desc Get all add-ons
 * @access Private (Super Admin)
 */
router.get('/', [
  authenticateSuperAdmin,
  query('status').optional().isIn(['draft', 'active', 'hidden', 'deprecated']),
  query('category').optional().isIn(['capacity', 'feature', 'usage', 'branding', 'integration', 'support']),
  query('search').optional().isLength({ max: 100 }),
  query('sortBy').optional().isIn(['createdAt', 'name', 'category', 'status', 'analytics.purchases']),
  query('sortOrder').optional().isIn(['asc', 'desc']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('page').optional().isInt({ min: 1 })
], getAllAddOns);

/**
 * @route GET /api/superadmin/addons/categories
 * @desc Get add-on categories and statistics
 * @access Private (Super Admin)
 */
router.get('/categories', authenticateSuperAdmin, getAddOnCategories);

/**
 * @route GET /api/superadmin/addons/:addOnId
 * @desc Get single add-on by ID
 * @access Private (Super Admin)
 */
router.get('/:addOnId', [
  authenticateSuperAdmin,
  param('addOnId').isMongoId().withMessage('Invalid add-on ID')
], getAddOn);

/**
 * @route POST /api/superadmin/addons
 * @desc Create new add-on
 * @access Private (Super Admin)
 */
router.post('/', 
  authenticateSuperAdmin, 
  createAddOnValidation, 
  createAddOn
);

/**
 * @route PUT /api/superadmin/addons/:addOnId
 * @desc Update add-on
 * @access Private (Super Admin)
 */
router.put('/:addOnId', 
  authenticateSuperAdmin, 
  updateAddOnValidation, 
  updateAddOn
);

/**
 * @route DELETE /api/superadmin/addons/:addOnId
 * @desc Delete add-on (soft delete)
 * @access Private (Super Admin)
 */
router.delete('/:addOnId', [
  authenticateSuperAdmin,
  param('addOnId').isMongoId().withMessage('Invalid add-on ID')
], deleteAddOn);

/**
 * @route GET /api/superadmin/addons/:addOnId/analytics
 * @desc Get add-on analytics
 * @access Private (Super Admin)
 */
router.get('/:addOnId/analytics', [
  authenticateSuperAdmin,
  param('addOnId').isMongoId().withMessage('Invalid add-on ID'),
  query('period').optional().isIn(['7d', '30d', '90d', '1y'])
], getAddOnAnalytics);

/**
 * @route POST /api/superadmin/addons/:addOnId/assign
 * @desc Assign add-on to tenant
 * @access Private (Super Admin)
 */
router.post('/:addOnId/assign', 
  authenticateSuperAdmin, 
  assignAddOnValidation, 
  assignAddOnToTenant
);

/**
 * @route GET /api/superadmin/addons/:addOnId/subscribers
 * @desc Get add-on subscribers
 * @access Private (Super Admin)
 */
router.get('/:addOnId/subscribers', [
  authenticateSuperAdmin,
  param('addOnId').isMongoId().withMessage('Invalid add-on ID'),
  query('status').optional().isIn(['active', 'trial', 'suspended', 'cancelled', 'expired']),
  query('sortBy').optional().isIn(['createdAt', 'analytics.totalSpent']),
  query('sortOrder').optional().isIn(['asc', 'desc']),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('page').optional().isInt({ min: 1 })
], getAddOnSubscribers);

module.exports = router;