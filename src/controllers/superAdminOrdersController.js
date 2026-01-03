const Order = require('../models/Order');
const Branch = require('../models/Branch');
const LogisticsPartner = require('../models/LogisticsPartner');
const User = require('../models/User');
const {
  sendSuccess,
  sendError,
  asyncHandler,
  getPagination,
  formatPaginationResponse
} = require('../utils/helpers');
const { ORDER_STATUS } = require('../config/constants');

// @desc    Get all orders
// @route   GET /api/center-admin/orders
// @access  Private (Center Admin)
const getAllOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, status, branchId, search } = req.query;
  const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit);

  const query = {};
  
  if (status && status !== 'all') {
    query.status = status;
  }
  
  if (branchId) {
    query.branch = branchId;
  }

  const total = await Order.countDocuments(query);
  const orders = await Order.find(query)
    .populate('customer', 'name email phone')
    .populate('branch', 'name code')
    .populate('items')
    .populate('logisticsPartner', 'companyName contactPerson')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  const response = formatPaginationResponse(orders, total, pageNum, limitNum);
  sendSuccess(res, response, 'Orders retrieved successfully');
});

// @desc    Get order by ID
// @route   GET /api/center-admin/orders/:orderId
// @access  Private (Center Admin)
const getOrderById = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findById(orderId)
    .populate('customer', 'name email phone')
    .populate('branch', 'name code address contact')
    .populate('items')
    .populate('logisticsPartner', 'companyName contactPerson phone')
    .populate('statusHistory.updatedBy', 'name role');

  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found', 404);
  }

  sendSuccess(res, { order }, 'Order retrieved successfully');
});

// @desc    Assign order to branch
// @route   PUT /api/center-admin/orders/:orderId/assign-branch
// @access  Private (Center Admin)
const assignOrderToBranch = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { branchId } = req.body;

  const order = await Order.findById(orderId);
  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found', 404);
  }

  const branch = await Branch.findById(branchId);
  if (!branch) {
    return sendError(res, 'BRANCH_NOT_FOUND', 'Branch not found', 404);
  }

  if (!branch.isActive) {
    return sendError(res, 'BRANCH_INACTIVE', 'Branch is not active', 400);
  }

  order.branch = branchId;
  order.status = ORDER_STATUS.ASSIGNED_TO_BRANCH;
  order.statusHistory.push({
    status: ORDER_STATUS.ASSIGNED_TO_BRANCH,
    updatedBy: req.admin?._id || null,
    updatedAt: new Date(),
    notes: `Assigned to branch: ${branch.name}`
  });

  await order.save();

  const populatedOrder = await Order.findById(order._id)
    .populate('customer', 'name email phone')
    .populate('branch', 'name code')
    .populate('items');

  sendSuccess(res, { order: populatedOrder }, 'Order assigned to branch successfully');
});

// @desc    Assign logistics partner
// @route   PUT /api/center-admin/orders/:orderId/assign-logistics
// @access  Private (Center Admin)
const assignLogisticsPartner = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { logisticsPartnerId } = req.body;

  const order = await Order.findById(orderId);
  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found', 404);
  }

  const logisticsPartner = await LogisticsPartner.findById(logisticsPartnerId);
  if (!logisticsPartner) {
    return sendError(res, 'LOGISTICS_NOT_FOUND', 'Logistics partner not found', 404);
  }

  if (!logisticsPartner.isActive) {
    return sendError(res, 'LOGISTICS_INACTIVE', 'Logistics partner is not active', 400);
  }

  order.logisticsPartner = logisticsPartnerId;
  
  // Determine if this is for pickup or delivery
  const isForPickup = ['assigned_to_branch'].includes(order.status);
  const newStatus = isForPickup 
    ? ORDER_STATUS.ASSIGNED_TO_LOGISTICS_PICKUP 
    : ORDER_STATUS.ASSIGNED_TO_LOGISTICS_DELIVERY;

  order.status = newStatus;
  order.statusHistory.push({
    status: newStatus,
    updatedBy: req.admin?._id || null,
    updatedAt: new Date(),
    notes: `Logistics partner assigned: ${logisticsPartner.companyName} for ${isForPickup ? 'pickup' : 'delivery'}`
  });

  await order.save();

  const populatedOrder = await Order.findById(order._id)
    .populate('customer', 'name email phone')
    .populate('branch', 'name code')
    .populate('logisticsPartner', 'companyName contactPerson')
    .populate('items');

  sendSuccess(res, { order: populatedOrder }, 'Logistics partner assigned successfully');
});

// @desc    Update order status
// @route   PUT /api/center-admin/orders/:orderId/status
// @access  Private (Center Admin)
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status, notes } = req.body;

  const order = await Order.findById(orderId);
  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found', 404);
  }

  // Validate status transition
  const validStatuses = Object.values(ORDER_STATUS);
  if (!validStatuses.includes(status)) {
    return sendError(res, 'INVALID_STATUS', 'Invalid order status', 400);
  }

  order.status = status;
  order.statusHistory.push({
    status,
    updatedBy: req.admin?._id || null,
    updatedAt: new Date(),
    notes: notes || `Status updated to ${status}`
  });

  // Set delivery date if delivered
  if (status === ORDER_STATUS.DELIVERED) {
    order.actualDeliveryDate = new Date();
  }

  await order.save();

  const populatedOrder = await Order.findById(order._id)
    .populate('customer', 'name email phone')
    .populate('branch', 'name code')
    .populate('items');

  sendSuccess(res, { order: populatedOrder }, 'Order status updated successfully');
});

module.exports = {
  getAllOrders,
  getOrderById,
  assignOrderToBranch,
  assignLogisticsPartner,
  updateOrderStatus
};
