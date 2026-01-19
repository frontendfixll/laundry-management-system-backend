const express = require('express');
const router = express.Router();
const upgradeController = require('../controllers/upgradeController');
const { authenticateSalesOrSuperAdmin, requireSalesOrSuperAdminPermission, logSalesOrSuperAdminAction } = require('../middlewares/salesOrSuperAdminAuth');
const { body, param } = require('express-validator');

// Validation rules
const validateUpgradeRequest = [
  body('tenancyId').isMongoId().withMessage('Valid tenancy ID required'),
  body('toPlanId').isMongoId().withMessage('Valid target plan ID required'),
  body('customPrice').optional().isFloat({ min: 0 }).withMessage('Custom price must be a positive number'),
  body('discount').optional().isFloat({ min: 0 }).withMessage('Discount must be a positive number'),
  body('discountReason').optional().trim().isLength({ max: 200 }).withMessage('Discount reason cannot exceed 200 characters'),
  body('paymentTerms.method').optional().isIn(['online', 'offline', 'installments']).withMessage('Invalid payment method'),
  body('paymentTerms.dueDate').optional().isISO8601().withMessage('Valid due date required'),
  body('paymentTerms.gracePeriod').optional().isInt({ min: 0, max: 90 }).withMessage('Grace period must be between 0 and 90 days'),
  body('customMessage').optional().trim().isLength({ max: 500 }).withMessage('Custom message cannot exceed 500 characters')
];

const validatePaymentRecord = [
  body('amount').isFloat({ min: 0.01 }).withMessage('Payment amount must be greater than 0'),
  body('method').optional().isIn(['online', 'offline', 'cash', 'bank_transfer', 'cheque', 'upi']).withMessage('Invalid payment method'),
  body('transactionId').optional().trim().isLength({ max: 100 }).withMessage('Transaction ID cannot exceed 100 characters'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
];

const validateReminder = [
  body('reminderType').optional().isIn(['payment_due', 'payment_overdue', 'upgrade_expiring', 'custom']).withMessage('Invalid reminder type'),
  body('customMessage').optional().trim().isLength({ max: 500 }).withMessage('Custom message cannot exceed 500 characters')
];

const validateDueDateExtension = [
  body('newDueDate').isISO8601().withMessage('Valid new due date required'),
  body('reason').optional().trim().isLength({ max: 200 }).withMessage('Reason cannot exceed 200 characters')
];

// All routes require sales or superadmin authentication
router.use(authenticateSalesOrSuperAdmin);

// Statistics route (must be before /:id routes)
router.get('/stats',
  requireSalesOrSuperAdminPermission('upgrades', 'view'),
  logSalesOrSuperAdminAction('view_upgrade_stats', 'upgrades'),
  upgradeController.getUpgradeStats
);

// Create upgrade request
router.post('/request',
  requireSalesOrSuperAdminPermission('upgrades', 'create'),
  validateUpgradeRequest,
  logSalesOrSuperAdminAction('create_upgrade_request', 'upgrades'),
  upgradeController.createUpgradeRequest
);

// Get all upgrade requests
router.get('/',
  requireSalesOrSuperAdminPermission('upgrades', 'view'),
  logSalesOrSuperAdminAction('view_upgrade_requests', 'upgrades'),
  upgradeController.getUpgradeRequests
);

// Get single upgrade request
router.get('/:id',
  param('id').isMongoId().withMessage('Valid upgrade request ID required'),
  requireSalesOrSuperAdminPermission('upgrades', 'view'),
  logSalesOrSuperAdminAction('view_upgrade_request', 'upgrades'),
  upgradeController.getUpgradeRequest
);

// Cancel upgrade request
router.delete('/:id',
  param('id').isMongoId().withMessage('Valid upgrade request ID required'),
  requireSalesOrSuperAdminPermission('upgrades', 'delete'),
  body('reason').optional().trim().isLength({ max: 200 }).withMessage('Reason cannot exceed 200 characters'),
  logSalesOrSuperAdminAction('cancel_upgrade_request', 'upgrades'),
  upgradeController.cancelUpgradeRequest
);

// Record payment
router.post('/:id/payment',
  param('id').isMongoId().withMessage('Valid upgrade request ID required'),
  requireSalesOrSuperAdminPermission('upgrades', 'payment'),
  validatePaymentRecord,
  logSalesOrSuperAdminAction('record_upgrade_payment', 'upgrades'),
  upgradeController.recordPayment
);

// Send reminder
router.post('/:id/remind',
  param('id').isMongoId().withMessage('Valid upgrade request ID required'),
  requireSalesOrSuperAdminPermission('upgrades', 'remind'),
  validateReminder,
  logSalesOrSuperAdminAction('send_upgrade_reminder', 'upgrades'),
  upgradeController.sendReminder
);

// Extend due date
router.post('/:id/extend',
  param('id').isMongoId().withMessage('Valid upgrade request ID required'),
  requireSalesOrSuperAdminPermission('upgrades', 'extend'),
  validateDueDateExtension,
  logSalesOrSuperAdminAction('extend_upgrade_due_date', 'upgrades'),
  upgradeController.extendDueDate
);

// Send email
router.post('/:id/send-email',
  param('id').isMongoId().withMessage('Valid upgrade request ID required'),
  requireSalesOrSuperAdminPermission('upgrades', 'remind'),
  logSalesOrSuperAdminAction('send_upgrade_email', 'upgrades'),
  upgradeController.sendUpgradeEmail
);

// Public route for customers to view upgrade request (no auth required)
router.get('/public/:id', 
  param('id').isMongoId().withMessage('Valid upgrade request ID required'),
  upgradeController.getPublicUpgradeRequest
);

// Stripe payment routes (public, no auth required)
router.post('/public/:id/create-payment-intent',
  param('id').isMongoId().withMessage('Valid upgrade request ID required'),
  upgradeController.createPaymentIntent
);

router.post('/public/:id/create-checkout-session',
  param('id').isMongoId().withMessage('Valid upgrade request ID required'),
  upgradeController.createCheckoutSession
);

// Stripe webhook (no auth required, verified by signature)
router.post('/stripe-webhook',
  express.raw({ type: 'application/json' }),
  upgradeController.handleStripeWebhook
);

module.exports = router;