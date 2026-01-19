const express = require('express');
const router = express.Router();
const bannerApprovalController = require('../../controllers/superAdmin/bannerApprovalController');
const { protectSuperAdmin } = require('../../middlewares/auth');

// Apply super admin authentication to all routes
router.use(protectSuperAdmin);

// Banner Approval
router.get('/pending', bannerApprovalController.getPendingBanners);
router.get('/history', bannerApprovalController.getApprovalHistory);
router.get('/stats', bannerApprovalController.getApprovalStats);
router.get('/:id/review', bannerApprovalController.getBannerForReview);
router.post('/:id/approve', bannerApprovalController.approveBanner);
router.post('/:id/reject', bannerApprovalController.rejectBanner);
router.post('/bulk-approve', bannerApprovalController.bulkApproveBanners);

module.exports = router;
