const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../../middlewares/auth');
const { injectTenancyFromUser } = require('../../middlewares/tenancyMiddleware');
const {
  getBranchAdmins,
  getBranchAdminById,
  createBranchAdmin,
  updateBranchAdmin,
  deleteBranchAdmin,
  reactivateBranchAdmin,
  updateBranchAdminPermissions
} = require('../../controllers/admin/branchAdminController');

// All routes require authentication and admin role (tenancy level)
router.use(protect);
router.use(restrictTo('admin'));
router.use(injectTenancyFromUser);

// Branch Admin CRUD routes - No granular permission check, admin role is sufficient
router.route('/')
  .get(getBranchAdmins)
  .post(createBranchAdmin);

router.route('/:id')
  .get(getBranchAdminById)
  .put(updateBranchAdmin)
  .delete(deleteBranchAdmin);

router.put('/:id/reactivate', reactivateBranchAdmin);
router.put('/:id/permissions', updateBranchAdminPermissions);

module.exports = router;
