const express = require('express');
const router = express.Router();
const superAdminUsersController = require('../controllers/superAdminUsersController');
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple');
const { requirePermission } = require('../middlewares/superAdminAuth');

// All routes require authentication and users permission
router.use(authenticateSuperAdmin);
router.use(requirePermission('users'));

// Get all users
router.get('/', superAdminUsersController.getAllUsers);

// Create new user
router.post('/', superAdminUsersController.createUser);

// Get user by ID
router.get('/:userId', superAdminUsersController.getUserById);

// Update user status
router.patch('/:userId/status', superAdminUsersController.updateUserStatus);

// Update user role
router.patch('/:userId/role', superAdminUsersController.updateUserRole);

module.exports = router;
