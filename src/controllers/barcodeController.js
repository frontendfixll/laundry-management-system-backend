/**
 * Barcode Controller
 * Handles barcode scanning, item tag scanning, and label printing
 */

const Order = require('../models/Order');
const OrderItem = require('../models/OrderItem');
const { sendSuccess, sendError, asyncHandler } = require('../utils/helpers');
const { isValidBarcode, isValidItemTag, getBarcodeData, getItemTagData, generatePrintLabels } = require('../utils/barcode');

// @desc    Scan barcode and get order details
// @route   GET /api/barcode/scan/:barcode
// @access  Private (Staff/Admin)
const scanBarcode = asyncHandler(async (req, res) => {
  const { barcode } = req.params;

  // Validate barcode format
  if (!barcode || barcode.length < 5) {
    return sendError(res, 'INVALID_BARCODE', 'Invalid barcode format', 400);
  }

  // Check if it's an item tag (starts with IT)
  if (barcode.toUpperCase().startsWith('IT')) {
    return scanItemTag(req, res);
  }

  // Get tenancy ID from request or user
  const tenancyId = req.tenancyId || req.user?.tenancy;

  // Build query with tenancy filter
  const query = {
    $or: [
      { barcode: barcode.toUpperCase() },
      { orderNumber: barcode.toUpperCase() }
    ]
  };
  
  // Add tenancy filter if available
  if (tenancyId) {
    query.tenancy = tenancyId;
  }

  // Find order by barcode or order number
  const order = await Order.findOne(query)
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
    // Scan type
    scanType: 'order',
    
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
      itemId: item._id,
      tagCode: item.tagCode,
      itemType: item.itemType,
      service: item.service,
      category: item.category,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      specialInstructions: item.specialInstructions,
      processingStatus: item.processingStatus
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

// @desc    Scan item tag and get item details
// @route   GET /api/barcode/scan-item/:tagCode
// @access  Private (Staff/Admin)
const scanItemTag = asyncHandler(async (req, res) => {
  const tagCode = req.params.tagCode || req.params.barcode;

  if (!tagCode) {
    return sendError(res, 'INVALID_TAG', 'Invalid tag code', 400);
  }

  // Get tenancy ID from request or user
  const tenancyId = req.tenancyId || req.user?.tenancy;

  // Find item by tag code
  const item = await OrderItem.findOne({ tagCode: tagCode.toUpperCase() });

  if (!item) {
    return sendError(res, 'ITEM_NOT_FOUND', 'No item found with this tag code', 404);
  }

  // Build order query with tenancy filter
  const orderQuery = { _id: item.order };
  if (tenancyId) {
    orderQuery.tenancy = tenancyId;
  }

  // Get order details with tenancy check
  const order = await Order.findOne(orderQuery)
    .populate('customer', 'name email phone')
    .populate('branch', 'name code');

  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found for this item or access denied', 404);
  }

  // Get all items in this order for context
  const allItems = await OrderItem.find({ order: order._id });

  const scanResult = {
    // Scan type
    scanType: 'item',
    
    // Item Info
    itemId: item._id,
    tagCode: item.tagCode,
    itemType: item.itemType,
    service: item.service,
    category: item.category,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
    specialInstructions: item.specialInstructions,
    processingStatus: item.processingStatus,
    qualityCheck: item.qualityCheck,
    issues: item.issues,
    
    // Order Info
    order: {
      orderId: order._id,
      orderNumber: order.orderNumber,
      barcode: order.barcode,
      status: order.status,
      isExpress: order.isExpress,
      isVIPOrder: order.isVIPOrder,
      totalItems: allItems.length,
      pickupDate: order.pickupDate,
      estimatedDeliveryDate: order.estimatedDeliveryDate
    },
    
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
    } : null
  };

  sendSuccess(res, { item: scanResult }, 'Item found successfully');
});

// @desc    Get barcode for an order
// @route   GET /api/barcode/order/:orderId
// @access  Private (Staff/Admin/Customer)
const getOrderBarcode = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  // Get tenancy ID from request or user
  const tenancyId = req.tenancyId || req.user?.tenancy;

  // Build query with tenancy filter
  const query = { _id: orderId };
  if (tenancyId) {
    query.tenancy = tenancyId;
  }

  const order = await Order.findOne(query).select('orderNumber barcode barcodeGeneratedAt');

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

// @desc    Get print labels for order items
// @route   GET /api/barcode/order/:orderId/labels
// @access  Private (Staff/Admin)
const getOrderLabels = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { itemIds } = req.query; // Optional: specific item IDs to print

  // Get tenancy ID from request or user
  const tenancyId = req.tenancyId || req.user?.tenancy;

  // Build query with tenancy filter
  const orderQuery = { _id: orderId };
  if (tenancyId) {
    orderQuery.tenancy = tenancyId;
  }

  const order = await Order.findOne(orderQuery)
    .populate('customer', 'name phone email');

  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found', 404);
  }

  // Get items - either specific ones or all
  let query = { order: orderId };
  if (itemIds) {
    const ids = itemIds.split(',');
    query._id = { $in: ids };
  }

  const items = await OrderItem.find(query);

  if (items.length === 0) {
    return sendError(res, 'NO_ITEMS', 'No items found for this order', 404);
  }

  // Generate tag codes for items that don't have them
  for (const item of items) {
    if (!item.tagCode) {
      const timestamp = Date.now().toString().slice(-6);
      const random = Math.floor(1000 + Math.random() * 9000);
      item.tagCode = `IT${timestamp}${random}`;
      item.tagGeneratedAt = new Date();
      item.qrData = JSON.stringify({
        tagCode: item.tagCode,
        orderId: order._id.toString(),
        itemType: item.itemType,
        service: item.service
      });
      await item.save();
    }
  }

  // Generate print labels
  const labels = generatePrintLabels(items, order, order.customer);

  sendSuccess(res, { 
    orderNumber: order.orderNumber,
    orderBarcode: order.barcode,
    customerName: order.customer?.name || 'N/A',
    totalLabels: labels.length,
    labels
  }, 'Labels generated successfully');
});

// @desc    Update item processing status via tag scan
// @route   PUT /api/barcode/scan-item/:tagCode/status
// @access  Private (Staff/Admin)
const updateItemStatusViaScan = asyncHandler(async (req, res) => {
  const { tagCode } = req.params;
  const { processingStatus, notes } = req.body;

  // Get tenancy ID from request or user
  const tenancyId = req.tenancyId || req.user?.tenancy;

  const validStatuses = ['pending', 'in_progress', 'completed', 'quality_check', 'ready'];
  if (!validStatuses.includes(processingStatus)) {
    return sendError(res, 'INVALID_STATUS', 'Invalid processing status', 400);
  }

  const item = await OrderItem.findOne({ tagCode: tagCode.toUpperCase() });

  if (!item) {
    return sendError(res, 'ITEM_NOT_FOUND', 'No item found with this tag code', 404);
  }

  // Verify tenancy access by checking the order
  if (tenancyId) {
    const order = await Order.findOne({ _id: item.order, tenancy: tenancyId });
    if (!order) {
      return sendError(res, 'ACCESS_DENIED', 'Access denied to this item', 403);
    }
  }

  item.processingStatus = processingStatus;
  
  // If quality check, add quality check info
  if (processingStatus === 'quality_check' || processingStatus === 'ready') {
    item.qualityCheck = {
      passed: processingStatus === 'ready',
      notes: notes || '',
      checkedBy: req.user._id,
      checkedAt: new Date()
    };
  }

  await item.save();

  // Get order to return context
  const order = await Order.findById(item.order).select('orderNumber barcode status');

  sendSuccess(res, { 
    tagCode: item.tagCode,
    itemType: item.itemType,
    newStatus: processingStatus,
    orderNumber: order?.orderNumber,
    orderStatus: order?.status
  }, 'Item status updated successfully');
});

// @desc    Update order status via barcode scan
// @route   PUT /api/barcode/scan/:barcode/status
// @access  Private (Staff/Admin)
const updateStatusViaScan = asyncHandler(async (req, res) => {
  const { barcode } = req.params;
  const { status, notes } = req.body;

  // Get tenancy ID from request or user
  const tenancyId = req.tenancyId || req.user?.tenancy;

  // Build query with tenancy filter
  const query = {
    $or: [
      { barcode: barcode.toUpperCase() },
      { orderNumber: barcode.toUpperCase() }
    ]
  };
  
  if (tenancyId) {
    query.tenancy = tenancyId;
  }

  const order = await Order.findOne(query);

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

  // Get tenancy ID from request or user
  const tenancyId = req.tenancyId || req.user?.tenancy;

  const results = [];
  const notFound = [];

  for (const barcode of barcodes) {
    // Check if it's an item tag
    if (barcode.toUpperCase().startsWith('IT')) {
      const item = await OrderItem.findOne({ tagCode: barcode.toUpperCase() });
      if (item) {
        // Build order query with tenancy filter
        const orderQuery = { _id: item.order };
        if (tenancyId) {
          orderQuery.tenancy = tenancyId;
        }
        
        const order = await Order.findOne(orderQuery)
          .populate('customer', 'name phone')
          .select('orderNumber barcode status isExpress tenancy');
        
        // Only include if order exists and belongs to tenancy
        if (order) {
          results.push({
            type: 'item',
            tagCode: item.tagCode,
            itemType: item.itemType,
            service: item.service,
            processingStatus: item.processingStatus,
            orderNumber: order.orderNumber,
            orderBarcode: order.barcode,
            customerName: order.customer?.name || 'N/A',
            orderStatus: order.status,
            isExpress: order.isExpress
          });
        } else {
          notFound.push(barcode);
        }
      } else {
        notFound.push(barcode);
      }
    } else {
      // Order barcode - build query with tenancy filter
      const orderQuery = {
        $or: [
          { barcode: barcode.toUpperCase() },
          { orderNumber: barcode.toUpperCase() }
        ]
      };
      
      if (tenancyId) {
        orderQuery.tenancy = tenancyId;
      }
      
      const order = await Order.findOne(orderQuery)
        .populate('customer', 'name phone')
        .select('orderNumber barcode status customer pricing.total isExpress');

      if (order) {
        results.push({
          type: 'order',
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
  }

  sendSuccess(res, { 
    found: results,
    notFound,
    totalScanned: barcodes.length,
    foundCount: results.length,
    notFoundCount: notFound.length
  }, 'Bulk scan completed');
});

// @desc    Report issue on item via tag scan
// @route   POST /api/barcode/scan-item/:tagCode/issue
// @access  Private (Staff/Admin)
const reportItemIssue = asyncHandler(async (req, res) => {
  const { tagCode } = req.params;
  const { issueType, description } = req.body;

  // Get tenancy ID from request or user
  const tenancyId = req.tenancyId || req.user?.tenancy;

  const validIssueTypes = ['stain_not_removed', 'damage', 'color_bleeding', 'shrinkage', 'other'];
  if (!validIssueTypes.includes(issueType)) {
    return sendError(res, 'INVALID_ISSUE_TYPE', 'Invalid issue type', 400);
  }

  const item = await OrderItem.findOne({ tagCode: tagCode.toUpperCase() });

  if (!item) {
    return sendError(res, 'ITEM_NOT_FOUND', 'No item found with this tag code', 404);
  }

  // Verify tenancy access by checking the order
  if (tenancyId) {
    const order = await Order.findOne({ _id: item.order, tenancy: tenancyId });
    if (!order) {
      return sendError(res, 'ACCESS_DENIED', 'Access denied to this item', 403);
    }
  }

  item.issues.push({
    type: issueType,
    description: description || '',
    reportedBy: req.user._id,
    reportedAt: new Date(),
    resolved: false
  });

  await item.save();

  sendSuccess(res, { 
    tagCode: item.tagCode,
    itemType: item.itemType,
    issuesCount: item.issues.length
  }, 'Issue reported successfully');
});

module.exports = {
  scanBarcode,
  scanItemTag,
  getOrderBarcode,
  getOrderLabels,
  updateItemStatusViaScan,
  updateStatusViaScan,
  bulkScan,
  reportItemIssue
};
