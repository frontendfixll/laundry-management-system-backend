const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const { sendSuccess, sendError } = require('../utils/helpers');
const { ORDER_STATUS } = require('../config/constants');

// @desc    Track order by order number (public - no auth required)
// @route   GET /api/public/track/:orderNumber
// @access  Public
const trackOrder = asyncHandler(async (req, res) => {
  const { orderNumber } = req.params;

  // Validate order number format (LP followed by 10 digits)
  if (!/^LP\d{10}$/.test(orderNumber)) {
    return sendError(res, 'INVALID_ORDER_NUMBER', 'Invalid order number format', 400);
  }

  // Find order with minimal sensitive data
  const order = await Order.findOne({ orderNumber })
    .populate('branch', 'name code address.city')
    .populate({
      path: 'items.service',
      select: 'name category'
    })
    .select('-customer.email -customer.phone -paymentDetails -__v');

  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found. Please check the order number.', 404);
  }

  // Generate status timeline
  const timeline = generateTimeline(order);

  // Prepare safe response data
  const trackingData = {
    orderNumber: order.orderNumber,
    barcode: order.barcode,
    status: order.status,
    statusLabel: getStatusLabel(order.status),
    
    // Customer info (limited for privacy)
    customer: {
      name: order.customer?.name?.split(' ')[0] || 'Customer', // First name only
    },

    // Items info
    items: order.items.map(item => ({
      service: item.service?.name || 'Service',
      category: item.service?.category || '',
      quantity: item.quantity,
      price: item.price,
      subtotal: item.quantity * item.price
    })),

    // Pricing
    pricing: {
      subtotal: order.pricing.subtotal,
      discount: order.pricing.discount,
      tax: order.pricing.tax,
      total: order.pricing.total
    },

    // Dates
    pickupDate: order.pickupDate,
    estimatedDeliveryDate: order.estimatedDeliveryDate,
    actualDeliveryDate: order.actualDeliveryDate,
    createdAt: order.createdAt,

    // Branch info (limited)
    branch: order.branch ? {
      name: order.branch.name,
      code: order.branch.code,
      city: order.branch.address?.city
    } : null,

    // Order type
    isExpress: order.isExpress,
    serviceType: order.serviceType,

    // Timeline
    timeline,

    // Current step in timeline
    currentStep: getCurrentStep(order.status)
  };

  sendSuccess(res, trackingData, 'Order details retrieved successfully');
});

// Helper: Generate timeline based on order status
function generateTimeline(order) {
  const timeline = [
    {
      status: ORDER_STATUS.PLACED,
      label: 'Order Placed',
      icon: 'check',
      completed: true,
      date: order.createdAt
    },
    {
      status: ORDER_STATUS.PICKED,
      label: 'Picked Up',
      icon: 'truck',
      completed: [ORDER_STATUS.PICKED, ORDER_STATUS.IN_PROCESS, ORDER_STATUS.READY, ORDER_STATUS.OUT_FOR_DELIVERY, ORDER_STATUS.DELIVERED].includes(order.status),
      date: order.pickupDate
    },
    {
      status: ORDER_STATUS.IN_PROCESS,
      label: 'In Process',
      icon: 'loader',
      completed: [ORDER_STATUS.IN_PROCESS, ORDER_STATUS.READY, ORDER_STATUS.OUT_FOR_DELIVERY, ORDER_STATUS.DELIVERED].includes(order.status),
      date: null
    },
    {
      status: ORDER_STATUS.READY,
      label: 'Ready for Delivery',
      icon: 'package',
      completed: [ORDER_STATUS.READY, ORDER_STATUS.OUT_FOR_DELIVERY, ORDER_STATUS.DELIVERED].includes(order.status),
      date: null
    },
    {
      status: ORDER_STATUS.OUT_FOR_DELIVERY,
      label: 'Out for Delivery',
      icon: 'truck',
      completed: [ORDER_STATUS.OUT_FOR_DELIVERY, ORDER_STATUS.DELIVERED].includes(order.status),
      date: null
    },
    {
      status: ORDER_STATUS.DELIVERED,
      label: 'Delivered',
      icon: 'check-circle',
      completed: order.status === ORDER_STATUS.DELIVERED,
      date: order.actualDeliveryDate
    }
  ];

  // Handle cancelled orders
  if (order.status === ORDER_STATUS.CANCELLED) {
    timeline.push({
      status: ORDER_STATUS.CANCELLED,
      label: 'Cancelled',
      icon: 'x-circle',
      completed: true,
      date: order.updatedAt
    });
  }

  return timeline;
}

// Helper: Get current step number
function getCurrentStep(status) {
  const steps = {
    [ORDER_STATUS.PLACED]: 1,
    [ORDER_STATUS.ASSIGNED_TO_BRANCH]: 1,
    [ORDER_STATUS.ASSIGNED_TO_LOGISTICS_PICKUP]: 1,
    [ORDER_STATUS.PICKED]: 2,
    [ORDER_STATUS.IN_PROCESS]: 3,
    [ORDER_STATUS.READY]: 4,
    [ORDER_STATUS.ASSIGNED_TO_LOGISTICS_DELIVERY]: 4,
    [ORDER_STATUS.OUT_FOR_DELIVERY]: 5,
    [ORDER_STATUS.DELIVERED]: 6,
    [ORDER_STATUS.CANCELLED]: 0
  };
  return steps[status] || 1;
}

// Helper: Get user-friendly status label
function getStatusLabel(status) {
  const labels = {
    [ORDER_STATUS.PLACED]: 'Order Placed',
    [ORDER_STATUS.ASSIGNED_TO_BRANCH]: 'Assigned to Branch',
    [ORDER_STATUS.ASSIGNED_TO_LOGISTICS_PICKUP]: 'Pickup Scheduled',
    [ORDER_STATUS.PICKED]: 'Picked Up',
    [ORDER_STATUS.IN_PROCESS]: 'In Process',
    [ORDER_STATUS.READY]: 'Ready for Delivery',
    [ORDER_STATUS.ASSIGNED_TO_LOGISTICS_DELIVERY]: 'Delivery Scheduled',
    [ORDER_STATUS.OUT_FOR_DELIVERY]: 'Out for Delivery',
    [ORDER_STATUS.DELIVERED]: 'Delivered',
    [ORDER_STATUS.CANCELLED]: 'Cancelled'
  };
  return labels[status] || status;
}

module.exports = {
  trackOrder
};
