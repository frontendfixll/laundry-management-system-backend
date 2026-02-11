const express = require('express');
const router = express.Router();
const brandingController = require('../../controllers/laundryAdminBrandingController');
const { protect, restrictTo } = require('../../middlewares/auth');
const { body } = require('express-validator');

// Validation rules
const validateTheme = [
  body('theme.primaryColor')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Primary color must be a valid hex color'),
  body('theme.secondaryColor')
    .optional()
    .matches(/^#[0-9A-Fa-f]{6}$/)
    .withMessage('Secondary color must be a valid hex color'),
  body('theme.layout')
    .optional()
    .isIn(['modern', 'classic', 'minimal'])
    .withMessage('Invalid layout option')
];

// All routes require authentication
router.use(protect);

// Get branding - allow all authenticated tenant users
router.get('/branding', brandingController.getBranding);

// Update routes - restricted to admin, tenant_admin, tenant_owner, branch_admin (theme/branding is tenant-scoped)
router.use(restrictTo('admin', 'tenant_admin', 'tenant_owner', 'branch_admin'));

// Update branding
router.put('/branding', brandingController.updateBranding);

// Update logo
router.patch('/branding/logo', brandingController.updateLogo);

// Update theme
router.patch('/branding/theme', validateTheme, brandingController.updateTheme);

// Get settings
router.get('/settings', brandingController.getSettings);

// Update settings
router.put('/settings', brandingController.updateSettings);

// Get dashboard stats
router.get('/dashboard-stats', brandingController.getDashboardStats);

module.exports = router;
