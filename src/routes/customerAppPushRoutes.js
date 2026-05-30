// Customer-app push notification token registration.

const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const {
  registerToken,
  unregisterToken
} = require('../controllers/marketplace/pushController');

router.post('/register', protect, registerToken);
router.post('/unregister', protect, unregisterToken);

module.exports = router;
