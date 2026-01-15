const express = require('express');
const { protect, requirePermission } = require('../../middlewares/auth');
const { injectTenancyFromUser } = require('../../middlewares/tenancyMiddleware');
const { param } = require('express-validator');
const roleController = require('../../controllers/admin/roleController');

const router = express.Router();

// Apply authentication and tenancy injection
router.use(protect);
router.use(injectTenancyFromUser);

// Get permission modules (for UI dropdown)
router.get('/modules', roleController.getPermissionModules);

// Initialize default roles (one-time setup)
router.post('/initialize', roleController.initializeDefaultRoles);

// CRUD routes
router.get('/', roleController.getRoles);

router.get('/:id', 
  param('id').isMongoId().withMessage('Invalid role ID'),
  roleController.getRole
);

router.post('/', roleController.createRole);

router.put('/:id',
  param('id').isMongoId().withMessage('Invalid role ID'),
  roleController.updateRole
);

router.delete('/:id',
  param('id').isMongoId().withMessage('Invalid role ID'),
  roleController.deleteRole
);

// User role assignment routes
router.get('/users/list', roleController.getUsersWithRoles);

router.put('/users/:userId/assign',
  param('userId').isMongoId().withMessage('Invalid user ID'),
  roleController.assignRoleToUser
);

module.exports = router;
