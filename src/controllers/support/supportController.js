const Ticket = require('../../models/Ticket');
const Order = require('../../models/Order');
const User = require('../../models/User');
const { 
  sendSuccess, 
  sendError, 
  asyncHandler,
  getPagination,
  formatPaginationResponse
} = require('../../utils/helpers');
const { TICKET_STATUS, TICKET_PRIORITY, USER_ROLES } = require('../../config/constants');

// @desc    Get support dashboard data
// @route   GET /api/support/dashboard OR /api/admin/support/dashboard
// @access  Private (Admin/Center Admin)
const getSupportDashboard = asyncHandler(async (req, res) => {
  const user = req.user;
  
  // Build query based on user role - all admins see all tickets
  let ticketQuery = {};
  // Admins and Center Admins see all tickets

  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  // Get dashboard metrics
  const [
    totalTickets,
    todayTickets,
    openTickets,
    inProgressTickets,
    resolvedTickets,
    escalatedTickets,
    overdueTickets,
    myAssignedTickets,
    avgResolutionTime
  ] = await Promise.all([
    Ticket.countDocuments(ticketQuery),
    Ticket.countDocuments({
      ...ticketQuery,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    }),
    Ticket.countDocuments({
      ...ticketQuery,
      status: TICKET_STATUS.OPEN
    }),
    Ticket.countDocuments({
      ...ticketQuery,
      status: TICKET_STATUS.IN_PROGRESS
    }),
    Ticket.countDocuments({
      ...ticketQuery,
      status: TICKET_STATUS.RESOLVED
    }),
    Ticket.countDocuments({
      ...ticketQuery,
      status: TICKET_STATUS.ESCALATED
    }),
    Ticket.countDocuments({
      ...ticketQuery,
      'sla.isOverdue': true
    }),
    0, // myAssignedTickets - not needed anymore
    // TODO: Calculate actual average resolution time
    24 // Mock value in hours
  ]);

  // Get recent tickets
  const recentTickets = await Ticket.find(ticketQuery)
    .populate('raisedBy', 'name email')
    .populate('assignedTo', 'name')
    .populate('relatedOrder', 'orderNumber')
    .sort({ createdAt: -1 })
    .limit(10)
    .select('ticketNumber title status priority createdAt');

  // Get ticket distribution by category
  let categoryMatch = {};
  // Admins see all tickets
  
  const categoryDistribution = await Ticket.aggregate([
    { $match: categoryMatch },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);

  const dashboardData = {
    metrics: {
      totalTickets,
      todayTickets,
      openTickets,
      inProgressTickets,
      resolvedTickets,
      escalatedTickets,
      overdueTickets,
      myAssignedTickets,
      avgResolutionTime
    },
    recentTickets,
    categoryDistribution
  };

  sendSuccess(res, dashboardData, 'Support dashboard data retrieved successfully');
});

// @desc    Get tickets
// @route   GET /api/support/tickets
// @access  Private (Admin)
const getTickets = asyncHandler(async (req, res) => {
  const user = req.user;
  const { 
    page = 1, 
    limit = 20, 
    status, 
    priority, 
    category,
    assignedTo,
    search,
    isOverdue
  } = req.query;

  const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit);

  // Build base query with tenancy and branch filter
  const tenancyId = req.tenancyId || req.user?.tenancy;
  const branchId = req.user?.assignedBranch;
  
  let query = {};
  
  // Add tenancy filter
  if (tenancyId) {
    query.tenancy = tenancyId;
  }
  
  // Add branch filter if admin has assigned branch
  if (branchId) {
    query.branch = branchId;
  }
  
  // Only show tickets that have a related order (order-based complaints only)
  query.relatedOrder = { $ne: null };
  
  console.log('🎫 GET /admin/support/tickets called');
  console.log('🎫 User:', req.user?.email, 'Tenancy:', tenancyId, 'Branch:', branchId);

  // Apply filters
  if (status) query.status = status;
  if (priority) query.priority = priority;
  if (category) query.category = category;
  if (assignedTo) query.assignedTo = assignedTo;
  if (isOverdue === 'true') query['sla.isOverdue'] = true;

  if (search) {
    query.$and = query.$and || [];
    query.$and.push({
      $or: [
        { ticketNumber: { $regex: search, $options: 'i' } },
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ]
    });
  }

  const total = await Ticket.countDocuments(query);
  console.log('🎫 Query:', JSON.stringify(query), 'Total found:', total);
  
  const tickets = await Ticket.find(query)
    .populate('raisedBy', 'name email phone')
    .populate('assignedTo', 'name')
    .populate('relatedOrder', 'orderNumber status')
    .sort({ 
      priority: -1, // High priority first
      createdAt: -1 
    })
    .skip(skip)
    .limit(limitNum);

  console.log('🎫 Tickets returned:', tickets.length);
  
  const response = formatPaginationResponse(tickets, total, pageNum, limitNum);
  sendSuccess(res, response, 'Tickets retrieved successfully');
});

// @desc    Get ticket by ID
// @route   GET /api/support/tickets/:ticketId
// @access  Private (Admin)
const getTicketById = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const user = req.user;

  const ticket = await Ticket.findById(ticketId)
    .populate('raisedBy', 'name email phone')
    .populate('assignedTo', 'name email')
    .populate('resolvedBy', 'name')
    .populate('escalatedTo', 'name')
    .populate('relatedOrder', 'orderNumber status customer branch')
    .populate('messages.sender', 'name role');

  if (!ticket) {
    return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found', 404);
  }

  // Check if ticket is overdue
  ticket.checkOverdue();
  if (ticket.sla.isOverdue) {
    await ticket.save();
  }

  sendSuccess(res, { ticket }, 'Ticket retrieved successfully');
});

// @desc    Update ticket status
// @route   PUT /api/support/tickets/:ticketId/status
// @access  Private (Admin)
const updateTicketStatus = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { status, priority } = req.body;
  const user = req.user;

  const ticket = await Ticket.findById(ticketId);
  if (!ticket) {
    return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found', 404);
  }

  // Update fields
  if (status) ticket.status = status;
  if (priority) ticket.priority = priority;

  // Auto-assign to current user if not assigned and status is IN_PROGRESS
  if (status === TICKET_STATUS.IN_PROGRESS && !ticket.assignedTo) {
    ticket.assignedTo = user._id;
  }

  await ticket.save();

  const updatedTicket = await Ticket.findById(ticketId)
    .populate('assignedTo', 'name');

  sendSuccess(res, { ticket: updatedTicket }, 'Ticket status updated successfully');
});

// @desc    Assign ticket to support agent
// @route   PUT /api/support/tickets/:ticketId/assign
// @access  Private (Admin)
const assignTicket = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { assignedTo } = req.body;

  if (!assignedTo) {
    return sendError(res, 'ASSIGNEE_REQUIRED', 'Assignee is required', 400);
  }

  const ticket = await Ticket.findById(ticketId);
  if (!ticket) {
    return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found', 404);
  }

  // Verify assignee is an admin
  const assignee = await User.findOne({
    _id: assignedTo,
    role: { $in: [USER_ROLES.ADMIN, USER_ROLES.CENTER_ADMIN] }
  });

  if (!assignee) {
    return sendError(res, 'INVALID_ASSIGNEE', 'Invalid assignee', 400);
  }

  ticket.assignedTo = assignedTo;
  if (ticket.status === TICKET_STATUS.OPEN) {
    ticket.status = TICKET_STATUS.IN_PROGRESS;
  }

  await ticket.save();

  const updatedTicket = await Ticket.findById(ticketId)
    .populate('assignedTo', 'name email');

  sendSuccess(res, { ticket: updatedTicket }, 'Ticket assigned successfully');
});

// @desc    Add message to ticket
// @route   POST /api/support/tickets/:ticketId/messages
// @access  Private (Admin)
const addMessageToTicket = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { message, isInternal } = req.body;
  const user = req.user;

  const ticket = await Ticket.findById(ticketId);
  if (!ticket) {
    return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found', 404);
  }

  await ticket.addMessage(user._id, message, isInternal || false);

  const updatedTicket = await Ticket.findById(ticketId)
    .populate('messages.sender', 'name role')
    .select('messages');

  sendSuccess(res, { 
    messages: updatedTicket.messages 
  }, 'Message added successfully');
});

// @desc    Escalate ticket
// @route   PUT /api/support/tickets/:ticketId/escalate
// @access  Private (Support Agent/Admin)
const escalateTicket = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { escalatedTo, reason } = req.body;
  const user = req.user;

  if (!reason) {
    return sendError(res, 'MISSING_DATA', 'Reason is required', 400);
  }

  const ticket = await Ticket.findById(ticketId);
  if (!ticket) {
    return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found', 404);
  }

  let escalationTarget;
  
  // If escalatedTo is 'admin' or 'center_admin', find any available admin
  if (escalatedTo === 'admin' || escalatedTo === 'center_admin' || !escalatedTo) {
    escalationTarget = await User.findOne({
      role: { $in: [USER_ROLES.ADMIN, USER_ROLES.CENTER_ADMIN] },
      isActive: { $ne: false }
    });
  } else {
    // Check if it's a valid MongoDB ObjectId
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(escalatedTo)) {
      escalationTarget = await User.findOne({
        _id: escalatedTo,
        role: { $in: [USER_ROLES.ADMIN, USER_ROLES.CENTER_ADMIN] }
      });
    } else {
      // Try to find by role name
      escalationTarget = await User.findOne({
        role: { $in: [USER_ROLES.ADMIN, USER_ROLES.CENTER_ADMIN] },
        isActive: { $ne: false }
      });
    }
  }

  if (!escalationTarget) {
    return sendError(res, 'NO_ADMIN_AVAILABLE', 'No admin available for escalation', 400);
  }

  await ticket.escalate(escalationTarget._id, reason);

  const updatedTicket = await Ticket.findById(ticketId)
    .populate('escalatedTo', 'name email');

  sendSuccess(res, { ticket: updatedTicket }, 'Ticket escalated successfully');
});

// @desc    Resolve ticket
// @route   PUT /api/support/tickets/:ticketId/resolve
// @access  Private (Admin)
const resolveTicket = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { resolution } = req.body;
  const user = req.user;

  if (!resolution) {
    return sendError(res, 'RESOLUTION_REQUIRED', 'Resolution is required', 400);
  }

  const ticket = await Ticket.findById(ticketId);
  if (!ticket) {
    return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found', 404);
  }

  await ticket.resolve(user._id, resolution);

  const updatedTicket = await Ticket.findById(ticketId)
    .populate('resolvedBy', 'name');

  sendSuccess(res, { ticket: updatedTicket }, 'Ticket resolved successfully');
});

// @desc    Get customers list
// @route   GET /api/support/customers
// @access  Private (Admin)
const getCustomers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search, isVIP } = req.query;
  const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit);

  let query = { role: USER_ROLES.CUSTOMER };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }

  if (isVIP === 'true') {
    query.isVIP = true;
  }

  const total = await User.countDocuments(query);
  const customers = await User.find(query)
    .select('name email phone isVIP addresses createdAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  // Get order stats for each customer
  const customersWithStats = await Promise.all(
    customers.map(async (customer) => {
      const orderStats = await Order.aggregate([
        { $match: { customer: customer._id } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalSpent: { $sum: '$totalAmount' },
            lastOrderDate: { $max: '$createdAt' }
          }
        }
      ]);

      const stats = orderStats[0] || { totalOrders: 0, totalSpent: 0, lastOrderDate: null };

      return {
        _id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        isVIP: customer.isVIP || false,
        addresses: customer.addresses || [],
        createdAt: customer.createdAt,
        totalOrders: stats.totalOrders,
        totalSpent: stats.totalSpent,
        lastOrderDate: stats.lastOrderDate
      };
    })
  );

  const response = formatPaginationResponse(customersWithStats, total, pageNum, limitNum);
  sendSuccess(res, response, 'Customers retrieved successfully');
});

// @desc    Get customer by ID
// @route   GET /api/support/customers/:customerId
// @access  Private (Admin)
const getCustomerById = asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  const customer = await User.findOne({ _id: customerId, role: USER_ROLES.CUSTOMER })
    .select('name email phone isVIP addresses createdAt');

  if (!customer) {
    return sendError(res, 'CUSTOMER_NOT_FOUND', 'Customer not found', 404);
  }

  // Get order stats
  const orderStats = await Order.aggregate([
    { $match: { customer: customer._id } },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalSpent: { $sum: '$totalAmount' },
        lastOrderDate: { $max: '$createdAt' }
      }
    }
  ]);

  const stats = orderStats[0] || { totalOrders: 0, totalSpent: 0, lastOrderDate: null };

  // Get recent orders
  const recentOrders = await Order.find({ customer: customerId })
    .select('orderNumber status totalAmount createdAt')
    .sort({ createdAt: -1 })
    .limit(5);

  // Get tickets raised by customer
  const tickets = await Ticket.find({ raisedBy: customerId })
    .select('ticketNumber title status priority createdAt')
    .sort({ createdAt: -1 })
    .limit(5);

  sendSuccess(res, {
    customer: {
      _id: customer._id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      isVIP: customer.isVIP || false,
      addresses: customer.addresses || [],
      createdAt: customer.createdAt,
      totalOrders: stats.totalOrders,
      totalSpent: stats.totalSpent,
      lastOrderDate: stats.lastOrderDate
    },
    recentOrders,
    tickets
  }, 'Customer details retrieved successfully');
});

module.exports = {
  getSupportDashboard,
  getTickets,
  getTicketById,
  updateTicketStatus,
  assignTicket,
  addMessageToTicket,
  escalateTicket,
  resolveTicket,
  getCustomers,
  getCustomerById
};