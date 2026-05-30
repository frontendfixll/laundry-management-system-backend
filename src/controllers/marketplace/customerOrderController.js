// Order placement + retrieval for the customer marketplace app.
// Cross-tenant by design: the customer is platform-level, but each order is
// scoped to the branch's tenancy so existing tenant-side dashboards (admin,
// branch-admin, center-admin) pick up these orders naturally.

const mongoose = require('mongoose');
const Order = require('../../models/Order');
const OrderItem = require('../../models/OrderItem');
const Branch = require('../../models/Branch');
const ServiceItem = require('../../models/ServiceItem');
const OrderService = require('../../services/OrderService');

const VALID_PAYMENT_METHODS = ['online', 'cod'];
const MAX_ITEMS_PER_ORDER = 50;

function isObjectId(v) {
  return typeof v === 'string' && mongoose.isValidObjectId(v);
}

function sanitizeAddress(addr) {
  if (!addr || typeof addr !== 'object') return null;
  const required = ['addressLine1', 'city', 'pincode', 'phone'];
  for (const k of required) {
    if (!addr[k] || typeof addr[k] !== 'string' || !addr[k].trim()) return null;
  }
  return {
    name: addr.name?.trim() || undefined,
    phone: addr.phone.trim(),
    addressLine1: addr.addressLine1.trim(),
    addressLine2: addr.addressLine2?.trim() || undefined,
    landmark: addr.landmark?.trim() || undefined,
    city: addr.city.trim(),
    pincode: addr.pincode.trim()
  };
}

// POST /api/customer-app/orders
// Body:
//   {
//     branchId,
//     items: [{ serviceItemId, quantity }],
//     pickupAddress: { name, phone, addressLine1, addressLine2?, landmark?, city, pincode },
//     pickupDate: ISO string,
//     pickupTimeSlot: "09:00 - 11:00",
//     paymentMethod: 'cod' | 'online',
//     specialInstructions?: string
//   }
exports.createOrder = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
    if (req.user.role !== 'customer') {
      return res.status(403).json({ success: false, error: 'Only customers can place orders' });
    }

    const {
      branchId,
      items: itemsRaw,
      pickupAddress,
      pickupDate,
      pickupTimeSlot,
      paymentMethod,
      specialInstructions
    } = req.body || {};

    // --- Validate top-level fields ---
    if (!isObjectId(branchId)) {
      return res.status(400).json({ success: false, error: 'Invalid branchId' });
    }
    if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one item required' });
    }
    if (itemsRaw.length > MAX_ITEMS_PER_ORDER) {
      return res.status(400).json({ success: false, error: `Maximum ${MAX_ITEMS_PER_ORDER} items per order` });
    }
    const cleanAddress = sanitizeAddress(pickupAddress);
    if (!cleanAddress) {
      return res.status(400).json({
        success: false,
        error: 'pickupAddress requires addressLine1, city, pincode, phone'
      });
    }
    const pickupDateObj = pickupDate ? new Date(pickupDate) : null;
    if (!pickupDateObj || Number.isNaN(pickupDateObj.getTime())) {
      return res.status(400).json({ success: false, error: 'pickupDate must be a valid date' });
    }
    if (!pickupTimeSlot || typeof pickupTimeSlot !== 'string' || !pickupTimeSlot.trim()) {
      return res.status(400).json({ success: false, error: 'pickupTimeSlot is required' });
    }
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        error: `paymentMethod must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`
      });
    }

    // --- Validate items shape ---
    const cleanItems = [];
    for (const item of itemsRaw) {
      if (!isObjectId(item?.serviceItemId)) {
        return res.status(400).json({ success: false, error: 'Each item must have a valid serviceItemId' });
      }
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
        return res.status(400).json({
          success: false,
          error: 'Each item quantity must be an integer between 1 and 100'
        });
      }
      cleanItems.push({ serviceItemId: item.serviceItemId, quantity: qty });
    }

    // --- Resolve branch + tenancy ---
    const branch = await Branch.findOne({
      _id: branchId,
      marketplaceVisible: true,
      isActive: true,
      status: 'active'
    }).select('_id tenancy name').lean();

    if (!branch) {
      return res.status(404).json({ success: false, error: 'Branch not found or not accepting orders' });
    }

    // --- Resolve ServiceItems + verify they belong to branch's tenancy ---
    const serviceItemIds = [...new Set(cleanItems.map(i => i.serviceItemId))];
    const serviceItems = await ServiceItem.find({
      _id: { $in: serviceItemIds },
      tenancy: branch.tenancy,
      isActive: true
    }).lean();

    if (serviceItems.length !== serviceItemIds.length) {
      return res.status(400).json({
        success: false,
        error: 'One or more service items are unavailable at this branch'
      });
    }
    const itemMap = new Map(serviceItems.map(si => [si._id.toString(), si]));

    // --- Build OrderItem payloads + compute pricing ---
    let subtotal = 0;
    const orderItemPayloads = cleanItems.map(ci => {
      const si = itemMap.get(ci.serviceItemId);
      const unitPrice = Number(si.basePrice) || 0;
      const totalPrice = unitPrice * ci.quantity;
      subtotal += totalPrice;
      return {
        itemType: si.name,
        service: si.service,
        // OrderItem.category enum is normal/delicate/woolen (laundry-specific).
        // ServiceItem.category is men/women/kids (audience). Default to 'normal'
        // until the schemas are unified — marketplace orders don't capture this.
        category: 'normal',
        quantity: ci.quantity,
        basePrice: unitPrice,
        unitPrice,
        totalPrice
      };
    });

    const pricing = {
      subtotal,
      expressCharge: 0,
      deliveryCharge: 0,
      discount: 0,
      couponDiscount: 0,
      tax: 0,
      total: subtotal
    };

    // --- Create Order + OrderItems atomically ---
    const session = await mongoose.startSession();
    let createdOrder;
    try {
      await session.withTransaction(async () => {
        const [order] = await Order.create(
          [
            {
              tenancy: branch.tenancy,
              customer: userId,
              branch: branch._id,
              serviceType: 'home_pickup_self_pickup',
              pickupAddress: cleanAddress,
              pickupDate: pickupDateObj,
              pickupTimeSlot: pickupTimeSlot.trim(),
              deliveryAddress: cleanAddress, // default deliver back to pickup; can be changed later
              items: [],
              pricing,
              paymentMethod,
              paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending',
              status: 'placed',
              statusHistory: [{ status: 'placed', updatedBy: userId, updatedAt: new Date(), notes: 'Order placed from customer app' }],
              specialInstructions: typeof specialInstructions === 'string' ? specialInstructions.trim() : undefined
            }
          ],
          { session }
        );

        const orderItemsToInsert = orderItemPayloads.map(p => ({ ...p, order: order._id }));
        const created = await OrderItem.insertMany(orderItemsToInsert, { session });
        order.items = created.map(c => c._id);
        await order.save({ session });
        createdOrder = order;
      });
    } finally {
      await session.endSession();
    }

    return res.status(201).json({
      success: true,
      order: {
        _id: createdOrder._id,
        orderNumber: createdOrder.orderNumber,
        status: createdOrder.status,
        paymentMethod: createdOrder.paymentMethod,
        paymentStatus: createdOrder.paymentStatus,
        pricing: createdOrder.pricing,
        pickupDate: createdOrder.pickupDate,
        pickupTimeSlot: createdOrder.pickupTimeSlot,
        createdAt: createdOrder.createdAt
      }
    });
  } catch (err) {
    console.error('[marketplace] createOrder error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create order' });
  }
};

// GET /api/customer-app/orders?status=&page=&limit=
exports.listMyOrders = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const filter = { customer: userId };
    if (req.query.status) filter.status = req.query.status;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate({ path: 'branch', select: 'name code address contact' })
        .populate({ path: 'tenancy', select: 'name slug branding.businessName branding.logo' })
        .select('orderNumber status paymentMethod paymentStatus pricing pickupDate pickupTimeSlot createdAt branch tenancy')
        .lean(),
      Order.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      orders
    });
  } catch (err) {
    console.error('[marketplace] listMyOrders error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
};

// POST /api/customer-app/orders/:id/cancel
// Body (optional): { reason }
// Honors Order.canBeCancelled() — only placed / assigned_to_branch /
// assigned_to_logistics_pickup are cancellable.
exports.cancelOrder = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid order id' });
    }

    const order = await Order.findOne({ _id: req.params.id, customer: userId });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    if (!order.canBeCancelled()) {
      return res.status(409).json({
        success: false,
        error: `Order cannot be cancelled in status '${order.status}'`
      });
    }

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : '';

    // OrderService.updateOrderStatus also fires the socket emit to the
    // customer + tenant admins, so we don't need to do it manually.
    await OrderService.updateOrderStatus(
      order._id,
      'cancelled',
      userId,
      reason ? `Cancelled by customer: ${reason}` : 'Cancelled by customer'
    );

    order.isCancelled = true;
    order.cancellationReason = reason || 'Cancelled by customer';
    order.cancelledBy = userId;
    order.cancelledAt = new Date();
    await order.save();

    return res.json({
      success: true,
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        isCancelled: order.isCancelled,
        cancellationReason: order.cancellationReason,
        cancelledAt: order.cancelledAt
      }
    });
  } catch (err) {
    console.error('[marketplace] cancelOrder error:', err);
    return res.status(500).json({ success: false, error: 'Failed to cancel order' });
  }
};

// GET /api/customer-app/orders/:id
exports.getMyOrder = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid order id' });
    }

    const order = await Order.findOne({ _id: req.params.id, customer: userId })
      .populate({ path: 'branch', select: 'name code address contact coordinates' })
      .populate({ path: 'tenancy', select: 'name slug branding.businessName branding.logo' })
      .populate({ path: 'items' })
      .lean();

    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    return res.json({ success: true, order });
  } catch (err) {
    console.error('[marketplace] getMyOrder error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch order' });
  }
};
