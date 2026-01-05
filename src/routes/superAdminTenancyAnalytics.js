const express = require('express');
const router = express.Router();
const tenancyAnalyticsController = require('../controllers/superAdmin/tenancyAnalyticsController');
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple');

// All routes require superadmin authentication
router.use(authenticateSuperAdmin);

// Platform-wide analytics
router.get('/platform', tenancyAnalyticsController.getPlatformAnalytics);

// Compare tenancies
router.post('/compare', tenancyAnalyticsController.compareTenancies);

// Single tenancy analytics
router.get('/:tenancyId', tenancyAnalyticsController.getTenancyAnalytics);

module.exports = router;
