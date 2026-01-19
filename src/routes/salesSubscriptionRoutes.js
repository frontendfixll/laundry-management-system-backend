const express = require('express');
const router = express.Router();
const salesSubscriptionController = require('../controllers/salesSubscriptionController');
const { authenticateSalesOrSuperAdmin, requireSalesOrSuperAdminPermission, logSalesOrSuperAdminAction } = require('../middlewares/salesOrSuperAdminAuth');
const { body, param } = require('express-validator');

// Validation rules
const validateAssignPlan = [
  body('planId').isMongoId().withMessage('Valid plan ID required'),
  body('billingCycle').optional().isIn(['monthly', 'yearly']).withMessage('Billing cycle must be monthly or yearly'),
  body('customPrice').optional().isObject(),
  body('trialDays').optional().isInt({ min: 0, max: 90 }).withMessage('Trial days must be between 0 and 90')
];

const validateActivation = [
  body('startDate').optional().isISO8601().withMessage('Valid start date required'),
  body('endDate').optional().isISO8601().withMessage('Valid end date required')
];

const validatePlanChange = [
  body('planId').isMongoId().withMessage('Valid plan ID required')
];

const validateTrialExtension = [
  body('extensionDays').optional().isInt({ min: 1, max: 30 }).withMessage('Extension days must be between 1 and 30')
];

const validateCustomPlan = [
  body('displayName').trim().isLength({ min: 2 }).withMessage('Display name is required'),
  body('description').optional().trim(),
  body('price').isObject().withMessage('Price object required'),
  body('price.monthly').isFloat({ min: 0 }).withMessage('Monthly price must be a positive number'),
  body('price.yearly').isFloat({ min: 0 }).withMessage('Yearly price must be a positive number'),
  body('features').optional().isObject()
];

// All routes require sales or superadmin authentication
router.use(authenticateSalesOrSuperAdmin);

// Get subscription statistics
router.get('/stats',
  requireSalesOrSuperAdminPermission('subscriptions', 'view'),
  logSalesOrSuperAdminAction('view_subscription_stats', 'subscriptions'),
  salesSubscriptionController.getSubscriptionStats
);

// Get expiring trials
router.get('/expiring-trials',
  requireSalesOrSuperAdminPermission('trials', 'view'),
  logSalesOrSuperAdminAction('view_expiring_trials', 'subscriptions'),
  salesSubscriptionController.getExpiringTrials
);

// Get available plans (MUST be before /:tenancyId route)
router.get('/plans',
  requireSalesOrSuperAdminPermission('plans', 'view'),
  logSalesOrSuperAdminAction('view_plans', 'plans'),
  salesSubscriptionController.getPlans
);

// Create custom plan (MUST be before /:tenancyId route)
router.post('/plans/custom',
  requireSalesOrSuperAdminPermission('plans', 'customPricing'),
  validateCustomPlan,
  logSalesOrSuperAdminAction('create_custom_plan', 'plans'),
  salesSubscriptionController.createCustomPlan
);

// Get all subscriptions
router.get('/',
  requireSalesOrSuperAdminPermission('subscriptions', 'view'),
  logSalesOrSuperAdminAction('view_subscriptions', 'subscriptions'),
  salesSubscriptionController.getSubscriptions
);

// Get single subscription (MUST be after specific routes like /plans)
router.get('/:tenancyId',
  requireSalesOrSuperAdminPermission('subscriptions', 'view'),
  logSalesOrSuperAdminAction('view_subscription', 'subscriptions'),
  salesSubscriptionController.getSubscription
);

// Assign plan to tenancy
router.post('/:tenancyId/assign-plan',
  requireSalesOrSuperAdminPermission('plans', 'assign'),
  validateAssignPlan,
  logSalesOrSuperAdminAction('assign_plan', 'subscriptions'),
  salesSubscriptionController.assignPlan
);

// Activate subscription
router.post('/:tenancyId/activate',
  requireSalesOrSuperAdminPermission('subscriptions', 'activate'),
  validateActivation,
  logSalesOrSuperAdminAction('activate_subscription', 'subscriptions'),
  salesSubscriptionController.activateSubscription
);

// Pause subscription
router.post('/:tenancyId/pause',
  requireSalesOrSuperAdminPermission('subscriptions', 'pause'),
  body('reason').optional().trim(),
  logSalesOrSuperAdminAction('pause_subscription', 'subscriptions'),
  salesSubscriptionController.pauseSubscription
);

// Upgrade subscription
router.post('/:tenancyId/upgrade',
  requireSalesOrSuperAdminPermission('subscriptions', 'upgrade'),
  validatePlanChange,
  logSalesOrSuperAdminAction('upgrade_subscription', 'subscriptions'),
  salesSubscriptionController.upgradeSubscription
);

// Downgrade subscription
router.post('/:tenancyId/downgrade',
  requireSalesOrSuperAdminPermission('subscriptions', 'downgrade'),
  validatePlanChange,
  logSalesOrSuperAdminAction('downgrade_subscription', 'subscriptions'),
  salesSubscriptionController.downgradeSubscription
);

// Extend trial
router.post('/:tenancyId/extend-trial',
  requireSalesOrSuperAdminPermission('trials', 'extend'),
  validateTrialExtension,
  logSalesOrSuperAdminAction('extend_subscription_trial', 'subscriptions'),
  salesSubscriptionController.extendTrial
);

module.exports = router;
