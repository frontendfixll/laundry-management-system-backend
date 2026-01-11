const express = require('express');
const router = express.Router();
const {
  getBranchServices,
  updateBranchService,
  bulkUpdateBranchServices,
  toggleBranchService,
  getEnabledBranchServices
} = require('../../controllers/admin/branchServiceController');
const { protectAny, restrictTo } = require('../../middlewares/auth');
const { injectTenancyFromUser } = require('../../middlewares/tenancyMiddleware');
const { body, param } = require('express-validator');

// Validation rules
const validateBranchServiceUpdate = [
  param('branchId').isMongoId().withMessage('Valid branch ID is required'),
  param('serviceId').isMongoId().withMessage('Valid service ID is required'),
  body('isEnabled').optional().isBoolean().withMessage('isEnabled must be a boolean'),
  body('priceMultiplier').optional().isFloat({ min: 0.1, max: 10.0 }).withMessage('Price multiplier must be between 0.1 and 10.0'),
  body('isExpressAvailable').optional().isBoolean().withMessage('isExpressAvailable must be a boolean'),
  body('notes').optional().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
];

const validateBulkUpdate = [
  param('branchId').isMongoId().withMessage('Valid branch ID is required'),
  body('services').isArray().withMessage('Services must be an array'),
  body('services.*.serviceId').isMongoId().withMessage('Valid service ID is required for each service'),
  body('services.*.isEnabled').optional().isBoolean().withMessage('isEnabled must be a boolean'),
  body('services.*.priceMultiplier').optional().isFloat({ min: 0.1, max: 10.0 }).withMessage('Price multiplier must be between 0.1 and 10.0')
];

// Public route for customers to see enabled services (no authentication required)
router.get('/:branchId/services/enabled', getEnabledBranchServices);

// All other routes require authentication
router.use(protectAny);
router.use(injectTenancyFromUser);

// Admin routes (require admin, branch_admin, or superadmin role)
router.get('/:branchId/services', 
  restrictTo('admin', 'branch_admin', 'superadmin'), 
  getBranchServices
);

router.put('/:branchId/services/:serviceId', 
  restrictTo('admin', 'branch_admin', 'superadmin'),
  validateBranchServiceUpdate,
  updateBranchService
);

router.put('/:branchId/services/bulk', 
  restrictTo('admin', 'branch_admin', 'superadmin'),
  validateBulkUpdate,
  bulkUpdateBranchServices
);

router.patch('/:branchId/services/:serviceId/toggle', 
  restrictTo('admin', 'branch_admin', 'superadmin'),
  toggleBranchService
);

module.exports = router;