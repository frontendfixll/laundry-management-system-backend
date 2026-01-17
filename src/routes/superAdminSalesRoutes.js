const express = require('express');
const router = express.Router();
const superAdminSalesController = require('../controllers/superAdminSalesController');
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple');
const { body } = require('express-validator');

// Validation rules
const validateSalesUserCreation = [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('phone').optional().trim().matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit phone number required'),
  body('employeeId').optional().trim(),
  body('designation').optional().trim(),
  body('permissions').optional().isObject()
];

const validateSalesUserUpdate = [
  body('name').optional().trim().isLength({ min: 2 }),
  body('phone').optional().trim().matches(/^[6-9]\d{9}$/),
  body('employeeId').optional().trim(),
  body('designation').optional().trim(),
  body('permissions').optional().isObject(),
  body('isActive').optional().isBoolean()
];

const validatePasswordReset = [
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
];

const validatePermissionsUpdate = [
  body('permissions').isObject().withMessage('Valid permissions object required')
];

const validatePerformanceUpdate = [
  body('target').optional().isFloat({ min: 0 }).withMessage('Target must be a positive number')
];

// All routes require superadmin authentication
router.use(authenticateSuperAdmin);

// Get sales statistics
router.get('/stats',
  superAdminSalesController.getSalesStats
);

// Get all sales users
router.get('/',
  superAdminSalesController.getSalesUsers
);

// Get single sales user
router.get('/:id',
  superAdminSalesController.getSalesUser
);

// Create sales user
router.post('/',
  validateSalesUserCreation,
  superAdminSalesController.createSalesUser
);

// Update sales user
router.put('/:id',
  validateSalesUserUpdate,
  superAdminSalesController.updateSalesUser
);

// Delete sales user
router.delete('/:id',
  superAdminSalesController.deleteSalesUser
);

// Reset password
router.post('/:id/reset-password',
  validatePasswordReset,
  superAdminSalesController.resetPassword
);

// Update permissions
router.put('/:id/permissions',
  validatePermissionsUpdate,
  superAdminSalesController.updatePermissions
);

// Update performance/target
router.put('/:id/performance',
  validatePerformanceUpdate,
  superAdminSalesController.updatePerformance
);

// Deactivate sales user
router.post('/:id/deactivate',
  superAdminSalesController.deactivateSalesUser
);

// Activate sales user
router.post('/:id/activate',
  superAdminSalesController.activateSalesUser
);

module.exports = router;
