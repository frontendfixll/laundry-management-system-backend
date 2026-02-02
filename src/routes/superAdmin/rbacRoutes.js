const express = require('express');
const router = express.Router();
const roleController = require('../../controllers/superAdmin/roleController');
const { authenticateSuperAdmin } = require('../../middlewares/superAdminAuthSimple');
const { requireSuperAdminPermission } = require('../../middlewares/rbacMiddleware');
const { body, param, query } = require('express-validator');

/**
 * Validation middleware
 */
const validateRoleCreation = [
  body('name')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('permissions')
    .isObject()
    .withMessage('Permissions must be an object'),
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Color must be a valid hex color code')
];

const validateRoleUpdate = [
  body('name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('permissions')
    .optional()
    .isObject()
    .withMessage('Permissions must be an object'),
  body('color')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Color must be a valid hex color code'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

const validateRoleAssignment = [
  body('superadminId')
    .isMongoId()
    .withMessage('Valid SuperAdmin ID is required'),
  body('roleIds')
    .isArray({ min: 1 })
    .withMessage('At least one role is required'),
  body('roleIds.*')
    .isMongoId()
    .withMessage('All role IDs must be valid')
];

const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
];

/**
 * All routes require SuperAdmin authentication
 */
router.use(authenticateSuperAdmin);

/**
 * GET /api/superadmin/rbac/roles
 * Get all roles with pagination and filters
 * Permission: superadmins.view
 */
router.get('/roles',
  validatePagination,
  requireSuperAdminPermission('superadmins', 'view'),
  (req, res) => roleController.getRoles(req, res)
);

/**
 * GET /api/superadmin/rbac/roles/:id
 * Get single role details
 * Permission: superadmins.view
 */
router.get('/roles/:id',
  param('id').isMongoId().withMessage('Valid role ID is required'),
  requireSuperAdminPermission('superadmins', 'view'),
  (req, res) => roleController.getRole(req, res)
);

/**
 * POST /api/superadmin/rbac/roles
 * Create new role
 * Permission: superadmins.create
 */
router.post('/roles',
  validateRoleCreation,
  requireSuperAdminPermission('superadmins', 'create'),
  (req, res) => roleController.createRole(req, res)
);

/**
 * PUT /api/superadmin/rbac/roles/:id
 * Update role
 * Permission: superadmins.update
 */
router.put('/roles/:id',
  param('id').isMongoId().withMessage('Valid role ID is required'),
  validateRoleUpdate,
  requireSuperAdminPermission('superadmins', 'update'),
  (req, res) => roleController.updateRole(req, res)
);

/**
 * DELETE /api/superadmin/rbac/roles/:id
 * Delete role
 * Permission: superadmins.delete
 */
router.delete('/roles/:id',
  param('id').isMongoId().withMessage('Valid role ID is required'),
  requireSuperAdminPermission('superadmins', 'delete'),
  (req, res) => roleController.deleteRole(req, res)
);

/**
 * GET /api/superadmin/rbac/superadmins
 * Get SuperAdmin users for role assignment
 * Permission: superadmins.view
 */
router.get('/superadmins',
  validatePagination,
  requireSuperAdminPermission('superadmins', 'view'),
  (req, res) => roleController.getSuperAdmins(req, res)
);

/**
 * POST /api/superadmin/rbac/assign
 * Assign roles to SuperAdmin
 * Permission: superadmins.update
 */
router.post('/assign',
  validateRoleAssignment,
  requireSuperAdminPermission('superadmins', 'update'),
  (req, res) => roleController.assignRoles(req, res)
);

module.exports = router;
