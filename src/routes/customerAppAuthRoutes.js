// Customer-app (mobile) authentication routes.
// /firebase  — exchange Firebase ID token (post-OTP) for our JWT
// /me        — fetch current customer's profile (requires our JWT)

const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const {
  firebaseLogin,
  me
} = require('../controllers/marketplace/customerAppAuthController');

router.post('/firebase', firebaseLogin);
router.get('/me', protect, me);

module.exports = router;
