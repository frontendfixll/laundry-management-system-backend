const express = require('express');
const router = express.Router();
const { body, param, validationResult } = require('express-validator');
const signupController = require('../controllers/signupController');

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
const initiateValidation = [
  body('businessName')
    .trim()
    .notEmpty().withMessage('Business name is required')
    .isLength({ max: 100 }).withMessage('Business name cannot exceed 100 characters'),
  body('ownerName')
    .trim()
    .notEmpty().withMessage('Owner name is required')
    .isLength({ max: 100 }).withMessage('Owner name cannot exceed 100 characters'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email'),
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone is required')
    .isLength({ min: 10, max: 15 }).withMessage('Phone must be 10-15 characters'),
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('planId')
    .notEmpty().withMessage('Plan is required')
    .isMongoId().withMessage('Invalid plan ID'),
  body('billingCycle')
    .optional()
    .isIn(['monthly', 'yearly']).withMessage('Billing cycle must be monthly or yearly')
];

const verifyValidation = [
  body('token')
    .notEmpty().withMessage('Token is required')
    .isLength({ min: 64, max: 64 }).withMessage('Invalid token'),
  body('sessionId')
    .notEmpty().withMessage('Session ID is required')
];

// POST /api/public/signup/initiate - Start signup flow
router.post('/initiate', initiateValidation, handleValidation, signupController.initiateSignup);

// POST /api/public/signup/verify - Verify payment and complete signup
router.post('/verify', verifyValidation, handleValidation, signupController.verifySignup);

// GET /api/public/signup/status/:token - Get signup status
router.get('/status/:token', signupController.getSignupStatus);

// POST /api/public/signup/webhook - Stripe webhook (raw body handled in app.js)
router.post('/webhook', express.raw({ type: 'application/json' }), signupController.handleStripeWebhook);

module.exports = router;
