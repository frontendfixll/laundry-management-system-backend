const express = require('express');
const { protect, requireEmailVerification } = require('../../middlewares/auth');
const { injectTenancyFromUser } = require('../../middlewares/tenancyMiddleware');
const { checkOrderLimit } = require('../../middlewares/planLimits');
const {
  getAddresses,
  getAddress,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress
} = require('../../controllers/addressController');
const {
  createOrder,
  getOrders,
  getOrderById,
  getOrderTracking,
  cancelOrder,
  rateOrder,
  reorder
} = require('../../controllers/customer/orderController');
const {
  getNotifications,
  markNotificationsAsRead,
  markAllNotificationsAsRead,
  getUnreadCount
} = require('../../controllers/customer/notificationController');
const {
  createTicket,
  getTickets,
  getTicketById,
  addMessage,
  getCategories,
  submitFeedback
} = require('../../controllers/customer/ticketController');
const {
  validateCoupon,
  getAvailableCoupons,
  removeCoupon
} = require('../../controllers/customer/couponController');
const {
  getLoyaltyBalance,
  getLoyaltyTransactions,
  enrollInLoyalty,
  redeemPoints,
  getAvailableRewards,
  getTierInfo
} = require('../../controllers/customer/loyaltyController');
const {
  getReferralCode,
  trackReferralShare,
  getReferralStats,
  applyReferralCode
} = require('../../controllers/customer/referralController');
const {
  getWalletBalance,
  getWalletTransactions,
  addMoneyToWallet
} = require('../../controllers/customer/walletController');
const {
  getApplicableDiscounts,
  getActiveDiscounts
} = require('../../controllers/customer/discountController');
const {
  getActiveCampaigns,
  getCampaignDetails,
  claimCampaignOffer
} = require('../../controllers/customer/campaignController');
const { addressValidation, validate } = require('../../utils/validation');

// Review routes
const reviewRoutes = require('./reviews');

const router = express.Router();

// Apply authentication and tenancy injection to all routes
router.use(protect);
router.use(injectTenancyFromUser);

// Address routes
router.route('/addresses')
  .get(getAddresses)
  .post(validate(addressValidation), addAddress);

router.route('/addresses/:id')
  .get(getAddress)
  .put(validate(addressValidation), updateAddress)
  .delete(deleteAddress);

router.put('/addresses/:id/set-default', setDefaultAddress);

// Order routes
router.route('/orders')
  .get(getOrders)
  .post(checkOrderLimit, createOrder);

router.get('/orders/:orderId', getOrderById);
router.get('/orders/:orderId/tracking', getOrderTracking);
router.put('/orders/:orderId/cancel', cancelOrder);
router.put('/orders/:orderId/rate', rateOrder);
router.post('/orders/:orderId/reorder', checkOrderLimit, reorder);

// Notification routes
router.get('/notifications', getNotifications);
router.get('/notifications/unread-count', getUnreadCount);
router.put('/notifications/mark-read', markNotificationsAsRead);
router.put('/notifications/mark-all-read', markAllNotificationsAsRead);

// Ticket/Support routes
router.get('/tickets/categories', getCategories);
router.route('/tickets')
  .get(getTickets)
  .post(createTicket);
router.get('/tickets/:ticketId', getTicketById);
router.post('/tickets/:ticketId/messages', addMessage);
router.post('/tickets/:ticketId/feedback', submitFeedback);

// Coupon routes
router.post('/coupons/validate', validateCoupon);
router.get('/coupons/available', getAvailableCoupons);
router.post('/coupons/remove', removeCoupon);

// Loyalty routes
router.get('/loyalty/balance', getLoyaltyBalance);
router.get('/loyalty/transactions', getLoyaltyTransactions);
router.post('/loyalty/enroll', enrollInLoyalty);
router.post('/loyalty/redeem', redeemPoints);
router.get('/loyalty/rewards', getAvailableRewards);
router.get('/loyalty/tier', getTierInfo);

// Referral routes
router.get('/referrals/code', getReferralCode);
router.post('/referrals/share', trackReferralShare);
router.get('/referrals/stats', getReferralStats);
router.post('/referrals/apply', applyReferralCode);

// Wallet routes
router.get('/wallet/balance', getWalletBalance);
router.get('/wallet/transactions', getWalletTransactions);
router.post('/wallet/add', addMoneyToWallet);

// Discount routes
router.post('/discounts/applicable', getApplicableDiscounts);
router.get('/discounts/active', getActiveDiscounts);

// Campaign routes
router.get('/campaigns/active', getActiveCampaigns);
router.get('/campaigns/:campaignId', getCampaignDetails);
router.post('/campaigns/:campaignId/claim', claimCampaignOffer);

// Review routes
router.use('/reviews', reviewRoutes);

// Profile route
router.get('/profile', (req, res) => {
  res.json({ success: true, message: 'Customer profile endpoint - coming soon' });
});

module.exports = router;