const Order = require('../../models/Order');
const OrderItem = require('../../models/OrderItem');
const User = require('../../models/User');
const Address = require('../../models/Address');
const Branch = require('../../models/Branch');
const NotificationService = require('../../services/notificationService');
const { sendEmail, sendEmailAsync, emailTemplates } = require('../../config/email');
const { 
  sendSuccess, 
  sendError, 
  asyncHandler, 
  calculateItemPrice, 
  calculateOrderTotal,
  calculateDeliveryDate,
  getPagination,
  formatPaginationResponse
} = require('../../utils/helpers');
const { ORDER_STATUS } = require('../../config/constants');

// @desc    Create new order
// @route   POST /api/customer/orders
// @access  Private (Customer)
const createOrder = asyncHandler(async (req, res) => {
  const {
    items,
    pickupAddressId,
    deliveryAddressId,
    pickupDate,
    pickupTimeSlot,
    paymentMethod,
    isExpress,
    specialInstructions,
    branchId,
    serviceType, // 'full_service', 'self_drop_self_pickup', 'self_drop_home_delivery', 'home_pickup_self_pickup'
    deliveryDetails
  } = req.body;

  const customer = await User.findById(req.user._id);
  
  // Determine which addresses are needed based on service type
  const needsPickupAddress = serviceType === 'full_service' || serviceType === 'home_pickup_self_pickup' || !serviceType;
  const needsDeliveryAddress = serviceType === 'full_service' || serviceType === 'self_drop_home_delivery' || !serviceType;
  
  let pickupAddress = null;
  let deliveryAddress = null;
  
  // Get pickup address if needed
  if (needsPickupAddress) {
    if (!pickupAddressId) {
      return sendError(res, 'ADDRESS_REQUIRED', 'Pickup address is required for this service type', 400);
    }
    pickupAddress = await Address.findOne({ _id: pickupAddressId, userId: req.user._id });
    if (!pickupAddress) {
      return sendError(res, 'ADDRESS_NOT_FOUND', 'Pickup address not found', 404);
    }
  }
  
  // Get delivery address if needed
  if (needsDeliveryAddress) {
    if (!deliveryAddressId) {
      return sendError(res, 'ADDRESS_REQUIRED', 'Delivery address is required for this service type', 400);
    }
    deliveryAddress = await Address.findOne({ _id: deliveryAddressId, userId: req.user._id });
    if (!deliveryAddress) {
      return sendError(res, 'ADDRESS_NOT_FOUND', 'Delivery address not found', 404);
    }
  }

  let branch;

  // If customer selected a branch, use that
  if (branchId) {
    branch = await Branch.findOne({ _id: branchId, isActive: true });
    if (!branch) {
      return sendError(res, 'BRANCH_NOT_FOUND', 'Selected branch not found or inactive', 404);
    }
  } else if (pickupAddress) {
    // Find available branch for pickup pincode (or use default branch if none found)
    branch = await Branch.findOne({
      'serviceAreas.pincode': pickupAddress.pincode,
      isActive: true
    });

    // If no branch found for pincode, get any active branch (for demo purposes)
    if (!branch) {
      branch = await Branch.findOne({ isActive: true });
    }

    // If still no branch, create a default one for demo
    if (!branch) {
      branch = await Branch.create({
        name: 'Main Branch',
        code: 'MAIN001',
        address: {
          addressLine1: 'Demo Address',
          city: pickupAddress.city,
          state: 'India',
          pincode: pickupAddress.pincode
        },
        contact: {
          phone: '9999999999',
          email: 'branch@demo.com'
        },
        serviceAreas: [{
          pincode: pickupAddress.pincode,
          deliveryCharge: 30,
          isActive: true
        }],
        isActive: true
      });
    }
  } else {
    // No pickup address and no branch selected - get any active branch
    branch = await Branch.findOne({ isActive: true });
    if (!branch) {
      return sendError(res, 'BRANCH_NOT_FOUND', 'No active branch available', 404);
    }
  }

  // Calculate pricing for each item
  const orderItems = [];
  let totalAmount = 0;

  for (const item of items) {
    const pricing = calculateItemPrice(item.itemType, item.service, item.category, isExpress);
    const itemTotal = pricing.unitPrice * item.quantity;
    totalAmount += itemTotal;

    orderItems.push({
      itemType: item.itemType,
      service: item.service,
      category: item.category,
      quantity: item.quantity,
      basePrice: pricing.basePrice,
      serviceMultiplier: pricing.serviceMultiplier,
      categoryMultiplier: pricing.categoryMultiplier,
      expressMultiplier: pricing.expressMultiplier,
      unitPrice: pricing.unitPrice,
      totalPrice: itemTotal,
      specialInstructions: item.specialInstructions || ''
    });
  }

  // Calculate order total
  // Use delivery charge from distance calculation if available, otherwise use branch service area charge
  let deliveryCharge = 0; // default - no delivery charge for self service
  
  // Only charge delivery if home delivery is involved
  if (needsDeliveryAddress || needsPickupAddress) {
    deliveryCharge = 30; // default delivery charge
    if (deliveryDetails && typeof deliveryDetails.deliveryCharge === 'number') {
      deliveryCharge = deliveryDetails.deliveryCharge;
    } else if (pickupAddress && branch.serviceAreas) {
      const serviceArea = branch.serviceAreas.find(area => area.pincode === pickupAddress.pincode);
      if (serviceArea) {
        deliveryCharge = serviceArea.deliveryCharge;
      }
    }
  }
  
  // Apply service type discount
  let serviceTypeDiscount = 0;
  if (serviceType === 'self_drop_self_pickup') {
    serviceTypeDiscount = Math.min(50, deliveryCharge); // Save up to ₹50
    deliveryCharge = 0; // No delivery charge
  } else if (serviceType === 'self_drop_home_delivery' || serviceType === 'home_pickup_self_pickup') {
    serviceTypeDiscount = Math.min(25, deliveryCharge * 0.5); // Save up to ₹25
    deliveryCharge = Math.max(0, deliveryCharge - serviceTypeDiscount);
  }
  
  const pricing = calculateOrderTotal(items, deliveryCharge, serviceTypeDiscount, 0.18); // 18% tax

  // Generate order number
  const orderCount = await Order.countDocuments();
  const orderNumber = `ORD${Date.now()}${String(orderCount + 1).padStart(4, '0')}`;

  // Create order
  const order = await Order.create({
    orderNumber,
    customer: req.user._id,
    branch: branch._id,
    serviceType: serviceType || 'full_service',
    pickupAddress: pickupAddress ? {
      name: pickupAddress.name,
      phone: pickupAddress.phone,
      addressLine1: pickupAddress.addressLine1,
      addressLine2: pickupAddress.addressLine2,
      landmark: pickupAddress.landmark,
      city: pickupAddress.city,
      pincode: pickupAddress.pincode
    } : null,
    deliveryAddress: deliveryAddress ? {
      name: deliveryAddress.name,
      phone: deliveryAddress.phone,
      addressLine1: deliveryAddress.addressLine1,
      addressLine2: deliveryAddress.addressLine2,
      landmark: deliveryAddress.landmark,
      city: deliveryAddress.city,
      pincode: deliveryAddress.pincode
    } : null,
    pickupDate: new Date(pickupDate),
    pickupTimeSlot,
    estimatedDeliveryDate: calculateDeliveryDate(pickupDate, isExpress),
    pricing,
    paymentMethod,
    isExpress,
    isVIPOrder: customer.isVIP,
    specialInstructions,
    // Save distance-based delivery details if provided
    deliveryDetails: deliveryDetails ? {
      distance: deliveryDetails.distance,
      deliveryCharge: deliveryDetails.deliveryCharge,
      isFallbackPricing: deliveryDetails.isFallbackPricing || false,
      calculatedAt: new Date()
    } : undefined,
    statusHistory: [{
      status: ORDER_STATUS.PLACED,
      updatedBy: req.user._id,
      updatedAt: new Date(),
      notes: 'Order placed by customer'
    }]
  });

  // Create order items
  const createdItems = [];
  for (const itemData of orderItems) {
    const orderItem = await OrderItem.create({
      order: order._id,
      ...itemData
    });
    createdItems.push(orderItem);
  }

  // Update order with item references
  order.items = createdItems.map(item => item._id);
  await order.save();

  // Update customer stats
  customer.totalOrders += 1;
  if (customer.isVIP) {
    customer.rewardPoints += Math.floor(pricing.total / 100); // 1 point per ₹100
  }
  await customer.save();

  // Populate order for response
  const populatedOrder = await Order.findById(order._id)
    .populate('items')
    .populate('branch', 'name code');

  // Create notification for customer
  try {
    await NotificationService.notifyOrderPlaced(req.user._id, order);
  } catch (error) {
    console.log('Failed to create notification:', error.message);
  }

  // Send order confirmation email to customer (ASYNC - non-blocking)
  try {
    const emailOptions = emailTemplates.orderConfirmation(populatedOrder, customer, createdItems);
    // Fire-and-forget: User doesn't wait for email
    sendEmailAsync(emailOptions);
    console.log('📧 Order confirmation email queued for:', customer.email);
  } catch (error) {
    console.log('⚠️ Email queuing error:', error.message);
  }

  sendSuccess(res, { order: populatedOrder }, 'Order created successfully', 201);
});

// @desc    Get customer orders
// @route   GET /api/customer/orders
// @access  Private (Customer)
const getOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit);

  const query = { customer: req.user._id };
  if (status) {
    query.status = status;
  }

  const total = await Order.countDocuments(query);
  const orders = await Order.find(query)
    .populate('branch', 'name code')
    .populate('items')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  const response = formatPaginationResponse(orders, total, pageNum, limitNum);
  sendSuccess(res, response, 'Orders retrieved successfully');
});

// @desc    Get order by ID
// @route   GET /api/customer/orders/:orderId
// @access  Private (Customer)
const getOrderById = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findOne({
    _id: orderId,
    customer: req.user._id
  })
    .populate('branch', 'name code address contact')
    .populate('items')
    .populate('logisticsPartner', 'companyName contactPerson')
    .populate('statusHistory.updatedBy', 'name role');

  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found', 404);
  }

  sendSuccess(res, { order }, 'Order retrieved successfully');
});

// @desc    Get order tracking
// @route   GET /api/customer/orders/:orderId/tracking
// @access  Private (Customer)
const getOrderTracking = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findOne({
    _id: orderId,
    customer: req.user._id
  })
    .select('orderNumber status statusHistory estimatedDeliveryDate actualDeliveryDate')
    .populate('statusHistory.updatedBy', 'name role');

  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found', 404);
  }

  sendSuccess(res, { 
    orderNumber: order.orderNumber,
    currentStatus: order.status,
    statusHistory: order.statusHistory,
    estimatedDeliveryDate: order.estimatedDeliveryDate,
    actualDeliveryDate: order.actualDeliveryDate
  }, 'Order tracking retrieved successfully');
});

// @desc    Cancel order
// @route   PUT /api/customer/orders/:orderId/cancel
// @access  Private (Customer)
const cancelOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { reason } = req.body;

  const order = await Order.findOne({
    _id: orderId,
    customer: req.user._id
  });

  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found', 404);
  }

  if (!order.canBeCancelled()) {
    return sendError(res, 'CANNOT_CANCEL', 'Order cannot be cancelled at this stage', 400);
  }

  // Update order status
  await order.updateStatus(ORDER_STATUS.CANCELLED, req.user._id, reason || 'Cancelled by customer');
  
  order.isCancelled = true;
  order.cancellationReason = reason || 'Cancelled by customer';
  order.cancelledBy = req.user._id;
  order.cancelledAt = new Date();
  
  await order.save();

  sendSuccess(res, { order }, 'Order cancelled successfully');
});

// @desc    Rate order
// @route   PUT /api/customer/orders/:orderId/rate
// @access  Private (Customer)
const rateOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { score, feedback } = req.body;

  const order = await Order.findOne({
    _id: orderId,
    customer: req.user._id,
    status: ORDER_STATUS.DELIVERED
  });

  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found or not delivered yet', 404);
  }

  if (order.rating.score) {
    return sendError(res, 'ALREADY_RATED', 'Order has already been rated', 400);
  }

  order.rating = {
    score,
    feedback: feedback || '',
    ratedAt: new Date()
  };

  await order.save();

  sendSuccess(res, { rating: order.rating }, 'Order rated successfully');
});

// @desc    Reorder (duplicate previous order)
// @route   POST /api/customer/orders/:orderId/reorder
// @access  Private (Customer)
const reorder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const originalOrder = await Order.findOne({
    _id: orderId,
    customer: req.user._id
  }).populate('items');

  if (!originalOrder) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Original order not found', 404);
  }

  // Create reorder data
  const reorderData = {
    items: originalOrder.items.map(item => ({
      itemType: item.itemType,
      service: item.service,
      category: item.category,
      quantity: item.quantity,
      specialInstructions: item.specialInstructions
    })),
    pickupAddressId: null, // Will need to be provided by frontend
    deliveryAddressId: null, // Will need to be provided by frontend
    pickupDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
    pickupTimeSlot: '09:00-11:00', // Default slot
    paymentMethod: originalOrder.paymentMethod,
    isExpress: originalOrder.isExpress,
    specialInstructions: originalOrder.specialInstructions
  };

  sendSuccess(res, { reorderData }, 'Reorder data prepared successfully');
});

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  getOrderTracking,
  cancelOrder,
  rateOrder,
  reorder
};