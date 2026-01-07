const express = require('express');
const router = express.Router();
const bannerController = require('../../controllers/superAdmin/bannerController');
const { protectSuperAdmin } = require('../../middlewares/auth');

// Apply authentication and authorization middleware
router.use(protectSuperAdmin);

// Banner management routes
router.get('/', bannerController.getAllBanners);
router.post('/', bannerController.createGlobalBanner);
router.put('/:id', bannerController.updateBanner);
router.delete('/:id', bannerController.deleteBanner);

// Banner approval and status routes
router.patch('/:id/approve', bannerController.approveBanner);
router.patch('/:id/toggle-status', bannerController.toggleBannerStatus);
router.patch('/:id/disable', bannerController.disableBanner);

// Analytics route
router.get('/analytics/platform', bannerController.getPlatformAnalytics);

module.exports = router;
