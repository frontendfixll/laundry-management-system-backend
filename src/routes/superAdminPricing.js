const express = require('express')
const router = express.Router()
const superAdminPricingController = require('../controllers/superAdminPricingController')
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple')
const { requirePermission, logAdminAction } = require('../middlewares/superAdminAuth')
const { body, param, query } = require('express-validator')

// Validation rules
const validatePricingCreation = [
  body('name')
    .isLength({ min: 2, max: 100 })
    .withMessage('Pricing name must be between 2 and 100 characters'),
  body('version')
    .isLength({ min: 1, max: 20 })
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage('Version must contain only alphanumeric characters, dots, underscores, and hyphens'),
  body('serviceItems')
    .isArray({ min: 1 })
    .withMessage('At least one service item is required'),
  body('serviceItems.*.name')
    .isLength({ min: 1, max: 100 })
    .withMessage('Service item name is required'),
  body('serviceItems.*.category')
    .isIn(['wash_fold', 'dry_cleaning', 'iron_press', 'shoe_cleaning', 'additional'])
    .withMessage('Valid service category is required'),
  body('serviceItems.*.basePrice')
    .isFloat({ min: 0 })
    .withMessage('Base price must be a positive number'),
  body('serviceItems.*.unit')
    .isIn(['per_piece', 'per_kg', 'per_pair', 'per_set'])
    .withMessage('Valid unit is required')
]

const validatePricingUpdate = [
  body('name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Pricing name must be between 2 and 100 characters'),
  body('serviceItems.*.basePrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Base price must be a positive number')
]

const validatePriceCalculation = [
  body('items')
    .isArray({ min: 1 })
    .withMessage('Items array is required'),
  body('items.*.name')
    .isLength({ min: 1 })
    .withMessage('Item name is required'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer')
]

const validateDiscountCode = [
  body('code')
    .isLength({ min: 1, max: 50 })
    .withMessage('Discount code is required'),
  body('orderValue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Order value must be a positive number')
]

const validateClonePricing = [
  body('newVersion')
    .isLength({ min: 1, max: 20 })
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage('New version is required and must be valid'),
  body('newName')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('New name must be between 2 and 100 characters')
]

// All routes require authentication and settings permission
router.use(authenticateSuperAdmin)
router.use(requirePermission('settings'))

// Get all pricing configurations
router.get('/',
  logAdminAction('view_pricing_configurations', 'settings'),
  superAdminPricingController.getPricingConfigurations
)

// Get active pricing
router.get('/active',
  logAdminAction('view_active_pricing', 'settings'),
  superAdminPricingController.getActivePricing
)

// Get service items
router.get('/service-items',
  query('category')
    .optional()
    .isIn(['wash_fold', 'dry_cleaning', 'iron_press', 'shoe_cleaning', 'additional'])
    .withMessage('Invalid service category'),
  superAdminPricingController.getServiceItems
)

// Get discount policies
router.get('/discount-policies',
  superAdminPricingController.getDiscountPolicies
)

// Calculate price
router.post('/calculate',
  validatePriceCalculation,
  superAdminPricingController.calculatePrice
)

// Validate discount code
router.post('/validate-discount',
  validateDiscountCode,
  superAdminPricingController.validateDiscountCode
)

// Get single pricing configuration
router.get('/:pricingId',
  param('pricingId').isMongoId().withMessage('Valid pricing ID is required'),
  logAdminAction('view_pricing_configuration', 'settings'),
  superAdminPricingController.getPricingConfiguration
)

// Create new pricing configuration
router.post('/',
  validatePricingCreation,
  logAdminAction('create_pricing_configuration', 'settings'),
  superAdminPricingController.createPricingConfiguration
)

// Update pricing configuration
router.put('/:pricingId',
  param('pricingId').isMongoId().withMessage('Valid pricing ID is required'),
  validatePricingUpdate,
  logAdminAction('update_pricing_configuration', 'settings'),
  superAdminPricingController.updatePricingConfiguration
)

// Approve pricing configuration
router.post('/:pricingId/approve',
  param('pricingId').isMongoId().withMessage('Valid pricing ID is required'),
  body('makeActive')
    .optional()
    .isBoolean()
    .withMessage('Make active must be a boolean'),
  logAdminAction('approve_pricing_configuration', 'settings'),
  superAdminPricingController.approvePricingConfiguration
)

// Activate pricing configuration
router.post('/:pricingId/activate',
  param('pricingId').isMongoId().withMessage('Valid pricing ID is required'),
  logAdminAction('activate_pricing_configuration', 'settings'),
  superAdminPricingController.activatePricingConfiguration
)

// Clone pricing configuration
router.post('/:pricingId/clone',
  param('pricingId').isMongoId().withMessage('Valid pricing ID is required'),
  validateClonePricing,
  logAdminAction('clone_pricing_configuration', 'settings'),
  superAdminPricingController.clonePricingConfiguration
)

module.exports = router
