const express = require('express')
const router = express.Router()
const {
  getServices,
  getService,
  createService,
  updateService,
  deleteService,
  assignServiceToBranch,
  updateBranchService,
  removeServiceFromBranch,
  getBranchServices,
  bulkAssignServices
} = require('../../controllers/admin/serviceController')
const { protectAny, restrictTo } = require('../../middlewares/auth')

// All routes require authentication (protectAny accepts both user and superadmin tokens)
router.use(protectAny)

// Service CRUD routes (admin role handles branch management)
router.route('/')
  .get(restrictTo('admin', 'superadmin'), getServices)
  .post(restrictTo('admin', 'superadmin'), createService)

router.route('/:id')
  .get(restrictTo('admin', 'superadmin'), getService)
  .put(restrictTo('admin', 'superadmin'), updateService)
  .delete(restrictTo('superadmin'), deleteService)

// Branch assignment routes
router.route('/:id/branches')
  .post(restrictTo('admin', 'superadmin'), assignServiceToBranch)

router.route('/:id/branches/:branchId')
  .put(restrictTo('admin', 'superadmin'), updateBranchService)
  .delete(restrictTo('admin', 'superadmin'), removeServiceFromBranch)

module.exports = router
