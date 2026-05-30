// Public marketplace routes for the customer-app (mobile).
// No authentication required — these endpoints are designed for anonymous discovery.

const express = require('express');
const router = express.Router();

const {
  getNearbyBranches,
  getBranchById,
  getBranchServices,
  getBranchReviews,
  getTenantBySlug
} = require('../../controllers/marketplace/branchDiscoveryController');

// Branch discovery
router.get('/branches/nearby', getNearbyBranches);
router.get('/branches/:id', getBranchById);
router.get('/branches/:id/services', getBranchServices);
router.get('/branches/:id/reviews', getBranchReviews);

// Tenant profile
router.get('/tenants/:slug', getTenantBySlug);

module.exports = router;
