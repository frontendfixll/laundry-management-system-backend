const express = require('express');
const router = express.Router();
const bannerController = require('../../controllers/admin/bannerController');
const { protect, restrictTo } = require('../../middlewares/auth');
const { upload } = require('../../services/imageUploadService');

// Apply authentication and authorization middleware
router.use(protect);
router.use(restrictTo('admin', 'ADMIN', 'OPERATIONS_ADMIN'));

// Banner CRUD routes
router.get('/', bannerController.getTenantBanners);
router.get('/:id', bannerController.getBannerById);
router.post('/', bannerController.createTenantBanner);
router.put('/:id', bannerController.updateTenantBanner);
router.delete('/:id', bannerController.deleteTenantBanner);

// Banner management routes
router.patch('/:id/toggle-status', bannerController.toggleBannerStatus);
router.get('/:id/analytics', bannerController.getBannerAnalytics);

// Image upload route (with multer middleware)
router.post('/upload-image', upload.single('image'), bannerController.uploadBannerImage);

module.exports = router;
