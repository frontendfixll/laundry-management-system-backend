const express = require('express');
const router = express.Router();
const tenancyController = require('../controllers/superAdminTenancyController');
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple');
const { requirePermission, logAdminAction } = require('../middlewares/superAdminAuth');
const { body, param } = require('express-validator');

// Validation rules
const validateTenancyCreation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Laundry name must be between 2 and 100 characters'),
  body('slug')
    .optional()
    .trim()
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Slug can only contain lowercase letters, numbers, and hyphens'),
  body('subdomain')
    .optional()
    .trim()
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Subdomain can only contain lowercase letters, numbers, and hyphens'),
  body('owner.name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Owner name must be between 2 and 50 characters'),
  body('owner.email')
    .trim()
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid owner email is required'),
  body('owner.phone')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Valid 10-digit Indian phone number is required (starting with 6-9)')
];

const validateTenancyUpdate = [
  body('name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Laundry name must be between 2 and 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters')
];

const validateBrandingUpdate = [
  body('branding.theme.primaryColor')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Primary color must be a valid hex color'),
  body('branding.theme.secondaryColor')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Secondary color must be a valid hex color')
];

const validateSubscriptionUpdate = [
  body('subscription.plan')
    .optional()
    .isIn(['free', 'basic', 'pro', 'enterprise'])
    .withMessage('Invalid subscription plan'),
  body('subscription.status')
    .optional()
    .isIn(['active', 'trial', 'expired', 'cancelled'])
    .withMessage('Invalid subscription status')
];

// All routes require superadmin authentication
router.use(authenticateSuperAdmin);

// Get tenancy stats
router.get('/stats',
  logAdminAction('view_tenancy_stats', 'tenancies'),
  tenancyController.getTenancyStats
);

// Get all tenancies
router.get('/',
  logAdminAction('view_tenancies', 'tenancies'),
  tenancyController.getAllTenancies
);

// Get single tenancy
router.get('/:id',
  param('id').isMongoId().withMessage('Valid tenancy ID is required'),
  logAdminAction('view_tenancy_details', 'tenancies'),
  tenancyController.getTenancyById
);

// Create new tenancy
router.post('/',
  validateTenancyCreation,
  logAdminAction('create_tenancy', 'tenancies'),
  tenancyController.createTenancy
);

// Update tenancy
router.put('/:id',
  param('id').isMongoId().withMessage('Valid tenancy ID is required'),
  validateTenancyUpdate,
  logAdminAction('update_tenancy', 'tenancies'),
  tenancyController.updateTenancy
);

// Update tenancy status
router.patch('/:id/status',
  param('id').isMongoId().withMessage('Valid tenancy ID is required'),
  body('status').isIn(['active', 'inactive', 'suspended', 'pending']).withMessage('Invalid status'),
  logAdminAction('update_tenancy_status', 'tenancies'),
  tenancyController.updateTenancyStatus
);

// Update tenancy branding
router.patch('/:id/branding',
  param('id').isMongoId().withMessage('Valid tenancy ID is required'),
  validateBrandingUpdate,
  logAdminAction('update_tenancy_branding', 'tenancies'),
  tenancyController.updateBranding
);

// Update subscription
router.patch('/:id/subscription',
  param('id').isMongoId().withMessage('Valid tenancy ID is required'),
  validateSubscriptionUpdate,
  logAdminAction('update_tenancy_subscription', 'tenancies'),
  tenancyController.updateSubscription
);

// Delete tenancy (soft delete)
router.delete('/:id',
  param('id').isMongoId().withMessage('Valid tenancy ID is required'),
  logAdminAction('delete_tenancy', 'tenancies'),
  tenancyController.deleteTenancy
);

module.exports = router;
