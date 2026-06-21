// Authenticated engagement endpoints for the customer app:
// notifications feed, loyalty summary, wallet, referral. All require the
// customer's JWT and are platform-level (not tenancy-scoped).

const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');

const { getNotifications, getLoyalty } = require('../controllers/marketplace/customerEngagementController');
const { getWallet } = require('../controllers/marketplace/customerWalletController');
const { getReferral } = require('../controllers/marketplace/customerReferralController');

router.get('/notifications', protect, getNotifications);
router.get('/loyalty', protect, getLoyalty);
router.get('/wallet', protect, getWallet);
router.get('/referral', protect, getReferral);

module.exports = router;
