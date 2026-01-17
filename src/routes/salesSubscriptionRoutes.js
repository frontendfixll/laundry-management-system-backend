const express = require('express');
const router = express.Router();
const salesSubscriptionController = require('../controllers/salesSubscriptionController');
const { authenticateSales, requireSalesPermission, logSalesAction } = require('../middlewares/salesAuth');
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

// All routes require sales authentication
router.use(authenticateSales);

// Get subscription statistics
router.get('/stats',
  requireSalesPermission('subscriptions', 'view'),
  logSalesAction('view_subscription_stats', 'subscriptions'),
  salesSubscriptionController.getSubscriptionStats
);

// Get expiring trials
router.get('/expiring-trials',
  requireSalesPermission('trials', 'view'),
  logSalesAction('view_expiring_trials', 'subscriptions'),
  salesSubscriptionController.getExpiringTrials
);

// Get available plans (MUST be before /:tenancyId route)
router.get('/plans',
  requireSalesPermission('plans', 'view'),
  logSalesAction('view_plans', 'plans'),
  salesSubscriptionController.getPlans
);

// Create custom plan (MUST be before /:tenancyId route)
router.post('/plans/custom',
  requireSalesPermission('plans', 'customPricing'),
  validateCustomPlan,
  logSalesAction('create_custom_plan', 'plans'),
  salesSubscriptionController.createCustomPlan
);

// Get all subscriptions
router.get('/',
  requireSalesPermission('subscriptions', 'view'),
  logSalesAction('view_subscriptions', 'subscriptions'),
  salesSubscriptionController.getSubscriptions
);

// Get single subscription (MUST be after specific routes like /plans)
router.get('/:tenancyId',
  requireSalesPermission('subscriptions', 'view'),
  logSalesAction('view_subscription', 'subscriptions'),
  salesSubscriptionController.getSubscription
);

// Assign plan to tenancy
router.post('/:tenancyId/assign-plan',
  requireSalesPermission('plans', 'assign'),
  validateAssignPlan,
  logSalesAction('assign_plan', 'subscriptions'),
  salesSubscriptionController.assignPlan
);

// Activate subscription
router.post('/:tenancyId/activate',
  requireSalesPermission('subscriptions', 'activate'),
  validateActivation,
  logSalesAction('activate_subscription', 'subscriptions'),
  salesSubscriptionController.activateSubscription
);

// Pause subscription
router.post('/:tenancyId/pause',
  requireSalesPermission('subscriptions', 'pause'),
  body('reason').optional().trim(),
  logSalesAction('pause_subscription', 'subscriptions'),
  salesSubscriptionController.pauseSubscription
);

// Upgrade subscription
router.post('/:tenancyId/upgrade',
  requireSalesPermission('subscriptions', 'upgrade'),
  validatePlanChange,
  logSalesAction('upgrade_subscription', 'subscriptions'),
  salesSubscriptionController.upgradeSubscription
);

// Downgrade subscription
router.post('/:tenancyId/downgrade',
  requireSalesPermission('subscriptions', 'downgrade'),
  validatePlanChange,
  logSalesAction('downgrade_subscription', 'subscriptions'),
  salesSubscriptionController.downgradeSubscription
);

// Extend trial
router.post('/:tenancyId/extend-trial',
  requireSalesPermission('trials', 'extend'),
  validateTrialExtension,
  logSalesAction('extend_subscription_trial', 'subscriptions'),
  salesSubscriptionController.extendTrial
);

module.exports = router;
