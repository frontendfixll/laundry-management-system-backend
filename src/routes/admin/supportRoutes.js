const express = require('express');
const { protect, requireAdmin, requirePermission } = require('../../middlewares/auth');
const { injectTenancyFromUser } = require('../../middlewares/tenancyMiddleware');
const {
  createSupportUser,
  getSupportUsers,
  getSupportUser,
  updateSupportUser,
  deleteSupportUser,
  resetSupportUserPassword,
  getSupportDashboard
} = require('../../controllers/admin/supportController');
const { validate, supportValidation } = require('../../utils/validators');

const router = express.Router();

// Apply authentication and tenancy injection
router.use(protect);
router.use(requireAdmin);
router.use(injectTenancyFromUser);

// Support dashboard
router.get('/dashboard', requirePermission('support', 'view'), getSupportDashboard);

// Support user management
router.get('/users', requirePermission('support', 'view'), getSupportUsers);
router.post('/users', requirePermission('support', 'create'), validate(supportValidation.createUser), createSupportUser);
router.get('/users/:userId', requirePermission('support', 'view'), getSupportUser);
router.put('/users/:userId', requirePermission('support', 'update'), validate(supportValidation.updateUser), updateSupportUser);
router.delete('/users/:userId', requirePermission('support', 'delete'), deleteSupportUser);
router.post('/users/:userId/reset-password', requirePermission('support', 'manage'), validate(supportValidation.resetPassword), resetSupportUserPassword);

module.exports = router;