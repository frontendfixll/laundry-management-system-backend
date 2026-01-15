const express = require('express');
const router = express.Router();
const { param, body, validationResult } = require('express-validator');
const {
  getPaymentLinkByToken,
  createStripeCheckout,
  verifyStripePayment,
  handleStripeWebhook
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
const validateToken = [
  param('token')
    .isLength({ min: 64, max: 64 })
    .withMessage('Invalid payment link')
];

const validateVerify = [
  param('token')
    .isLength({ min: 64, max: 64 })
    .withMessage('Invalid payment link'),
  body('sessionId')
    .notEmpty()
    .withMessage('Session ID is required')
];

// Stripe webhook - must be before express.json() middleware
// Note: This route needs raw body, handled in app.js
router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// GET /api/public/pay/:token - Get payment link details
router.get('/:token', validateToken, handleValidation, getPaymentLinkByToken);

// POST /api/public/pay/:token/create-checkout - Create Stripe checkout session
router.post('/:token/create-checkout', validateToken, handleValidation, createStripeCheckout);

// POST /api/public/pay/:token/verify - Verify payment after Stripe redirect
router.post('/:token/verify', validateVerify, handleValidation, verifyStripePayment);

module.exports = router;
