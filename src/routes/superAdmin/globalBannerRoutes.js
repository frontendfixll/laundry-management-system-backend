const express = require('express');
const router = express.Router();
const globalBannerController = require('../../controllers/superAdmin/globalBannerController');
const { protectSuperAdmin } = require('../../middlewares/auth');
const { upload } = require('../../services/imageUploadService');

// Apply super admin authentication to all routes
router.use(protectSuperAdmin);

// Image Upload (must be before other routes)
router.post('/upload-image', upload.single('image'), globalBannerController.uploadBannerImage);

// Global Banner Management
router.post('/global-banners', globalBannerController.createGlobalBanner);
router.get('/global-banners', globalBannerController.getGlobalBanners);
router.get('/all-banners', globalBannerController.getAllBanners);
router.get('/analytics/platform', globalBannerController.getPlatformAnalytics);
router.get('/banners/:id/analytics', globalBannerController.getBannerAnalytics);
router.put('/banners/:id', globalBannerController.updateBanner);
router.delete('/banners/:id', globalBannerController.deleteBanner);
router.patch('/banners/:id/state', globalBannerController.changeBannerState);
router.post('/banners/:id/emergency-disable', globalBannerController.emergencyDisable);

module.exports = router;
