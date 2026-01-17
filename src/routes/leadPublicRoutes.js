const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { createLead } = require('../controllers/leadController');

// Business types for validation (matching frontend form)
const BUSINESS_TYPES = ['small_laundry', 'chain', 'dry_cleaner', 'laundry', 'dry_cleaning', 'hotel', 'hospital', 'other'];

// Validation middleware
const validateLead = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .isLength({ min: 10, max: 15 })
    .withMessage('Phone number must be between 10 and 15 characters'),
  
  body('businessName')
    .trim()
    .notEmpty()
    .withMessage('Business name is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('Business name must be between 2 and 200 characters'),
  
  body('businessType')
    .trim()
    .notEmpty()
    .withMessage('Business type is required')
    .isIn(BUSINESS_TYPES)
    .withMessage('Invalid business type'),
  
  body('interestedPlan')
    .optional()
    .trim(),
  
  body('expectedMonthlyOrders')
    .optional()
    .trim(),
  
  body('currentBranches')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Current branches must be at least 1'),
  
  body('address')
    .optional(),
  
  body('source')
    .optional()
    .trim(),
  
  body('message')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Message must not exceed 1000 characters')
];

// Handle validation errors
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

// POST /api/public/leads - Create a new lead (no auth required)
router.post('/', validateLead, handleValidation, createLead);

module.exports = router;
