const express = require('express')
const router = express.Router()
const { sendError } = require('../../utils/helpers')
const { protect, restrictTo } = require('../../middlewares/auth')

// All routes require authentication
router.use(protect)

// Placeholder function for removed branch services functionality
const getBranchServices = (req, res) => {
  return sendError(res, 'FEATURE_REMOVED', 'Branch-specific service management has been removed. Services are now managed globally.', 400)
}

const bulkAssignServices = (req, res) => {
  return sendError(res, 'FEATURE_REMOVED', 'Branch-specific service assignment has been removed. Services are now managed globally.', 400)
}

// Get services for a specific branch (placeholder)
router.get('/:branchId/services', 
  restrictTo('admin', 'superadmin'), 
  getBranchServices
)

// Bulk assign services to branch (placeholder)
router.post('/:branchId/services/bulk', 
  restrictTo('admin', 'superadmin'), 
  bulkAssignServices
)

module.exports = router
