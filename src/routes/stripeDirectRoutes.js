const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const {
  createDirectCheckout,
  createQuickCheckout,
  getPaymentSuccess,
  handleDirectStripeWebhook
} = require('../controllers/stripeDirectController');

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

// Custom URL validator that's more permissive for development
const isValidUrl = (value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
};

// Validation rules
const validateDirectCheckout = [
  body('planName')
    .notEmpty()
    .withMessage('Plan name is required')
    .isIn(['free', 'basic', 'pro', 'enterprise'])
    .withMessage('Invalid plan name'),
  body('billingCycle')
    .isIn(['monthly', 'yearly'])
    .withMessage('Billing cycle must be monthly or yearly'),
  body('successUrl')
    .custom(isValidUrl)
    .withMessage('Valid success URL is required'),
  body('cancelUrl')
    .custom(isValidUrl)
    .withMessage('Valid cancel URL is required')
];

const validateQuickCheckout = [
  ...validateDirectCheckout,
  body('customerInfo.name')
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters'),
  body('customerInfo.email')
    .isEmail()
    .withMessage('Valid email is required'),
  body('customerInfo.businessName')
    .isLength({ min: 2 })
    .withMessage('Business name must be at least 2 characters')
];

// POST /api/public/create-direct-checkout - Direct checkout without customer info
router.post('/create-direct-checkout', validateDirectCheckout, handleValidation, createDirectCheckout);

// POST /api/public/create-quick-checkout - Quick checkout with minimal customer info
router.post('/create-quick-checkout', validateQuickCheckout, handleValidation, createQuickCheckout);

// GET /api/public/payment-success/:sessionId - Get payment success details
router.get('/payment-success/:sessionId', getPaymentSuccess);

// POST /api/public/stripe-webhook - Webhook for direct payments
router.post('/stripe-webhook', express.raw({ type: 'application/json' }), handleDirectStripeWebhook);

module.exports = router;