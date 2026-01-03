const express = require('express');
const router = express.Router();

// Import controllers
const {
  register,
  verifyEmail,
  resendVerificationEmail,
  login,
  getProfile,
  updateProfile,
  logout,
  verifyInvitation,
  acceptInvitation
} = require('../controllers/authController');

// Import middleware
const { protect } = require('../middlewares/auth');

// Import validation
const {
  registerValidation,
  loginValidation,
  emailVerificationValidation,
  profileUpdateValidation,
  validate
} = require('../utils/validation');

// Public routes
router.post('/register', validate(registerValidation), register);
router.post('/verify-email', validate(emailVerificationValidation), verifyEmail);
router.post('/resend-verification', resendVerificationEmail);
router.post('/login', validate(loginValidation), login);

// Invitation routes (public)
router.get('/invitation/:token', verifyInvitation);
router.post('/invitation/accept', acceptInvitation);

// Protected routes
router.use(protect); // All routes below require authentication

router.get('/profile', getProfile);
router.put('/profile', validate(profileUpdateValidation), updateProfile);
router.post('/logout', logout);

module.exports = router;