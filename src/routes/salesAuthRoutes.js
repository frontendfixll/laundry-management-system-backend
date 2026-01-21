const express = require('express');
const router = express.Router();
const salesAuthController = require('../controllers/salesAuthController');
const { authenticateSales } = require('../middlewares/salesAuth');
const { body } = require('express-validator');

// Validation middleware
const validateLogin = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const validateForgotPassword = [
  body('email').isEmail().withMessage('Valid email is required')
];

const validateResetPassword = [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
];

const validateChangePassword = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
];

const validateProfileUpdate = [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('phone').optional().trim().matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit phone number required')
];

// Public routes (no authentication required)

// Login
router.post('/login', 
  validateLogin,
  salesAuthController.login
);

// Forgot Password
router.post('/forgot-password',
  validateForgotPassword,
  salesAuthController.forgotPassword
);

// Reset Password
router.post('/reset-password',
  validateResetPassword,
  salesAuthController.resetPassword
);

// Protected routes (authentication required)
router.use(authenticateSales);

// Logout
router.post('/logout',
  salesAuthController.logout
);

// Logout from all devices
router.post('/logout-all',
  salesAuthController.logoutAll
);

// Get Profile
router.get('/profile',
  salesAuthController.getProfile
);

// Update Profile
router.put('/profile',
  validateProfileUpdate,
  salesAuthController.updateProfile
);

// Change Password
router.post('/change-password',
  validateChangePassword,
  salesAuthController.changePassword
);

// Refresh Session
router.post('/refresh-session',
  salesAuthController.refreshSession
);

// Get Team Members (for sales users to see their team)
router.get('/team',
  salesAuthController.getTeamMembers
);

module.exports = router;
