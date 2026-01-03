const express = require('express')
const router = express.Router()
const superAdminSettingsController = require('../controllers/superAdminSettingsController')
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple')
const { requirePermission, logAdminAction } = require('../middlewares/superAdminAuth')
const { body } = require('express-validator')

// Validation rules
const validateSettingsUpdate = [
  body('category')
    .isIn(['general', 'security', 'notifications', 'business', 'integrations'])
    .withMessage('Invalid settings category'),
  body('settings')
    .isObject()
    .withMessage('Settings must be an object')
]

const validateProfileUpdate = [
  body('name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Valid phone number is required'),
  body('avatar')
    .optional()
    .isURL()
    .withMessage('Avatar must be a valid URL')
]

const validatePasswordChange = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
]

// All routes require authentication and settings permission
router.use(authenticateSuperAdmin)
router.use(requirePermission('settings'))

// Get system settings
router.get('/system',
  logAdminAction('view_system_settings', 'settings'),
  superAdminSettingsController.getSystemSettings
)

// Update system settings
router.put('/system',
  validateSettingsUpdate,
  logAdminAction('update_system_settings', 'settings'),
  superAdminSettingsController.updateSystemSettings
)

// Get profile settings
router.get('/profile',
  logAdminAction('view_profile_settings', 'settings'),
  superAdminSettingsController.getProfileSettings
)

// Update profile
router.put('/profile',
  validateProfileUpdate,
  logAdminAction('update_profile', 'settings'),
  superAdminSettingsController.updateProfile
)

// Change password
router.post('/change-password',
  validatePasswordChange,
  logAdminAction('change_password', 'security'),
  superAdminSettingsController.changePassword
)

// Get system information
router.get('/system-info',
  logAdminAction('view_system_info', 'settings'),
  superAdminSettingsController.getSystemInfo
)

module.exports = router
