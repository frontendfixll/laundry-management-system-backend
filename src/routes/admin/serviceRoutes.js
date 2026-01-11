const express = require('express')
const router = express.Router()
const {
  getServices,
  getService,
  createService,
  updateService,
  deleteService
} = require('../../controllers/admin/serviceController')
const { protectAny, restrictTo } = require('../../middlewares/auth')

// All routes require authentication (protectAny accepts both user and superadmin tokens)
router.use(protectAny)

// Service CRUD routes (admin and branch_admin can manage services)
router.route('/')
  .get(restrictTo('admin', 'branch_admin', 'superadmin'), getServices)
  .post(restrictTo('admin', 'superadmin'), createService)

router.route('/:id')
  .get(restrictTo('admin', 'branch_admin', 'superadmin'), getService)
  .put(restrictTo('admin', 'branch_admin', 'superadmin'), updateService)
  .delete(restrictTo('superadmin'), deleteService)

module.exports = router
