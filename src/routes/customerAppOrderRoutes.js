// Authenticated order endpoints for the customer app.
// Create / list / get — all require the customer's JWT.

const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const {
  createOrder,
  listMyOrders,
  getMyOrder,
  cancelOrder,
  validateOrderCoupon
} = require('../controllers/marketplace/customerOrderController');
const {
  createCheckoutSession,
  confirmPayment
} = require('../controllers/marketplace/paymentController');

router.post('/', protect, createOrder);
router.post('/validate-coupon', protect, validateOrderCoupon);
router.get('/', protect, listMyOrders);
router.get('/:id', protect, getMyOrder);
router.post('/:id/cancel', protect, cancelOrder);

// Payment (online via Stripe Checkout)
router.post('/:id/checkout-session', protect, createCheckoutSession);
router.post('/:id/confirm-payment', protect, confirmPayment);

module.exports = router;
