const express = require('express');
const { protect, requireAdmin } = require('../../middlewares/auth');
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
const { checkPermission } = require('../../middlewares/rbacMiddleware');

const router = express.Router();

// Apply authentication and tenancy injection
router.use(protect);
router.use(requireAdmin);
router.use(injectTenancyFromUser);

// Support dashboard
router.get('/dashboard', checkPermission('support', 'view'), getSupportDashboard);

// Support user management
router.get('/users', checkPermission('support', 'view'), getSupportUsers);
router.post('/users', checkPermission('support', 'create'), validate(supportValidation.createUser), createSupportUser);
router.get('/users/:userId', checkPermission('support', 'view'), getSupportUser);
router.put('/users/:userId', checkPermission('support', 'update'), validate(supportValidation.updateUser), updateSupportUser);
router.delete('/users/:userId', checkPermission('support', 'delete'), deleteSupportUser);
router.post('/users/:userId/reset-password', checkPermission('support', 'manage'), validate(supportValidation.resetPassword), resetSupportUserPassword);

module.exports = router;