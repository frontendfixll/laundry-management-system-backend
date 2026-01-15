const express = require('express')
const router = express.Router()
const adminBranchController = require('../../controllers/admin/branchController')
const { injectTenancyFromUser } = require('../../middlewares/tenancyMiddleware')
const { checkLimit } = require('../../middlewares/subscriptionLimits')
const Branch = require('../../models/Branch')
const { body, param } = require('express-validator')

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

// All routes inherit authentication and tenancy injection from parent router
// No need to add middleware here as it's already applied in adminRoutes.js

// Get all branches for current tenancy
router.get('/', adminBranchController.getBranches)

// Get single branch
router.get('/:branchId',
  param('branchId').isMongoId().withMessage('Valid branch ID is required'),
  adminBranchController.getBranch
)

// Create new branch
router.post('/',
  validateBranchCreation,
  checkLimit('max_branches', Branch, (req) => ({ 
    tenancy: req.user.tenancy, 
    isActive: true 
  })),
  adminBranchController.createBranch
)

// Update branch
router.put('/:branchId',
  param('branchId').isMongoId().withMessage('Valid branch ID is required'),
  validateBranchUpdate,
  adminBranchController.updateBranch
)

// Delete/Deactivate branch
router.delete('/:branchId',
  param('branchId').isMongoId().withMessage('Valid branch ID is required'),
  adminBranchController.deleteBranch
)

module.exports = router