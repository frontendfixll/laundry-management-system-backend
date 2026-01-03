/**
 * Public Routes - No authentication required
 * Used for order tracking via QR code scan
 */

const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const { sendSuccess, sendError, asyncHandler } = require('../utils/helpers');

// @desc    Track order by order number (public - for QR code scanning)
// @route   GET /api/orders/track/:orderNumber
// @access  Public
const trackOrder = asyncHandler(async (req, res) => {
  const { orderNumber } = req.params;

  if (!orderNumber) {
    return sendError(res, 'INVALID_ORDER', 'Order number is required', 400);
  }

  // Find order by orderNumber or barcode
  const order = await Order.findOne({
    $or: [
      { orderNumber: orderNumber.toUpperCase() },
      { barcode: orderNumber.toUpperCase() }
    ]
  })
    .populate('customer', 'name phone')
    .populate('branch', 'name')
    .select('-statusHistory -assignedStaff -internalNotes');

  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found', 404);
  }

  // Get order items
  const items = await OrderItem.find({ order: order._id })
    .select('itemType service quantity totalPrice');

  // Prepare public-safe response (limited info)
  const trackingInfo = {
    orderNumber: order.orderNumber,
    status: order.status,
    customer: {
      name: order.customer?.name || 'Customer',
      phone: order.customer?.phone ? 
        order.customer.phone.slice(0, 2) + '****' + order.customer.phone.slice(-4) : 'N/A'
    },
    items: items.map(item => ({
      itemType: item.itemType,
      service: item.service,
      quantity: item.quantity,
      totalPrice: item.totalPrice
    })),
    pricing: {
      subtotal: order.pricing?.subtotal || 0,
      deliveryCharge: order.pricing?.deliveryCharge || 0,
      expressCharge: order.pricing?.expressCharge || 0,
      discount: order.pricing?.discount || 0,
      total: order.pricing?.total || 0
    },
    pickupDate: order.pickupDate,
    estimatedDeliveryDate: order.estimatedDeliveryDate,
    pickupAddress: order.pickupAddress ? {
      addressLine1: order.pickupAddress.addressLine1,
      city: order.pickupAddress.city,
      pincode: order.pickupAddress.pincode
    } : null,
    isExpress: order.isExpress,
    paymentStatus: order.paymentStatus,
    branch: order.branch ? { name: order.branch.name } : null,
    createdAt: order.createdAt
  };

  sendSuccess(res, { order: trackingInfo }, 'Order found');
});

router.get('/track/:orderNumber', trackOrder);

module.exports = router;
