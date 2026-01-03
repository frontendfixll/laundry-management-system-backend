const Order = require('../../models/Order');
const User = require('../../models/User');
const Branch = require('../../models/Branch');
const LogisticsPartner = require('../../models/LogisticsPartner');
const Ticket = require('../../models/Ticket');
const Refund = require('../../models/Refund');
const OrderService = require('../../services/orderService');
const { 
  sendSuccess, 
  sendError, 
  asyncHandler,
  getPagination,
  formatPaginationResponse
} = require('../../utils/helpers');
const { ORDER_STATUS, USER_ROLES, TICKET_STATUS, REFUND_STATUS, REFUND_LIMITS } = require('../../config/constants');

// @desc    Get admin dashboard data
// @route   GET /api/admin/dashboard
// @access  Private (Admin/Center Admin)
const getDashboard = asyncHandler(async (req, res) => {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  // Get dashboard metrics
  const [
    totalOrders,
    todayOrders,
    pendingOrders,
    expressOrders,
    totalCustomers,
    activeCustomers,
    pendingComplaints,
    totalBranches
  ] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } }),
    Order.countDocuments({ 
      status: { $in: [ORDER_STATUS.PLACED, ORDER_STATUS.ASSIGNED_TO_BRANCH] }
    }),
    Order.countDocuments({ isExpress: true, status: { $ne: ORDER_STATUS.DELIVERED } }),
    User.countDocuments({ role: USER_ROLES.CUSTOMER }),
    User.countDocuments({ role: USER_ROLES.CUSTOMER, isActive: true }),
    Ticket.countDocuments({ status: { $in: [TICKET_STATUS.OPEN, TICKET_STATUS.IN_PROGRESS] } }),
    Branch.countDocuments({ isActive: true })
  ]);

  // Get recent orders
  const recentOrders = await Order.find()
    .populate('customer', 'name phone isVIP')
    .populate('branch', 'name code')
    .sort({ createdAt: -1 })
    .limit(10)
    .select('orderNumber status pricing.total createdAt isExpress items');

  // Get order status distribution
  const statusDistribution = await Order.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  const dashboardData = {
    metrics: {
      totalOrders,
      todayOrders,
      pendingOrders,
      expressOrders,
      totalCustomers,
      activeCustomers,
      pendingComplaints,
      totalBranches
    },
    recentOrders,
    statusDistribution
  };

  sendSuccess(res, dashboardData, 'Dashboard data retrieved successfully');
});

// @desc    Get all orders for admin
// @route   GET /api/admin/orders
// @access  Private (Admin/Center Admin)
const getAllOrders = asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 20, 
    status, 
    branch, 
    isExpress, 
    search,
    startDate,
    endDate
  } = req.query;

  const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit);

  // Build query
  const query = {};
  
  if (status) query.status = status;
  if (branch) query.branch = branch;
  if (isExpress !== undefined) query.isExpress = isExpress === 'true';
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  if (search) {
    query.$or = [
      { orderNumber: { $regex: search, $options: 'i' } },
      { 'pickupAddress.phone': { $regex: search, $options: 'i' } }
    ];
  }

  const total = await Order.countDocuments(query);
  const orders = await Order.find(query)
    .populate('customer', 'name phone email isVIP')
    .populate('branch', 'name code')
    .populate('logisticsPartner', 'companyName')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  const response = formatPaginationResponse(orders, total, pageNum, limitNum);
  sendSuccess(res, response, 'Orders retrieved successfully');
});

// @desc    Assign order to branch
// @route   PUT /api/admin/orders/:orderId/assign-branch
// @access  Private (Admin/Center Admin)
const assignOrderToBranch = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { branchId } = req.body;

  if (!branchId) {
    return sendError(res, 'BRANCH_REQUIRED', 'Branch ID is required', 400);
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found', 404);
  }

  if (order.status !== ORDER_STATUS.PLACED) {
    return sendError(res, 'INVALID_STATUS', 'Order cannot be assigned at this stage', 400);
  }

  const branch = await Branch.findById(branchId);
  if (!branch || !branch.isActive) {
    return sendError(res, 'BRANCH_NOT_FOUND', 'Branch not found or inactive', 404);
  }

  // Check branch capacity
  if (!branch.hasCapacity()) {
    return sendError(res, 'BRANCH_FULL', 'Branch has reached capacity', 400);
  }

  // Update order
  order.branch = branchId;
  await order.updateStatus(ORDER_STATUS.ASSIGNED_TO_BRANCH, req.user._id, `Assigned to branch: ${branch.name}`);

  const updatedOrder = await Order.findById(orderId)
    .populate('branch', 'name code')
    .populate('customer', 'name phone');

  sendSuccess(res, { order: updatedOrder }, 'Order assigned to branch successfully');
});

// @desc    Assign order to logistics partner
// @route   PUT /api/admin/orders/:orderId/assign-logistics
// @access  Private (Admin/Center Admin)
const assignOrderToLogistics = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { logisticsPartnerId, type } = req.body; // type: 'pickup' or 'delivery'

  if (!logisticsPartnerId || !type) {
    return sendError(res, 'MISSING_DATA', 'Logistics partner ID and type are required', 400);
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found', 404);
  }

  const logisticsPartner = await LogisticsPartner.findById(logisticsPartnerId);
  if (!logisticsPartner || !logisticsPartner.isActive) {
    return sendError(res, 'LOGISTICS_NOT_FOUND', 'Logistics partner not found or inactive', 404);
  }

  // Check if logistics partner covers the area (skip if method doesn't exist)
  const pincode = type === 'pickup' ? order.pickupAddress.pincode : order.deliveryAddress.pincode;
  if (logisticsPartner.coversPincode && !logisticsPartner.coversPincode(pincode)) {
    return sendError(res, 'AREA_NOT_COVERED', 'Logistics partner does not cover this area', 400);
  }

  let newStatus;
  let notes;

  if (type === 'pickup') {
    // Allow pickup assignment for 'placed' orders (customer already selected branch)
    // or 'assigned_to_branch' orders
    if (order.status !== ORDER_STATUS.PLACED && order.status !== ORDER_STATUS.ASSIGNED_TO_BRANCH) {
      return sendError(res, 'INVALID_STATUS', 'Order must be placed or assigned to branch for pickup assignment', 400);
    }
    newStatus = ORDER_STATUS.ASSIGNED_TO_LOGISTICS_PICKUP;
    notes = `Assigned to ${logisticsPartner.companyName} for pickup`;
  } else {
    if (order.status !== ORDER_STATUS.READY) {
      return sendError(res, 'INVALID_STATUS', 'Order must be ready for delivery assignment', 400);
    }
    newStatus = ORDER_STATUS.ASSIGNED_TO_LOGISTICS_DELIVERY;
    notes = `Assigned to ${logisticsPartner.companyName} for delivery`;
  }

  // Update order
  order.logisticsPartner = logisticsPartnerId;
  await order.updateStatus(newStatus, req.user._id, notes);

  const updatedOrder = await Order.findById(orderId)
    .populate('logisticsPartner', 'companyName contactPerson')
    .populate('branch', 'name code');

  sendSuccess(res, { order: updatedOrder }, `Order assigned for ${type} successfully`);
});

// @desc    Update order status
// @route   PUT /api/admin/orders/:orderId/status
// @access  Private (Admin/Center Admin)
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status, notes } = req.body;

  // Validate status
  const validStatuses = Object.values(ORDER_STATUS);
  if (!validStatuses.includes(status)) {
    return sendError(res, 'INVALID_STATUS', 'Invalid order status', 400);
  }

  // Use OrderService to update status and send notifications
  const order = await OrderService.updateOrderStatus(orderId, status, req.user._id, notes || 'Status updated by admin');

  const updatedOrder = await Order.findById(orderId)
    .populate('customer', 'name phone')
    .populate('branch', 'name code');

  sendSuccess(res, { order: updatedOrder }, 'Order status updated successfully');
});

// @desc    Get all customers
// @route   GET /api/admin/customers
// @access  Private (Admin/Center Admin)
const getCustomers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, isVIP, isActive } = req.query;
  const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit);

  const query = { role: USER_ROLES.CUSTOMER };
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }
  
  if (isVIP !== undefined) query.isVIP = isVIP === 'true';
  if (isActive !== undefined) query.isActive = isActive === 'true';

  const total = await User.countDocuments(query);
  const customers = await User.find(query)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  // Get order counts for each customer
  const customersWithStats = await Promise.all(
    customers.map(async (customer) => {
      const orderCount = await Order.countDocuments({ customer: customer._id });
      const totalSpent = await Order.aggregate([
        { $match: { customer: customer._id, status: ORDER_STATUS.DELIVERED } },
        { $group: { _id: null, total: { $sum: '$pricing.total' } } }
      ]);
      
      return {
        ...customer.toObject(),
        stats: {
          totalOrders: orderCount,
          totalSpent: totalSpent[0]?.total || 0
        }
      };
    })
  );

  const response = formatPaginationResponse(customersWithStats, total, pageNum, limitNum);
  sendSuccess(res, response, 'Customers retrieved successfully');
});

// @desc    Toggle customer active status
// @route   PUT /api/admin/customers/:customerId/toggle-status
// @access  Private (Admin/Center Admin)
const toggleCustomerStatus = asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  const customer = await User.findOne({ 
    _id: customerId, 
    role: USER_ROLES.CUSTOMER 
  });

  if (!customer) {
    return sendError(res, 'CUSTOMER_NOT_FOUND', 'Customer not found', 404);
  }

  customer.isActive = !customer.isActive;
  await customer.save();

  sendSuccess(res, { 
    customer: { 
      _id: customer._id, 
      name: customer.name, 
      isActive: customer.isActive 
    } 
  }, `Customer ${customer.isActive ? 'activated' : 'deactivated'} successfully`);
});

// @desc    Tag customer as VIP
// @route   PUT /api/admin/customers/:customerId/vip
// @access  Private (Admin/Center Admin)
const tagVIPCustomer = asyncHandler(async (req, res) => {
  const { customerId } = req.params;
  const { isVIP } = req.body;

  const customer = await User.findOne({ 
    _id: customerId, 
    role: USER_ROLES.CUSTOMER 
  });

  if (!customer) {
    return sendError(res, 'CUSTOMER_NOT_FOUND', 'Customer not found', 404);
  }

  customer.isVIP = isVIP;
  await customer.save();

  sendSuccess(res, { 
    customer: { 
      _id: customer._id, 
      name: customer.name, 
      isVIP: customer.isVIP 
    } 
  }, `Customer VIP status updated successfully`);
});

// @desc    Get complaints/tickets for admin
// @route   GET /api/admin/complaints
// @access  Private (Admin)
const getComplaints = asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 20, 
    status, 
    priority, 
    category,
    search,
    isOverdue
  } = req.query;

  const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit);

  const query = {};
  
  if (status) query.status = status;
  if (priority) query.priority = priority;
  if (category) query.category = category;
  if (isOverdue === 'true') query['sla.isOverdue'] = true;

  if (search) {
    query.$or = [
      { ticketNumber: { $regex: search, $options: 'i' } },
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  const total = await Ticket.countDocuments(query);
  const complaints = await Ticket.find(query)
    .populate('raisedBy', 'name email phone')
    .populate('assignedTo', 'name email')
    .populate('relatedOrder', 'orderNumber status pricing.total')
    .sort({ priority: -1, createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  const response = formatPaginationResponse(complaints, total, pageNum, limitNum);
  sendSuccess(res, response, 'Complaints retrieved successfully');
});

// @desc    Get complaint by ID
// @route   GET /api/admin/complaints/:complaintId
// @access  Private (Admin)
const getComplaintById = asyncHandler(async (req, res) => {
  const { complaintId } = req.params;

  const complaint = await Ticket.findById(complaintId)
    .populate('raisedBy', 'name email phone')
    .populate('assignedTo', 'name email')
    .populate('resolvedBy', 'name')
    .populate('escalatedTo', 'name')
    .populate('relatedOrder', 'orderNumber status customer branch pricing')
    .populate('messages.sender', 'name role');

  if (!complaint) {
    return sendError(res, 'COMPLAINT_NOT_FOUND', 'Complaint not found', 404);
  }

  sendSuccess(res, { complaint }, 'Complaint retrieved successfully');
});

// @desc    Assign complaint to admin
// @route   PUT /api/admin/complaints/:complaintId/assign
// @access  Private (Admin)
const assignComplaint = asyncHandler(async (req, res) => {
  const { complaintId } = req.params;
  const { agentId } = req.body;

  if (!agentId) {
    return sendError(res, 'AGENT_REQUIRED', 'Agent ID is required', 400);
  }

  const complaint = await Ticket.findById(complaintId);
  if (!complaint) {
    return sendError(res, 'COMPLAINT_NOT_FOUND', 'Complaint not found', 404);
  }

  const agent = await User.findOne({
    _id: agentId,
    role: { $in: [USER_ROLES.ADMIN, USER_ROLES.CENTER_ADMIN] }
  });

  if (!agent) {
    return sendError(res, 'INVALID_AGENT', 'Invalid admin', 400);
  }

  complaint.assignedTo = agentId;
  if (complaint.status === TICKET_STATUS.OPEN) {
    complaint.status = TICKET_STATUS.IN_PROGRESS;
  }
  await complaint.save();

  const updatedComplaint = await Ticket.findById(complaintId)
    .populate('assignedTo', 'name email');

  sendSuccess(res, { complaint: updatedComplaint }, 'Complaint assigned successfully');
});

// @desc    Update complaint status
// @route   PUT /api/admin/complaints/:complaintId/status
// @access  Private (Admin)
const updateComplaintStatus = asyncHandler(async (req, res) => {
  const { complaintId } = req.params;
  const { status, resolution } = req.body;

  const complaint = await Ticket.findById(complaintId);
  if (!complaint) {
    return sendError(res, 'COMPLAINT_NOT_FOUND', 'Complaint not found', 404);
  }

  complaint.status = status;
  
  if (status === TICKET_STATUS.RESOLVED && resolution) {
    complaint.resolution = resolution;
    complaint.resolvedBy = req.user._id;
    complaint.resolvedAt = new Date();
  }

  await complaint.save();

  const updatedComplaint = await Ticket.findById(complaintId)
    .populate('assignedTo', 'name')
    .populate('resolvedBy', 'name');

  sendSuccess(res, { complaint: updatedComplaint }, 'Complaint status updated successfully');
});

// @desc    Get refund requests
// @route   GET /api/admin/refunds
// @access  Private (Admin)
const getRefundRequests = asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 20, 
    status, 
    isEscalated,
    search,
    startDate,
    endDate
  } = req.query;

  const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit);

  const query = {};
  
  if (status) query.status = status;
  if (isEscalated !== undefined) query.isEscalated = isEscalated === 'true';
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  if (search) {
    query.$or = [
      { refundNumber: { $regex: search, $options: 'i' } },
      { reason: { $regex: search, $options: 'i' } }
    ];
  }

  const total = await Refund.countDocuments(query);
  const refunds = await Refund.find(query)
    .populate('order', 'orderNumber status pricing.total')
    .populate('customer', 'name email phone')
    .populate('requestedBy', 'name')
    .populate('approvedBy', 'name')
    .populate('ticket', 'ticketNumber title')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  const response = formatPaginationResponse(refunds, total, pageNum, limitNum);
  sendSuccess(res, response, 'Refund requests retrieved successfully');
});

// @desc    Get refund by ID
// @route   GET /api/admin/refunds/:refundId
// @access  Private (Admin)
const getRefundById = asyncHandler(async (req, res) => {
  const { refundId } = req.params;

  const refund = await Refund.findById(refundId)
    .populate('order', 'orderNumber status pricing customer branch')
    .populate('customer', 'name email phone')
    .populate('requestedBy', 'name')
    .populate('approvedBy', 'name')
    .populate('rejectedBy', 'name')
    .populate('processedBy', 'name')
    .populate('escalatedTo', 'name')
    .populate('ticket', 'ticketNumber title status')
    .populate('notes.user', 'name');

  if (!refund) {
    return sendError(res, 'REFUND_NOT_FOUND', 'Refund not found', 404);
  }

  sendSuccess(res, { refund }, 'Refund retrieved successfully');
});

// @desc    Create refund request
// @route   POST /api/admin/refunds
// @access  Private (Admin)
const createRefundRequest = asyncHandler(async (req, res) => {
  const { orderId, amount, reason, category, ticketId } = req.body;

  if (!orderId || !amount || !reason || !category) {
    return sendError(res, 'MISSING_DATA', 'Order ID, amount, reason, and category are required', 400);
  }

  const order = await Order.findById(orderId).populate('customer');
  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found', 404);
  }

  // Validate amount
  if (amount > order.pricing.total) {
    return sendError(res, 'INVALID_AMOUNT', 'Refund amount cannot exceed order total', 400);
  }

  const refund = new Refund({
    order: orderId,
    customer: order.customer._id,
    ticket: ticketId,
    amount,
    reason,
    category,
    type: amount === order.pricing.total ? 'full' : 'partial',
    requestedBy: req.user._id,
    status: REFUND_STATUS.REQUESTED
  });

  await refund.save();

  const populatedRefund = await Refund.findById(refund._id)
    .populate('order', 'orderNumber')
    .populate('customer', 'name email');

  sendSuccess(res, { refund: populatedRefund }, 'Refund request created successfully');
});

// @desc    Approve refund (within admin limit)
// @route   PUT /api/admin/refunds/:refundId/approve
// @access  Private (Admin)
const approveRefund = asyncHandler(async (req, res) => {
  const { refundId } = req.params;
  const { notes } = req.body;
  const user = req.user;

  const refund = await Refund.findById(refundId);
  if (!refund) {
    return sendError(res, 'REFUND_NOT_FOUND', 'Refund not found', 404);
  }

  if (refund.status !== REFUND_STATUS.REQUESTED) {
    return sendError(res, 'INVALID_STATUS', 'Refund cannot be approved at this stage', 400);
  }

  // Check admin refund limit (₹500 for admin)
  const adminLimit = REFUND_LIMITS[USER_ROLES.ADMIN] || 500;
  
  if (refund.amount > adminLimit) {
    return sendError(res, 'LIMIT_EXCEEDED', `Refund amount exceeds your limit of ₹${adminLimit}. Please escalate to Center Admin.`, 400);
  }

  await refund.approve(user._id, notes || 'Approved by admin');

  const updatedRefund = await Refund.findById(refundId)
    .populate('approvedBy', 'name');

  sendSuccess(res, { refund: updatedRefund }, 'Refund approved successfully');
});

// @desc    Reject refund
// @route   PUT /api/admin/refunds/:refundId/reject
// @access  Private (Admin)
const rejectRefund = asyncHandler(async (req, res) => {
  const { refundId } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return sendError(res, 'REASON_REQUIRED', 'Rejection reason is required', 400);
  }

  const refund = await Refund.findById(refundId);
  if (!refund) {
    return sendError(res, 'REFUND_NOT_FOUND', 'Refund not found', 404);
  }

  if (refund.status !== REFUND_STATUS.REQUESTED) {
    return sendError(res, 'INVALID_STATUS', 'Refund cannot be rejected at this stage', 400);
  }

  await refund.reject(req.user._id, reason);

  const updatedRefund = await Refund.findById(refundId)
    .populate('rejectedBy', 'name');

  sendSuccess(res, { refund: updatedRefund }, 'Refund rejected successfully');
});

// @desc    Escalate refund to Center Admin
// @route   PUT /api/admin/refunds/:refundId/escalate
// @access  Private (Admin)
const escalateRefund = asyncHandler(async (req, res) => {
  const { refundId } = req.params;
  const { reason } = req.body;

  if (!reason) {
    return sendError(res, 'REASON_REQUIRED', 'Escalation reason is required', 400);
  }

  const refund = await Refund.findById(refundId);
  if (!refund) {
    return sendError(res, 'REFUND_NOT_FOUND', 'Refund not found', 404);
  }

  // Find a center admin to escalate to
  const CenterAdmin = require('../../models/CenterAdmin');
  const centerAdmin = await CenterAdmin.findOne({ isActive: true });

  if (!centerAdmin) {
    return sendError(res, 'NO_CENTER_ADMIN', 'No center admin available for escalation', 400);
  }

  await refund.escalate(centerAdmin._id, reason);

  const updatedRefund = await Refund.findById(refundId)
    .populate('escalatedTo', 'name');

  sendSuccess(res, { refund: updatedRefund }, 'Refund escalated to Center Admin successfully');
});

// @desc    Process approved refund
// @route   PUT /api/admin/refunds/:refundId/process
// @access  Private (Admin)
const processRefund = asyncHandler(async (req, res) => {
  const { refundId } = req.params;
  const { transactionId } = req.body;

  const refund = await Refund.findById(refundId);
  if (!refund) {
    return sendError(res, 'REFUND_NOT_FOUND', 'Refund not found', 404);
  }

  if (refund.status !== REFUND_STATUS.APPROVED) {
    return sendError(res, 'INVALID_STATUS', 'Only approved refunds can be processed', 400);
  }

  // Generate transaction ID if not provided
  const txnId = transactionId || `TXN${Date.now()}`;
  
  await refund.process(req.user._id, txnId);

  const updatedRefund = await Refund.findById(refundId)
    .populate('processedBy', 'name');

  sendSuccess(res, { refund: updatedRefund }, 'Refund processed successfully');
});

// @desc    Get admins for assignment
// @route   GET /api/admin/support-agents
// @access  Private (Admin)
const getSupportAgents = asyncHandler(async (req, res) => {
  const agents = await User.find({
    role: { $in: [USER_ROLES.ADMIN, USER_ROLES.CENTER_ADMIN] },
    isActive: true
  }).select('name email role');

  sendSuccess(res, { agents }, 'Admins retrieved successfully');
});

// @desc    Get logistics partners
// @route   GET /api/admin/logistics-partners
// @access  Private (Admin)
const getLogisticsPartners = asyncHandler(async (req, res) => {
  const { status, search } = req.query;
  
  // Build query
  const query = {};
  if (status === 'active') query.isActive = true;
  else if (status === 'inactive') query.isActive = false;
  
  if (search) {
    query.$or = [
      { companyName: { $regex: search, $options: 'i' } },
      { 'contactPerson.name': { $regex: search, $options: 'i' } }
    ];
  }

  const partners = await LogisticsPartner.find(query)
    .select('companyName contactPerson coverageAreas sla performance isActive rateCard createdAt')
    .sort({ createdAt: -1 });

  // Get active orders count for each partner
  const partnersWithStats = await Promise.all(partners.map(async (partner) => {
    const activeOrders = await Order.countDocuments({
      logisticsPartner: partner._id,
      status: { $in: ['assigned_to_logistics_pickup', 'out_for_pickup', 'assigned_to_logistics_delivery', 'out_for_delivery'] }
    });
    
    const totalDeliveries = await Order.countDocuments({
      logisticsPartner: partner._id,
      status: 'delivered'
    });

    return {
      _id: partner._id,
      companyName: partner.companyName,
      contactPerson: partner.contactPerson,
      coverageAreas: partner.coverageAreas,
      isActive: partner.isActive,
      sla: {
        pickupTime: partner.sla?.pickupTime || 2,
        deliveryTime: partner.sla?.deliveryTime || 4
      },
      performance: {
        rating: partner.performance?.rating || 0,
        totalDeliveries: totalDeliveries,
        onTimeRate: partner.performance?.completedOrders > 0 
          ? Math.round((partner.performance.completedOrders / partner.performance.totalOrders) * 100) 
          : 0,
        activeOrders: activeOrders
      },
      rateCard: partner.rateCard,
      createdAt: partner.createdAt
    };
  }));

  sendSuccess(res, { partners: partnersWithStats }, 'Logistics partners retrieved successfully');
});

// @desc    Get all payments/transactions
// @route   GET /api/admin/payments
// @access  Private (Admin)
const getPayments = asyncHandler(async (req, res) => {
  const { 
    page = 1, 
    limit = 20, 
    status, 
    paymentMethod,
    search,
    startDate,
    endDate
  } = req.query;

  const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit);

  // Build query - get payments from orders
  const query = {};
  
  if (status) {
    if (status === 'completed') {
      query.paymentStatus = 'paid';
    } else if (status === 'pending') {
      query.paymentStatus = 'pending';
    } else if (status === 'failed') {
      query.paymentStatus = 'failed';
    }
  }
  
  if (paymentMethod) {
    query.paymentMethod = paymentMethod;
  }
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  if (search) {
    query.$or = [
      { orderNumber: { $regex: search, $options: 'i' } },
      { 'paymentDetails.transactionId': { $regex: search, $options: 'i' } }
    ];
  }

  const total = await Order.countDocuments(query);
  const orders = await Order.find(query)
    .populate('customer', 'name email phone')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .select('orderNumber customer pricing paymentMethod paymentStatus paymentDetails status createdAt');

  // Transform to payment format
  const payments = orders.map(order => ({
    _id: order._id,
    transactionId: order.paymentDetails?.transactionId || `TXN${order._id.toString().slice(-8).toUpperCase()}`,
    orderId: order._id,
    orderNumber: order.orderNumber,
    customer: order.customer,
    amount: order.pricing?.total || 0,
    method: order.paymentMethod === 'cod' ? 'Cash' : 
            order.paymentMethod === 'online' ? 'UPI' : 
            order.paymentMethod || 'Cash',
    status: order.paymentStatus === 'paid' ? 'completed' : 
            order.paymentStatus === 'pending' ? 'pending' :
            order.paymentStatus === 'failed' ? 'failed' :
            order.status === 'delivered' ? 'completed' : 'pending',
    createdAt: order.createdAt
  }));

  const response = formatPaginationResponse(payments, total, pageNum, limitNum);
  sendSuccess(res, response, 'Payments retrieved successfully');
});

// @desc    Get payment stats
// @route   GET /api/admin/payments/stats
// @access  Private (Admin)
const getPaymentStats = asyncHandler(async (req, res) => {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // Get stats from orders
  const [
    totalCompleted,
    totalPending,
    todayRevenue,
    monthlyRevenue
  ] = await Promise.all([
    Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$pricing.total' }, count: { $sum: 1 } } }
    ]),
    Order.aggregate([
      { $match: { paymentStatus: { $ne: 'paid' }, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$pricing.total' }, count: { $sum: 1 } } }
    ]),
    Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ]),
    Order.aggregate([
      { $match: { paymentStatus: 'paid', createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ])
  ]);

  const stats = {
    completed: {
      amount: totalCompleted[0]?.total || 0,
      count: totalCompleted[0]?.count || 0
    },
    pending: {
      amount: totalPending[0]?.total || 0,
      count: totalPending[0]?.count || 0
    },
    todayRevenue: todayRevenue[0]?.total || 0,
    monthlyRevenue: monthlyRevenue[0]?.total || 0
  };

  sendSuccess(res, { stats }, 'Payment stats retrieved successfully');
});

// @desc    Get analytics/dashboard overview
// @route   GET /api/admin/analytics
// @access  Private (Admin)
const getAnalytics = asyncHandler(async (req, res) => {
  const { timeframe = '30d' } = req.query;
  
  // Calculate date range
  const now = new Date();
  let startDate;
  
  switch (timeframe) {
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  // Parallel data fetching
  const [
    totalOrders,
    totalRevenue,
    totalCustomers,
    activeBranches,
    periodOrders,
    periodRevenue,
    periodCustomers,
    avgOrderValue,
    orderStatusDistribution,
    topBranches,
    dailyRevenue,
    recentOrders
  ] = await Promise.all([
    Order.countDocuments(),
    Order.aggregate([{ $group: { _id: null, total: { $sum: '$pricing.total' } } }]),
    User.countDocuments({ role: 'customer' }),
    Branch.countDocuments({ isActive: true }),
    Order.countDocuments({ createdAt: { $gte: startDate } }),
    Order.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ]),
    User.countDocuments({ role: 'customer', createdAt: { $gte: startDate } }),
    Order.aggregate([{ $group: { _id: null, avg: { $avg: '$pricing.total' } } }]),
    Order.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$pricing.total' } } },
      { $sort: { count: -1 } }
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { _id: '$branch', totalOrders: { $sum: 1 }, totalRevenue: { $sum: '$pricing.total' } } },
      { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
      { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
      { $project: { branchName: { $ifNull: ['$branch.name', 'Unknown'] }, totalOrders: 1, totalRevenue: 1 } },
      { $sort: { totalRevenue: -1 } },
      { $limit: 5 }
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: { 
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } },
        revenue: { $sum: '$pricing.total' },
        orders: { $sum: 1 }
      }},
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]),
    Order.find()
      .populate('customer', 'name email')
      .populate('branch', 'name code')
      .sort({ createdAt: -1 })
      .limit(10)
      .select('orderNumber status pricing createdAt')
      .lean()
  ]);

  const currentRevenue = totalRevenue[0]?.total || 0;
  const periodRevenueAmount = periodRevenue[0]?.total || 0;
  const averageOrderValue = avgOrderValue[0]?.avg || 0;

  // Calculate growth percentages
  const orderGrowth = totalOrders > 0 ? ((periodOrders / totalOrders) * 100) : 0;
  const revenueGrowth = currentRevenue > 0 ? ((periodRevenueAmount / currentRevenue) * 100) : 0;
  const customerGrowth = totalCustomers > 0 ? ((periodCustomers / totalCustomers) * 100) : 0;

  // Transform recent orders
  const transformedRecentOrders = recentOrders.map(order => ({
    _id: order._id,
    orderId: order.orderNumber,
    status: order.status,
    totalAmount: order.pricing?.total || 0,
    createdAt: order.createdAt
  }));

  sendSuccess(res, {
    overview: {
      totalOrders,
      totalRevenue: currentRevenue,
      totalCustomers,
      activeBranches,
      averageOrderValue,
      periodStats: { orders: periodOrders, revenue: periodRevenueAmount, customers: periodCustomers },
      growth: { orders: orderGrowth, revenue: revenueGrowth, customers: customerGrowth }
    },
    orderDistribution: orderStatusDistribution,
    topBranches,
    revenue: { daily: dailyRevenue },
    recentOrders: transformedRecentOrders,
    timeframe
  }, 'Analytics data retrieved successfully');
});

// @desc    Get all staff members
// @route   GET /api/admin/staff
// @access  Private (Admin)
const getStaff = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, role, search, isActive } = req.query;
  const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit);

  // Query for non-customer users
  const query = { role: { $ne: 'customer' } };
  
  if (role) query.role = role;
  if (isActive !== undefined) query.isActive = isActive === 'true';
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }

  const total = await User.countDocuments(query);
  const users = await User.find(query)
    .select('-password')
    .populate('assignedBranch', 'name code')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  const response = formatPaginationResponse(users, total, pageNum, limitNum);
  sendSuccess(res, response, 'Staff members retrieved successfully');
});

// @desc    Get staff member by ID
// @route   GET /api/admin/staff/:staffId
// @access  Private (Admin)
const getStaffById = asyncHandler(async (req, res) => {
  const { staffId } = req.params;

  const staff = await User.findOne({ _id: staffId, role: { $ne: 'customer' } })
    .select('-password')
    .populate('assignedBranch', 'name code');

  if (!staff) {
    return sendError(res, 'STAFF_NOT_FOUND', 'Staff member not found', 404);
  }

  sendSuccess(res, { staff }, 'Staff member retrieved successfully');
});

// @desc    Create new staff member
// @route   POST /api/admin/staff
// @access  Private (Admin)
const createStaff = asyncHandler(async (req, res) => {
  const { name, email, phone, password, permissions, assignedBranch } = req.body;

  if (!name || !email || !phone || !password) {
    return sendError(res, 'MISSING_DATA', 'Name, email, phone, and password are required', 400);
  }

  // Check if email already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return sendError(res, 'EMAIL_EXISTS', 'Email already registered', 400);
  }

  // Create staff with admin role but limited permissions
  const staff = new User({
    name,
    email: email.toLowerCase(),
    phone,
    password,
    role: 'admin',
    permissions: permissions || {},
    assignedBranch,
    isActive: true,
    isEmailVerified: true,
    createdBy: req.user._id
  });

  await staff.save();

  const createdStaff = await User.findById(staff._id)
    .select('-password')
    .populate('assignedBranch', 'name code');

  sendSuccess(res, { staff: createdStaff }, 'Staff member created successfully', 201);
});

// @desc    Update staff member
// @route   PUT /api/admin/staff/:staffId
// @access  Private (Admin)
const updateStaff = asyncHandler(async (req, res) => {
  const { staffId } = req.params;
  const { name, phone, permissions, assignedBranch, isActive } = req.body;

  const staff = await User.findOne({ _id: staffId, role: { $ne: 'customer' } });
  if (!staff) {
    return sendError(res, 'STAFF_NOT_FOUND', 'Staff member not found', 404);
  }

  // Update fields if provided
  if (name) staff.name = name;
  if (phone) staff.phone = phone;
  if (permissions) staff.permissions = permissions;
  if (assignedBranch !== undefined) staff.assignedBranch = assignedBranch || null;
  if (isActive !== undefined) staff.isActive = isActive;

  await staff.save();

  const updatedStaff = await User.findById(staffId)
    .select('-password')
    .populate('assignedBranch', 'name code');

  sendSuccess(res, { staff: updatedStaff }, 'Staff member updated successfully');
});

// @desc    Delete/Deactivate staff member
// @route   DELETE /api/admin/staff/:staffId
// @access  Private (Admin)
const deleteStaff = asyncHandler(async (req, res) => {
  const { staffId } = req.params;

  const staff = await User.findOne({ _id: staffId, role: { $ne: 'customer' } });
  if (!staff) {
    return sendError(res, 'STAFF_NOT_FOUND', 'Staff member not found', 404);
  }

  // Prevent deleting yourself
  if (staff._id.toString() === req.user._id.toString()) {
    return sendError(res, 'CANNOT_DELETE_SELF', 'You cannot delete your own account', 400);
  }

  // Soft delete - deactivate instead of removing
  staff.isActive = false;
  await staff.save();

  sendSuccess(res, { staff: { _id: staff._id, name: staff.name } }, 'Staff member deactivated successfully');
});

// @desc    Reactivate staff member
// @route   PUT /api/admin/staff/:staffId/reactivate
// @access  Private (Admin)
const reactivateStaff = asyncHandler(async (req, res) => {
  const { staffId } = req.params;

  const staff = await User.findOne({ _id: staffId, role: { $ne: 'customer' } });
  if (!staff) {
    return sendError(res, 'STAFF_NOT_FOUND', 'Staff member not found', 404);
  }

  staff.isActive = true;
  await staff.save();

  sendSuccess(res, { staff: { _id: staff._id, name: staff.name, isActive: true } }, 'Staff member reactivated successfully');
});

// @desc    Toggle staff status
// @route   PATCH /api/admin/staff/:userId/status
// @access  Private (Admin)
const toggleStaffStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findOne({ _id: userId, role: { $ne: 'customer' } });
  if (!user) {
    return sendError(res, 'USER_NOT_FOUND', 'Staff member not found', 404);
  }

  // Prevent deactivating yourself
  if (user._id.toString() === req.user._id.toString()) {
    return sendError(res, 'CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account', 400);
  }

  user.isActive = !user.isActive;
  await user.save();

  sendSuccess(res, { 
    user: { _id: user._id, name: user.name, isActive: user.isActive } 
  }, `Staff member ${user.isActive ? 'activated' : 'deactivated'} successfully`);
});

// @desc    Get all branches with stats
// @route   GET /api/admin/branches
// @access  Private (Admin)
const getBranches = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search, status, city } = req.query;
  const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit);

  const query = {};
  
  if (status) {
    if (status === 'active') query.isActive = true;
    else if (status === 'inactive') query.isActive = false;
    else query.status = status;
  }
  
  if (city) query['address.city'] = { $regex: city, $options: 'i' };
  
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } },
      { 'address.city': { $regex: search, $options: 'i' } }
    ];
  }

  const total = await Branch.countDocuments(query);
  const branches = await Branch.find(query)
    .populate('manager', 'name email phone')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .lean();

  // Get order stats for each branch
  const branchesWithStats = await Promise.all(
    branches.map(async (branch) => {
      const [orderStats, staffCount] = await Promise.all([
        Order.aggregate([
          { $match: { branch: branch._id } },
          { $group: { _id: null, total: { $sum: 1 }, revenue: { $sum: '$pricing.total' } } }
        ]),
        User.countDocuments({ assignedBranch: branch._id, isActive: true })
      ]);

      return {
        ...branch,
        metrics: {
          totalOrders: orderStats[0]?.total || 0,
          totalRevenue: orderStats[0]?.revenue || 0,
          efficiency: 85 // placeholder
        },
        staffCount,
        utilizationRate: branch.capacity?.currentLoad 
          ? Math.round((branch.capacity.currentLoad / branch.capacity.maxOrdersPerDay) * 100)
          : 0
      };
    })
  );

  sendSuccess(res, {
    branches: branchesWithStats,
    pagination: {
      current: pageNum,
      pages: Math.ceil(total / limitNum),
      total,
      limit: limitNum
    }
  }, 'Branches retrieved successfully');
});

// @desc    Get admin notifications
// @route   GET /api/admin/notifications
// @access  Private (Admin)
const getNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, unreadOnly } = req.query;
  const NotificationService = require('../../services/notificationService');
  
  const result = await NotificationService.getUserNotifications(req.user._id, {
    page: parseInt(page),
    limit: parseInt(limit),
    unreadOnly: unreadOnly === 'true'
  });

  sendSuccess(res, result, 'Notifications retrieved successfully');
});

// @desc    Get unread notification count
// @route   GET /api/admin/notifications/unread-count
// @access  Private (Admin)
const getUnreadNotificationCount = asyncHandler(async (req, res) => {
  const NotificationService = require('../../services/notificationService');
  
  const result = await NotificationService.getUserNotifications(req.user._id, {
    page: 1,
    limit: 1
  });

  sendSuccess(res, { unreadCount: result.unreadCount }, 'Unread count retrieved successfully');
});

// @desc    Mark notifications as read
// @route   PUT /api/admin/notifications/mark-read
// @access  Private (Admin)
const markNotificationsAsRead = asyncHandler(async (req, res) => {
  const { notificationIds } = req.body;
  const NotificationService = require('../../services/notificationService');

  if (!notificationIds || !Array.isArray(notificationIds)) {
    return sendError(res, 'INVALID_DATA', 'Notification IDs array is required', 400);
  }

  await NotificationService.markAsRead(req.user._id, notificationIds);

  sendSuccess(res, null, 'Notifications marked as read');
});

// @desc    Mark all notifications as read
// @route   PUT /api/admin/notifications/mark-all-read
// @access  Private (Admin)
const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  const NotificationService = require('../../services/notificationService');
  
  await NotificationService.markAllAsRead(req.user._id);

  sendSuccess(res, null, 'All notifications marked as read');
});

// @desc    Update payment status
// @route   PUT /api/admin/orders/:orderId/payment-status
// @access  Private (Admin/Center Admin)
const updatePaymentStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { paymentStatus, transactionId } = req.body;

  const validStatuses = ['pending', 'paid', 'failed', 'refunded'];
  if (!validStatuses.includes(paymentStatus)) {
    return sendError(res, 'INVALID_STATUS', 'Invalid payment status', 400);
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found', 404);
  }

  order.paymentStatus = paymentStatus;
  
  if (paymentStatus === 'paid') {
    order.paymentDetails = {
      ...order.paymentDetails,
      paidAt: new Date(),
      transactionId: transactionId || order.paymentDetails?.transactionId || `MANUAL-${order.orderNumber}`
    };
  }

  await order.save();

  const updatedOrder = await Order.findById(orderId)
    .populate('customer', 'name phone')
    .populate('branch', 'name code');

  sendSuccess(res, { order: updatedOrder }, 'Payment status updated successfully');
});

// @desc    Fix all delivered orders with pending payment
// @route   POST /api/admin/fix-delivered-payments
// @access  Private (Admin/Center Admin)
const fixDeliveredPayments = asyncHandler(async (req, res) => {
  const result = await Order.updateMany(
    { status: ORDER_STATUS.DELIVERED, paymentStatus: 'pending' },
    { 
      $set: { 
        paymentStatus: 'paid',
        'paymentDetails.paidAt': new Date()
      }
    }
  );

  sendSuccess(res, { 
    modifiedCount: result.modifiedCount 
  }, `Fixed ${result.modifiedCount} orders with pending payment`);
});

module.exports = {
  getDashboard,
  getAllOrders,
  assignOrderToBranch,
  assignOrderToLogistics,
  updateOrderStatus,
  updatePaymentStatus,
  fixDeliveredPayments,
  getCustomers,
  toggleCustomerStatus,
  tagVIPCustomer,
  getComplaints,
  getComplaintById,
  assignComplaint,
  updateComplaintStatus,
  getRefundRequests,
  getRefundById,
  createRefundRequest,
  approveRefund,
  rejectRefund,
  escalateRefund,
  processRefund,
  getSupportAgents,
  getLogisticsPartners,
  getPayments,
  getPaymentStats,
  getAnalytics,
  getStaff,
  getStaffById,
  createStaff,
  updateStaff,
  deleteStaff,
  reactivateStaff,
  toggleStaffStatus,
  getBranches,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationsAsRead,
  markAllNotificationsAsRead
};