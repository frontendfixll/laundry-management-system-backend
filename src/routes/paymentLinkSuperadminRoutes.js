const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple');
const {
  createPaymentLink,
  getPaymentLinks,
  getPaymentLinkById,
  cancelPaymentLink,
  getPaymentLinksForLead,
  markPaymentAsPaid
} = require('../controllers/paymentLinkController');

// Validation middleware
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// Validation rules
const validateCreatePaymentLink = [
  body('leadId')
    .isMongoId()
    .withMessage('Invalid lead ID'),
  body('plan')
    .isIn(['basic', 'pro', 'enterprise'])
    .withMessage('Plan must be basic, pro, or enterprise'),
  body('billingCycle')
    .optional()
    .isIn(['monthly', 'yearly'])
    .withMessage('Billing cycle must be monthly or yearly'),
  body('discount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Discount must be a positive number'),
  body('customAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Custom amount must be a positive number'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must not exceed 500 characters')
];

const validateMarkPaid = [
  param('id')
    .isMongoId()
    .withMessage('Invalid payment link ID'),
  body('paymentMethod')
    .optional()
    .isIn(['cash', 'bank_transfer', 'upi', 'cheque', 'manual'])
    .withMessage('Invalid payment method'),
  body('transactionId')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Transaction ID must not exceed 100 characters'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must not exceed 500 characters')
];

const validateGetPaymentLinks = [
  query('status')
    .optional()
    .isIn(['pending', 'paid', 'expired', 'cancelled'])
    .withMessage('Invalid status'),
  query('leadId')
    .optional()
    .isMongoId()
    .withMessage('Invalid lead ID'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

const validateId = [
  param('id')
    .isMongoId()
    .withMessage('Invalid ID')
];

const validateLeadId = [
  param('leadId')
    .isMongoId()
    .withMessage('Invalid lead ID')
];

// All routes require superadmin authentication
router.use(authenticateSuperAdmin);

// POST /api/superadmin/payment-links - Create payment link
router.post('/', validateCreatePaymentLink, handleValidation, createPaymentLink);

// GET /api/superadmin/payment-links - List all payment links
router.get('/', validateGetPaymentLinks, handleValidation, getPaymentLinks);

// GET /api/superadmin/payment-links/:id - Get payment link by ID
router.get('/:id', validateId, handleValidation, getPaymentLinkById);

// POST /api/superadmin/payment-links/:id/cancel - Cancel payment link
router.post('/:id/cancel', validateId, handleValidation, cancelPaymentLink);

// POST /api/superadmin/payment-links/:id/mark-paid - Mark as paid (offline payment)
router.post('/:id/mark-paid', validateMarkPaid, handleValidation, markPaymentAsPaid);

// GET /api/superadmin/leads/:leadId/payment-links - Get payment links for a lead
router.get('/lead/:leadId', validateLeadId, handleValidation, getPaymentLinksForLead);

module.exports = router;
