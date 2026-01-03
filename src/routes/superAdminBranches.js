const express = require('express')
const router = express.Router()
const superAdminBranchController = require('../controllers/superAdminBranchController')
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple')
const { requirePermission, logAdminAction } = require('../middlewares/superAdminAuth')
const { body, param, query } = require('express-validator')

// Validation rules
const validateBranchCreation = [
  body('name')
    .isLength({ min: 2, max: 100 })
    .withMessage('Branch name must be between 2 and 100 characters'),
  body('code')
    .isLength({ min: 3, max: 10 })
    .isAlphanumeric()
    .withMessage('Branch code must be 3-10 alphanumeric characters'),
  body('address.addressLine1')
    .isLength({ min: 5, max: 200 })
    .withMessage('Address line 1 is required'),
  body('address.city')
    .isLength({ min: 2, max: 50 })
    .withMessage('City is required'),
  body('address.state')
    .isLength({ min: 2, max: 50 })
    .withMessage('State is required'),
  body('address.pincode')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Pincode must be 6 digits'),
  body('contact.phone')
    .isMobilePhone('any')
    .withMessage('Valid phone number is required'),
  body('capacity.maxOrdersPerDay')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Max orders per day must be between 1 and 1000'),
  body('capacity.maxWeightPerDay')
    .optional()
    .isInt({ min: 50, max: 5000 })
    .withMessage('Max weight per day must be between 50 and 5000 kg')
]

const validateBranchUpdate = [
  body('name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Branch name must be between 2 and 100 characters'),
  body('address.city')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('City must be valid'),
  body('contact.phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Valid phone number is required')
]

const validateManagerAssignment = [
  body('managerId')
    .isMongoId()
    .withMessage('Valid manager ID is required')
]

const validateStaffAddition = [
  body('userId')
    .isMongoId()
    .withMessage('Valid user ID is required'),
  body('role')
    .isIn(['manager', 'assistant_manager', 'supervisor', 'staff', 'driver'])
    .withMessage('Valid role is required'),
  body('salary')
    .optional()
    .isNumeric()
    .withMessage('Salary must be a number')
]

// All routes require authentication and branches permission
router.use(authenticateSuperAdmin)
router.use(requirePermission('branches'))

// Get all branches
router.get('/',
  logAdminAction('view_branches', 'branches'),
  superAdminBranchController.getBranches
)

// Get single branch
router.get('/:branchId',
  param('branchId').isMongoId().withMessage('Valid branch ID is required'),
  logAdminAction('view_branch_details', 'branches'),
  superAdminBranchController.getBranch
)

// Create new branch
router.post('/',
  validateBranchCreation,
  logAdminAction('create_branch', 'branches'),
  superAdminBranchController.createBranch
)

// Update branch
router.put('/:branchId',
  param('branchId').isMongoId().withMessage('Valid branch ID is required'),
  validateBranchUpdate,
  logAdminAction('update_branch', 'branches'),
  superAdminBranchController.updateBranch
)

// Delete branch
router.delete('/:branchId',
  param('branchId').isMongoId().withMessage('Valid branch ID is required'),
  logAdminAction('delete_branch', 'branches'),
  superAdminBranchController.deleteBranch
)

// Assign manager (now assigns admin role user to branch)
router.post('/:branchId/manager',
  param('branchId').isMongoId().withMessage('Valid branch ID is required'),
  validateManagerAssignment,
  logAdminAction('assign_admin', 'branches'),  // Updated action name
  superAdminBranchController.assignManager
)

// Add staff
router.post('/:branchId/staff',
  param('branchId').isMongoId().withMessage('Valid branch ID is required'),
  validateStaffAddition,
  logAdminAction('add_branch_staff', 'branches'),
  superAdminBranchController.addStaff
)

// Remove staff
router.delete('/:branchId/staff/:userId',
  param('branchId').isMongoId().withMessage('Valid branch ID is required'),
  param('userId').isMongoId().withMessage('Valid user ID is required'),
  logAdminAction('remove_branch_staff', 'branches'),
  superAdminBranchController.removeStaff
)

// Get branch analytics
router.get('/:branchId/analytics',
  param('branchId').isMongoId().withMessage('Valid branch ID is required'),
  query('startDate').isISO8601().withMessage('Valid start date is required'),
  query('endDate').isISO8601().withMessage('Valid end date is required'),
  logAdminAction('view_branch_analytics', 'branches'),
  superAdminBranchController.getBranchAnalytics
)

module.exports = router