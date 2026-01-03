/**
 * Barcode Controller
 * Handles barcode scanning and order lookup
 */

const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const { sendSuccess, sendError, asyncHandler } = require('../utils/helpers');
const { isValidBarcode, getBarcodeData } = require('../utils/barcode');

// @desc    Scan barcode and get order details
// @route   GET /api/barcode/scan/:barcode
// @access  Private (Staff/Admin)
const scanBarcode = asyncHandler(async (req, res) => {
  const { barcode } = req.params;

  // Validate barcode format
  if (!barcode || barcode.length < 5) {
    return sendError(res, 'INVALID_BARCODE', 'Invalid barcode format', 400);
  }

  // Find order by barcode or order number
  const order = await Order.findOne({
    $or: [
      { barcode: barcode.toUpperCase() },
      { orderNumber: barcode.toUpperCase() }
    ]
  })
    .populate('customer', 'name email phone')
    .populate('branch', 'name code address')
    .populate('items');

  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'No order found with this barcode', 404);
  }

  // Get detailed item information
  const itemDetails = await OrderItem.find({ order: order._id });

  // Prepare scan response with all relevant info
  const scanResult = {
    // Order Info
    orderId: order._id,
    orderNumber: order.orderNumber,
    barcode: order.barcode,
    status: order.status,
    
    // Customer Info
    customer: {
      name: order.customer?.name || 'N/A',
      email: order.customer?.email || 'N/A',
      phone: order.customer?.phone || 'N/A'
    },
    
    // Branch Info
    branch: order.branch ? {
      name: order.branch.name,
      code: order.branch.code
    } : null,
    
    // Service Details
    items: itemDetails.map(item => ({
      itemType: item.itemType,
      service: item.service,
      category: item.category,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      specialInstructions: item.specialInstructions
    })),
    
    // Pricing
    pricing: {
      subtotal: order.pricing?.subtotal || 0,
      expressCharge: order.pricing?.expressCharge || 0,
      deliveryCharge: order.pricing?.deliveryCharge || 0,
      discount: order.pricing?.discount || 0,
      tax: order.pricing?.tax || 0,
      total: order.pricing?.total || 0
    },
    
    // Dates
    pickupDate: order.pickupDate,
    pickupTimeSlot: order.pickupTimeSlot,
    estimatedDeliveryDate: order.estimatedDeliveryDate,
    actualDeliveryDate: order.actualDeliveryDate,
    createdAt: order.createdAt,
    
    // Addresses
    pickupAddress: order.pickupAddress,
    deliveryAddress: order.deliveryAddress,
    
    // Flags
    isExpress: order.isExpress,
    isVIPOrder: order.isVIPOrder,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    
    // Special Instructions
    specialInstructions: order.specialInstructions,
    
    // Status History
    statusHistory: order.statusHistory
  };

  sendSuccess(res, { order: scanResult }, 'Order found successfully');
});

// @desc    Get barcode for an order
// @route   GET /api/barcode/order/:orderId
// @access  Private (Staff/Admin/Customer)
const getOrderBarcode = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findById(orderId).select('orderNumber barcode barcodeGeneratedAt');

  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found', 404);
  }

  // Generate barcode if not exists
  if (!order.barcode) {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(1000 + Math.random() * 9000);
    order.barcode = `LP${timestamp}${random}`;
    order.barcodeGeneratedAt = new Date();
    await order.save();
  }

  const barcodeData = getBarcodeData(order.barcode, order.orderNumber);

  sendSuccess(res, { 
    barcode: order.barcode,
    orderNumber: order.orderNumber,
    barcodeData,
    generatedAt: order.barcodeGeneratedAt
  }, 'Barcode retrieved successfully');
});

// @desc    Update order status via barcode scan
// @route   PUT /api/barcode/scan/:barcode/status
// @access  Private (Staff/Admin)
const updateStatusViaScan = asyncHandler(async (req, res) => {
  const { barcode } = req.params;
  const { status, notes } = req.body;

  const order = await Order.findOne({
    $or: [
      { barcode: barcode.toUpperCase() },
      { orderNumber: barcode.toUpperCase() }
    ]
  });

  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'No order found with this barcode', 404);
  }

  // Update status
  await order.updateStatus(status, req.user._id, notes || `Status updated via barcode scan`);

  sendSuccess(res, { 
    orderNumber: order.orderNumber,
    barcode: order.barcode,
    newStatus: status
  }, 'Order status updated successfully');
});

// @desc    Bulk scan multiple barcodes
// @route   POST /api/barcode/bulk-scan
// @access  Private (Staff/Admin)
const bulkScan = asyncHandler(async (req, res) => {
  const { barcodes } = req.body;

  if (!barcodes || !Array.isArray(barcodes) || barcodes.length === 0) {
    return sendError(res, 'INVALID_INPUT', 'Please provide an array of barcodes', 400);
  }

  const results = [];
  const notFound = [];

  for (const barcode of barcodes) {
    const order = await Order.findOne({
      $or: [
        { barcode: barcode.toUpperCase() },
        { orderNumber: barcode.toUpperCase() }
      ]
    })
      .populate('customer', 'name phone')
      .select('orderNumber barcode status customer pricing.total isExpress');

    if (order) {
      results.push({
        barcode: order.barcode,
        orderNumber: order.orderNumber,
        customerName: order.customer?.name || 'N/A',
        customerPhone: order.customer?.phone || 'N/A',
        status: order.status,
        total: order.pricing?.total || 0,
        isExpress: order.isExpress
      });
    } else {
      notFound.push(barcode);
    }
  }

  sendSuccess(res, { 
    found: results,
    notFound,
    totalScanned: barcodes.length,
    foundCount: results.length,
    notFoundCount: notFound.length
  }, 'Bulk scan completed');
});

module.exports = {
  scanBarcode,
  getOrderBarcode,
  updateStatusViaScan,
  bulkScan
};
