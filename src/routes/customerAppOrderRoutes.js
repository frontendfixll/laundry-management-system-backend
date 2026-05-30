// Authenticated order endpoints for the customer app.
// Create / list / get — all require the customer's JWT.

const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const {
  createOrder,
  listMyOrders,
  getMyOrder
} = require('../controllers/marketplace/customerOrderController');

router.post('/', protect, createOrder);
router.get('/', protect, listMyOrders);
router.get('/:id', protect, getMyOrder);

module.exports = router;
