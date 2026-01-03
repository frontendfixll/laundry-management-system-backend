const { body, param, query } = require('express-validator')

// Login validation
const validateLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 1 })
    .withMessage('Password is required')
]

// MFA verification validation
const validateMFAVerification = [
  body('mfaToken')
    .isLength({ min: 1 })
    .withMessage('MFA token is required'),
  body('otp')
    .optional()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('OTP must be 6 digits'),
  body('backupCode')
    .optional()
    .isLength({ min: 8, max: 8 })
    .isAlphanumeric()
    .withMessage('Backup code must be 8 alphanumeric characters')
]

// Profile update validation
const validateProfileUpdate = [
  body('name')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Please provide a valid phone number'),
  body('avatar')
    .optional()
    .isURL()
    .withMessage('Avatar must be a valid URL')
]

// Password change validation
const validatePasswordChange = [
  body('currentPassword')
    .isLength({ min: 1 })
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must be at least 8 characters long and contain at least one lowercase letter, one uppercase letter, one number, and one special character'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Password confirmation does not match new password')
      }
      return true
    })
]

// MFA disable validation
const validateMFADisable = [
  body('password')
    .isLength({ min: 1 })
    .withMessage('Password is required to disable MFA')
]

// Admin creation validation (for initial setup)
const validateAdminCreation = [
  body('name')
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must be at least 8 characters long and contain at least one lowercase letter, one uppercase letter, one number, and one special character'),
  body('phone')
    .optional()
    .isMobilePhone('any')
    .withMessage('Please provide a valid phone number')
]

// Audit log query validation
const validateAuditQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('category')
    .optional()
    .isIn(['auth', 'orders', 'branches', 'users', 'finances', 'settings', 'system'])
    .withMessage('Invalid category'),
  query('riskLevel')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Invalid risk level'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date')
]

// Session management validation
const validateSessionAction = [
  param('sessionId')
    .isLength({ min: 64, max: 64 })
    .isHexadecimal()
    .withMessage('Invalid session ID format')
]

module.exports = {
  validateLogin,
  validateMFAVerification,
  validateProfileUpdate,
  validatePasswordChange,
  validateMFADisable,
  validateAdminCreation,
  validateAuditQuery,
  validateSessionAction
}