const express = require('express');
const {
  createOrder,
  getOrders,
  getOrderById,
  cancelOrder,
  rateOrder,
  reorder,
  getOrderTracking
} = require('../../controllers/customer/orderController');
const { validate, orderValidation } = require('../../utils/validators');
const { checkOrderLimit } = require('../../middlewares/planLimits');

const router = express.Router();

// Check plan order limit before creating order
router.post('/', checkOrderLimit, validate(orderValidation.createOrder), createOrder);
router.get('/', getOrders);
router.get('/:orderId', getOrderById);
router.get('/:orderId/tracking', getOrderTracking);
router.put('/:orderId/cancel', cancelOrder);
router.put('/:orderId/rate', validate(orderValidation.rateOrder), rateOrder);
router.post('/:orderId/reorder', checkOrderLimit, reorder);

module.exports = router;