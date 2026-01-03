const express = require('express')
const router = express.Router()
const {
  getBranchServices,
  bulkAssignServices
} = require('../../controllers/admin/serviceController')
const { protect, restrictTo } = require('../../middlewares/auth')

// All routes require authentication
router.use(protect)

// Get services for a specific branch
router.get('/:branchId/services', 
  restrictTo('admin', 'superadmin'), 
  getBranchServices
)

// Bulk assign services to branch
router.post('/:branchId/services/bulk', 
  restrictTo('admin', 'superadmin'), 
  bulkAssignServices
)

module.exports = router
