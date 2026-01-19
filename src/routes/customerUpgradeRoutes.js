const express = require('express');
const router = express.Router();
const customerUpgradeController = require('../controllers/customerUpgradeController');
const { body, param } = require('express-validator');

// Validation rules
const validateCustomerUpgradeRequest = [
  body('tenancySlug').notEmpty().withMessage('Business identifier is required'),
  body('toPlanId').isMongoId().withMessage('Valid target plan ID required'),
  body('upgradeAmount').optional().isFloat({ min: 0 }).withMessage('Upgrade amount must be a positive number'),
  body('reason').optional().trim().isLength({ max: 500 }).withMessage('Reason cannot exceed 500 characters'),
  body('customerInfo.name').optional().trim().isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),
  body('customerInfo.email').optional().isEmail().withMessage('Valid email required'),
  body('customerInfo.phone').optional().trim().isLength({ max: 20 }).withMessage('Phone cannot exceed 20 characters')
];

// Get public tenancy data (no auth required)
router.get('/tenancy/:slug',
  param('slug').notEmpty().withMessage('Business slug is required'),
  customerUpgradeController.getPublicTenancy
);

// Create customer upgrade request (no auth required)
router.post('/upgrade-request',
  validateCustomerUpgradeRequest,
  customerUpgradeController.createCustomerUpgradeRequest
);

// Get customer upgrade status (no auth required)
router.get('/upgrade-status/:tenancySlug',
  param('tenancySlug').notEmpty().withMessage('Business slug is required'),
  customerUpgradeController.getCustomerUpgradeStatus
);

module.exports = router;