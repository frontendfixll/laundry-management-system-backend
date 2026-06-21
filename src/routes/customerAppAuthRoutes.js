// Customer-app (mobile) authentication routes.
// /otp/send    — request OTP (custom SMS provider)
// /otp/verify  — verify OTP, return our JWT
// /firebase    — alternative: exchange Firebase ID token for our JWT
// /me          — fetch current customer's profile (requires our JWT)

const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const {
  firebaseLogin,
  me
} = require('../controllers/marketplace/customerAppAuthController');
const {
  sendOtp,
  verifyOtp
} = require('../controllers/marketplace/otpController');

router.post('/otp/send', sendOtp);
router.post('/otp/verify', verifyOtp);
router.post('/firebase', firebaseLogin);
router.get('/me', protect, me);

module.exports = router;
