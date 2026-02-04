const Order = require('../../models/Order');
const OrderItem = require('../../models/OrderItem');
const User = require('../../models/User');
const Address = require('../../models/Address');
const Branch = require('../../models/Branch');
const Coupon = require('../../models/Coupon');
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
    deliveryDetails,
    tenancyId, // Tenancy ID for tenant-specific orders
    couponCode // Coupon code to apply
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

  // Apply automatic discounts first
  const Discount = require('../../models/Discount');
  let automaticDiscount = 0;
  let appliedDiscounts = [];
  const orderTenancy = tenancyId || req.tenancyId || req.user?.tenancy || branch.tenancy;

  console.log('========================================');
  console.log('CHECKING AUTOMATIC DISCOUNTS');
  console.log('Order Tenancy:', orderTenancy);
  console.log('Order Total Amount:', totalAmount);
  console.log('========================================');

  if (orderTenancy) {
    // Get all active discounts for tenancy
    const discounts = await Discount.find({
      tenancy: orderTenancy,
      isActive: true
    }).sort({ priority: -1 });

    console.log(`Found ${discounts.length} active discounts for tenancy`);

    console.log(`Found ${discounts.length} active discounts for tenancy`);

    if (discounts.length > 0) {
      discounts.forEach((d, i) => {
        console.log(`  Discount ${i + 1}: ${d.name}`);
        console.log(`    - Type: ${d.rules[0]?.type}`);
        console.log(`    - Value: ${d.rules[0]?.value}`);
        console.log(`    - Start: ${d.startDate}`);
        console.log(`    - End: ${d.endDate}`);
        console.log(`    - Is Valid: ${d.isValid()}`);
      });
    }

    // Create temporary order object for discount evaluation
    const tempOrder = {
      totalAmount,
      items: orderItems,
      customer: req.user._id
    };

    for (const discount of discounts) {
      console.log(`\nEvaluating discount: ${discount.name}`);
      console.log(`  - Can apply to order: ${discount.canApplyToOrder(tempOrder, req.user)}`);

      if (discount.canApplyToOrder(tempOrder, req.user)) {
        for (const rule of discount.rules) {
          console.log(`  - Checking rule: ${rule.type}`);
          const ruleCheck = discount.checkRule(rule, tempOrder, req.user);
          console.log(`  - Rule check result: ${ruleCheck}`);

          if (ruleCheck) {
            const discountAmount = discount.calculateDiscount(tempOrder, rule);
            console.log(`  - Calculated discount amount: ₹${discountAmount}`);

            appliedDiscounts.push({
              discountId: discount._id,
              name: discount.name,
              type: rule.type,
              amount: discountAmount,
              description: discount.description
            });

            automaticDiscount += discountAmount;

            console.log(`✅ Applied automatic discount: ${discount.name} - ₹${discountAmount}`);

            // If discount doesn't stack with others, break
            if (!discount.canStackWithOtherDiscounts) {
              console.log(`  - Discount doesn't stack, stopping here`);
              break;
            }
          }
        }

        // If we found a non-stacking discount, stop checking others
        if (appliedDiscounts.length > 0 && !appliedDiscounts[appliedDiscounts.length - 1].canStackWithOtherDiscounts) {
          break;
        }
      }
    }
  }

  console.log(`\nTotal automatic discount: ₹${automaticDiscount}`);
  console.log(`Applied discounts count: ${appliedDiscounts.length}`);
  console.log('========================================\n');

  // Apply campaign benefits
  let campaignDiscount = 0;
  let appliedCampaign = null;

  console.log('========================================');
  console.log('CHECKING CAMPAIGNS');
  console.log('Order Tenancy:', orderTenancy);
  console.log('========================================');

  if (orderTenancy) {
    try {
      const Campaign = require('../../models/Campaign');

      // Find active campaigns for this tenancy
      const activeCampaigns = await Campaign.findActiveCampaigns(orderTenancy, 'ORDER_CHECKOUT');

      console.log(`Found ${activeCampaigns.length} active campaigns`);

      if (activeCampaigns.length > 0) {
        // Get user data for eligibility
        const userWithStats = await User.findById(req.user._id).select('orderCount totalSpent createdAt');

        // Find first eligible campaign
        for (const campaign of activeCampaigns) {
          console.log(`\nEvaluating campaign: ${campaign.name}`);

          // Check if user is eligible
          const isEligible = campaign.isUserEligible(userWithStats, { total: totalAmount });
          console.log(`  - Is eligible: ${isEligible}`);

          if (isEligible) {
            // Check if campaign can stack with automatic discounts
            let canApplyCampaign = true;
            if (appliedDiscounts.length > 0 && !campaign.stacking.allowStackingWithDiscounts) {
              canApplyCampaign = false;
              console.log('  - Cannot stack with discounts');
              continue;
            }

            if (canApplyCampaign) {
              // Calculate campaign benefit
              const benefit = campaign.calculateBenefit({ total: totalAmount });

              if (benefit > 0) {
                appliedCampaign = {
                  campaignId: campaign._id,
                  name: campaign.name,
                  description: campaign.description,
                  benefit: benefit,
                  stacking: campaign.stacking,
                  promotions: campaign.promotions.map(p => ({
                    type: p.type,
                    promotionId: p.promotionId
                  }))
                };

                campaignDiscount = benefit;
                console.log(`✅ Applied campaign: ${campaign.name} - ₹${campaignDiscount}`);
                break; // Use first eligible campaign
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Campaign evaluation error:', error);
      // Don't fail order if campaign evaluation fails
    }
  }

  console.log(`\nTotal campaign discount: ₹${campaignDiscount}`);
  console.log('========================================\n');

  // Apply coupon discount if provided
  let couponDiscount = 0;
  let appliedCoupon = null;

  if (couponCode && orderTenancy) {
    const coupon = await Coupon.findValidCoupon(orderTenancy, couponCode);
    if (coupon) {
      const canUse = await coupon.canBeUsedBy(req.user._id, totalAmount);
      if (canUse.valid) {
        // Check first order only
        let isEligible = true;
        if (coupon.firstOrderOnly) {
          const existingOrders = await Order.countDocuments({
            customer: req.user._id,
            tenancy: orderTenancy,
            status: { $ne: 'cancelled' }
          });
          if (existingOrders > 0) isEligible = false;
        }

        // Check if coupon can stack with automatic discounts
        let canApplyCoupon = true;
        if (appliedDiscounts.length > 0) {
          // Check if any applied discount doesn't allow stacking with coupons
          const hasNonStackingDiscount = appliedDiscounts.some(d => {
            const discount = discounts.find(disc => disc._id.toString() === d.discountId.toString());
            return discount && !discount.canStackWithCoupons;
          });
          if (hasNonStackingDiscount) {
            canApplyCoupon = false;
            console.log('⚠️ Coupon cannot be applied - automatic discount does not allow stacking');
          }
        }

        // Check if coupon can stack with campaign
        if (appliedCampaign && !appliedCampaign.stacking?.allowStackingWithCoupons) {
          canApplyCoupon = false;
          console.log('⚠️ Coupon cannot be applied - campaign does not allow stacking');
        }

        if (isEligible && canApplyCoupon) {
          couponDiscount = coupon.calculateDiscount(totalAmount);
          appliedCoupon = coupon;
          console.log(`✅ Applied coupon: ${coupon.code} - ₹${couponDiscount}`);
        }
      }
    }
  }

  const pricing = calculateOrderTotal(items, deliveryCharge, serviceTypeDiscount + automaticDiscount + campaignDiscount + couponDiscount, 0.18); // 18% tax

  // Add discount info to pricing
  if (automaticDiscount > 0) {
    pricing.automaticDiscount = Math.round(automaticDiscount);
    pricing.appliedDiscounts = appliedDiscounts;
  }

  // Add campaign info to pricing
  if (appliedCampaign) {
    pricing.campaignDiscount = Math.round(campaignDiscount);
    pricing.appliedCampaign = appliedCampaign;
  }

  // Add coupon info to pricing
  if (appliedCoupon) {
    pricing.couponCode = appliedCoupon.code;
    pricing.couponDiscount = Math.round(couponDiscount);
  }

  // Generate shorter order number: ORD + YYMMDD + 3-digit daily counter
  const today = new Date();
  const year = today.getFullYear().toString().slice(-2);
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  const dateStr = year + month + day;

  // Get today's order count for this tenancy
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const todayCount = await Order.countDocuments({
    tenancy: orderTenancy,
    createdAt: {
      $gte: todayStart,
      $lt: todayEnd
    }
  });

  const orderNumber = `ORD${dateStr}${String(todayCount + 1).padStart(3, '0')}`;

  // Create order
  const order = await Order.create({
    tenancy: orderTenancy, // Use branch's tenancy if no other tenancy available
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

  // Record coupon usage if applied
  if (appliedCoupon) {
    await appliedCoupon.recordUsage(req.user._id, order._id, couponDiscount);
  }

  // Record automatic discount usage if applied
  if (appliedDiscounts.length > 0) {
    const Discount = require('../../models/Discount');
    for (const appliedDiscount of appliedDiscounts) {
      try {
        const discount = await Discount.findById(appliedDiscount.discountId);
        if (discount) {
          await discount.recordUsage(order, appliedDiscount.amount);
          console.log(`✅ Recorded discount usage: ${discount.name} - ₹${appliedDiscount.amount}`);
        }
      } catch (error) {
        console.error('Error recording discount usage:', error);
      }
    }
  }

  // Record campaign usage if applied
  if (appliedCampaign) {
    try {
      const Campaign = require('../../models/Campaign');
      const campaign = await Campaign.findById(appliedCampaign.campaignId);
      if (campaign) {
        // Update campaign usage stats
        campaign.limits.usedCount += 1;
        campaign.budget.spentAmount += campaignDiscount;
        campaign.analytics.conversions += 1;
        campaign.analytics.totalSavings += campaignDiscount;
        campaign.analytics.totalRevenue += pricing.total;
        campaign.analytics.uniqueUsers = await Order.distinct('customer', {
          'pricing.appliedCampaign.campaignId': campaign._id
        }).then(users => users.length);

        await campaign.save();
        console.log(`✅ Recorded campaign usage: ${campaign.name} - ₹${campaignDiscount}`);
      }
    } catch (error) {
      console.error('Error recording campaign usage:', error);
    }
  }

  // Update customer stats
  customer.totalOrders += 1;
  if (customer.isVIP) {
    customer.rewardPoints += Math.floor(pricing.total / 100); // 1 point per ₹100
  }
  await customer.save();

  // Populate order for response
  const populatedOrder = await Order.findById(order._id)
    .populate('items')
    .populate('branch', 'name code')
    .populate('customer', 'name email phone');

  // Create notification for customer
  try {
    await NotificationService.notifyOrderPlaced(req.user._id, order, orderTenancy);

    // Trigger Automation Rules
    const automationTriggers = require('../../services/automationTriggers');
    const context = automationTriggers.createContext(req);
    // Don't await this to avoid delaying response
    automationTriggers.triggerOrderPlaced(populatedOrder, context).catch(err =>
      console.error('Failed to trigger automation:', err)
    );
  } catch (error) {
    console.log('Failed to create notification/automation:', error.message);
  }

  // Notify all admins in this tenancy about new order
  try {
    const User = require('../../models/User');
    const socketService = require('../../services/socketService');

    const admins = await User.find({
      tenancy: orderTenancy,
      role: 'admin',
      isActive: true
    }).select('_id');

    for (const admin of admins) {
      await NotificationService.notifyAdminNewOrder(admin._id, populatedOrder, orderTenancy);
    }
    console.log(`📢 Notified ${admins.length} admin(s) about new order`);

    // Send real-time WebSocket notification to all admins
    socketService.sendToTenancyRecipients(orderTenancy, 'admin', {
      type: 'newOrder',
      orderId: order._id,
      orderNumber: order.orderNumber,
      customerName: customer.name,
      amount: pricing.total,
      items: createdItems.length,
      isExpress: isExpress || false,
      serviceType: serviceType || 'full_service',
      timestamp: new Date()
    });
    console.log(`🔔 Real-time notification sent to admins for new order ${order.orderNumber}`);
  } catch (error) {
    console.log('Failed to notify admins:', error.message);
  }

  // Notify branch admin if order is assigned to a branch
  if (order.branch) {
    try {
      const User = require('../../models/User');
      const branchAdmins = await User.find({
        tenancy: tenancyId,
        role: 'branch_admin',
        assignedBranch: order.branch,
        isActive: true
      }).select('_id');

      for (const branchAdmin of branchAdmins) {
        await NotificationService.notifyBranchAdminNewOrder(branchAdmin._id, populatedOrder, tenancyId);
      }
      console.log(`📢 Notified ${branchAdmins.length} branch admin(s) about new order`);
    } catch (error) {
      console.log('Failed to notify branch admins:', error.message);
    }
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
  const { page = 1, limit = 10, status, tenancyId } = req.query;
  const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit);

  const query = { customer: req.user._id };
  if (status) {
    query.status = status;
  }

  // Filter by tenancy if provided (for tenant-specific dashboard)
  if (tenancyId) {
    query.tenancy = tenancyId;
  }

  const total = await Order.countDocuments(query);
  const orders = await Order.find(query)
    .populate('branch', 'name code tenancy')
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
    .populate('branch', 'name code address contact tenancy')
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