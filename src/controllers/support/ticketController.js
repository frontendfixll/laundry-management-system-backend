const Ticket = require('../../models/Ticket');
const User = require('../../models/User');
const { 
  sendSuccess, 
  sendError, 
  asyncHandler,
  getPagination,
  formatPaginationResponse
} = require('../../utils/helpers');
const { TICKET_STATUS, TICKET_PRIORITY } = require('../../config/constants');

// @desc    Get support dashboard
// @route   GET /api/support/dashboard
// @access  Private (Support)
const getSupportDashboard = asyncHandler(async (req, res) => {
  const supportUserId = req.user._id;
  const tenancyId = req.tenancyId;

  console.log('🔍 Support Dashboard Request:', {
    supportUserId,
    tenancyId,
    userRole: req.user.role,
    userName: req.user.name
  });

  // Get all tickets in tenancy with detailed stats
  const allTicketsStats = await Ticket.aggregate([
    { $match: { tenancy: tenancyId } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  // Get assigned tickets stats (tickets assigned to this support user)
  const assignedStats = await Ticket.aggregate([
    { $match: { assignedTo: supportUserId } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  // Get tickets resolved today by this support user
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const resolvedToday = await Ticket.countDocuments({
    resolvedBy: supportUserId,
    resolvedAt: { $gte: today }
  });

  // Get total tickets resolved by this support user
  const totalResolved = await Ticket.countDocuments({
    resolvedBy: supportUserId
  });

  // Get my recent tickets (assigned to me)
  const myTickets = await Ticket.find({ assignedTo: supportUserId })
    .populate('raisedBy', 'name email')
    .populate('relatedOrder', 'orderNumber')
    .select('ticketNumber title status priority createdAt updatedAt')
    .sort({ updatedAt: -1 })
    .limit(10);

  // Get unassigned tickets in my tenancy
  const unassignedTickets = await Ticket.find({
    tenancy: tenancyId,
    assignedTo: null,
    status: { $in: ['open'] }
  })
    .populate('raisedBy', 'name email')
    .select('ticketNumber title priority createdAt')
    .sort({ createdAt: -1 })
    .limit(5);

  // Get overdue tickets assigned to me
  const overdueTickets = await Ticket.find({
    assignedTo: supportUserId,
    'sla.isOverdue': true,
    status: { $in: ['open', 'in_progress'] }
  })
    .populate('raisedBy', 'name email')
    .select('ticketNumber title priority createdAt')
    .sort({ createdAt: 1 })
    .limit(5);

  // Calculate dynamic stats
  const openTicketsCount = allTicketsStats.find(s => s._id === 'open')?.count || 0;
  const inProgressCount = allTicketsStats.find(s => s._id === 'in_progress')?.count || 0;
  const resolvedCount = allTicketsStats.find(s => s._id === 'resolved')?.count || 0;
  const assignedToMeCount = assignedStats.reduce((sum, stat) => sum + stat.count, 0);

  const dashboardData = {
    // Dynamic stats for cards
    stats: {
      assignedTickets: assignedToMeCount,
      pendingTickets: unassignedTickets.length,
      resolvedToday: resolvedToday,
      totalResolved: totalResolved,
      openTickets: openTicketsCount,
      inProgressTickets: inProgressCount,
      allResolvedTickets: resolvedCount
    },
    // Legacy format for backward compatibility
    assignedStats: {
      total: assignedToMeCount,
      byStatus: assignedStats
    },
    myTickets,
    unassignedTickets,
    overdueTickets,
    // Additional stats for dashboard cards
    tenancyStats: {
      total: allTicketsStats.reduce((sum, stat) => sum + stat.count, 0),
      byStatus: allTicketsStats
    }
  };

  console.log('📤 Sending dashboard data:', {
    assignedToMe: assignedToMeCount,
    unassigned: unassignedTickets.length,
    resolvedToday: resolvedToday,
    totalResolved: totalResolved,
    openTickets: openTicketsCount
  });

  sendSuccess(res, dashboardData, 'Support dashboard retrieved successfully');
});

// @desc    Get tickets (assigned to me or unassigned)
// @route   GET /api/support/tickets
// @access  Private (Support)
const getTickets = asyncHandler(async (req, res) => {
  const supportUserId = req.user._id;
  const tenancyId = req.tenancyId;
  const { 
    page = 1, 
    limit = 10, 
    status, 
    priority, 
    category,
    assigned = 'all' // 'me', 'unassigned', 'all'
  } = req.query;
  const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit);

  let query = { tenancy: tenancyId };

  // Filter by assignment
  if (assigned === 'me') {
    query.assignedTo = supportUserId;
  } else if (assigned === 'unassigned') {
    query.assignedTo = null;
  }
  // 'all' shows all tickets in tenancy

  if (status) {
    query.status = status;
  }

  if (priority) {
    query.priority = priority;
  }

  if (category) {
    query.category = category;
  }

  const total = await Ticket.countDocuments(query);
  const tickets = await Ticket.find(query)
    .populate('raisedBy', 'name email phone')
    .populate('assignedTo', 'name email')
    .populate('relatedOrder', 'orderNumber status')
    .select('ticketNumber title category status priority createdAt updatedAt sla')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  const response = formatPaginationResponse(tickets, total, pageNum, limitNum);
  sendSuccess(res, response, 'Tickets retrieved successfully');
});

// @desc    Get single ticket details
// @route   GET /api/support/tickets/:ticketId
// @access  Private (Support)
const getTicketById = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const tenancyId = req.tenancyId;

  const ticket = await Ticket.findOne({ 
    _id: ticketId, 
    tenancy: tenancyId 
  })
    .populate('raisedBy', 'name email phone addresses')
    .populate('assignedTo', 'name email')
    .populate('resolvedBy', 'name email')
    .populate('escalatedTo', 'name email')
    .populate('relatedOrder', 'orderNumber status totalAmount createdAt items')
    .populate('messages.sender', 'name role email');

  if (!ticket) {
    return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found', 404);
  }

  sendSuccess(res, { ticket }, 'Ticket retrieved successfully');
});

// @desc    Assign ticket to self
// @route   POST /api/support/tickets/:ticketId/assign
// @access  Private (Support)
const assignTicketToSelf = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const supportUserId = req.user._id;
  const tenancyId = req.tenancyId;

  const ticket = await Ticket.findOne({ 
    _id: ticketId, 
    tenancy: tenancyId,
    assignedTo: null // Only unassigned tickets
  });

  if (!ticket) {
    return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found or already assigned', 404);
  }

  ticket.assignedTo = supportUserId;
  ticket.status = TICKET_STATUS.IN_PROGRESS;
  
  // Add internal message
  await ticket.addMessage(
    supportUserId, 
    'Ticket assigned to support agent', 
    true
  );

  const updatedTicket = await Ticket.findById(ticketId)
    .populate('assignedTo', 'name email')
    .populate('raisedBy', 'name email');

  sendSuccess(res, { ticket: updatedTicket }, 'Ticket assigned successfully');
});

// @desc    Update ticket status
// @route   PUT /api/support/tickets/:ticketId/status
// @access  Private (Support)
const updateTicketStatus = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { status, resolution } = req.body;
  const supportUserId = req.user._id;
  const tenancyId = req.tenancyId;

  if (!Object.values(TICKET_STATUS).includes(status)) {
    return sendError(res, 'INVALID_STATUS', 'Invalid ticket status', 400);
  }

  const ticket = await Ticket.findOne({ 
    _id: ticketId, 
    tenancy: tenancyId,
    assignedTo: supportUserId // Only tickets assigned to this support user
  });

  if (!ticket) {
    return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found or not assigned to you', 404);
  }

  if (status === TICKET_STATUS.RESOLVED) {
    if (!resolution) {
      return sendError(res, 'RESOLUTION_REQUIRED', 'Resolution is required when resolving ticket', 400);
    }
    await ticket.resolve(supportUserId, resolution);
  } else {
    ticket.status = status;
    await ticket.save();
  }

  // Add internal message about status change
  await ticket.addMessage(
    supportUserId,
    `Ticket status changed to ${status}${resolution ? `. Resolution: ${resolution}` : ''}`,
    true
  );

  const updatedTicket = await Ticket.findById(ticketId)
    .populate('assignedTo', 'name email')
    .populate('resolvedBy', 'name email');

  sendSuccess(res, { ticket: updatedTicket }, 'Ticket status updated successfully');
});

// @desc    Add message to ticket
// @route   POST /api/support/tickets/:ticketId/messages
// @access  Private (Support)
const addMessage = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { message, isInternal = false } = req.body;
  const supportUserId = req.user._id;
  const tenancyId = req.tenancyId;

  if (!message) {
    return sendError(res, 'MESSAGE_REQUIRED', 'Message is required', 400);
  }

  const ticket = await Ticket.findOne({ 
    _id: ticketId, 
    tenancy: tenancyId 
  });

  if (!ticket) {
    return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found', 404);
  }

  // Support users can only add messages to tickets assigned to them or unassigned tickets
  if (ticket.assignedTo && !ticket.assignedTo.equals(supportUserId)) {
    return sendError(res, 'UNAUTHORIZED', 'You can only add messages to tickets assigned to you', 403);
  }

  await ticket.addMessage(supportUserId, message, isInternal);

  const updatedTicket = await Ticket.findById(ticketId)
    .populate('messages.sender', 'name role email')
    .select('messages');

  sendSuccess(res, { messages: updatedTicket.messages }, 'Message added successfully');
});

// @desc    Escalate ticket
// @route   POST /api/support/tickets/:ticketId/escalate
// @access  Private (Support)
const escalateTicket = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { escalationReason, escalateTo } = req.body;
  const supportUserId = req.user._id;
  const tenancyId = req.tenancyId;

  if (!escalationReason) {
    return sendError(res, 'REASON_REQUIRED', 'Escalation reason is required', 400);
  }

  const ticket = await Ticket.findOne({ 
    _id: ticketId, 
    tenancy: tenancyId,
    assignedTo: supportUserId
  });

  if (!ticket) {
    return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found or not assigned to you', 404);
  }

  // Find admin or branch admin to escalate to
  let escalateToUser;
  if (escalateTo) {
    escalateToUser = await User.findOne({
      _id: escalateTo,
      tenancy: tenancyId,
      role: { $in: ['admin', 'branch_admin'] },
      isActive: true
    });
  } else {
    // Auto-assign to any available admin
    escalateToUser = await User.findOne({
      tenancy: tenancyId,
      role: 'admin',
      isActive: true
    });
  }

  if (!escalateToUser) {
    return sendError(res, 'NO_ADMIN_FOUND', 'No admin available for escalation', 400);
  }

  await ticket.escalate(escalateToUser._id, escalationReason);

  // Add escalation message
  await ticket.addMessage(
    supportUserId,
    `Ticket escalated to ${escalateToUser.name}. Reason: ${escalationReason}`,
    true
  );

  const updatedTicket = await Ticket.findById(ticketId)
    .populate('escalatedTo', 'name email');

  sendSuccess(res, { ticket: updatedTicket }, 'Ticket escalated successfully');
});

// @desc    Update ticket priority
// @route   PUT /api/support/tickets/:ticketId/priority
// @access  Private (Support)
const updateTicketPriority = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { priority } = req.body;
  const supportUserId = req.user._id;
  const tenancyId = req.tenancyId;

  if (!Object.values(TICKET_PRIORITY).includes(priority)) {
    return sendError(res, 'INVALID_PRIORITY', 'Invalid ticket priority', 400);
  }

  const ticket = await Ticket.findOne({ 
    _id: ticketId, 
    tenancy: tenancyId,
    assignedTo: supportUserId
  });

  if (!ticket) {
    return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found or not assigned to you', 404);
  }

  const oldPriority = ticket.priority;
  ticket.priority = priority;
  await ticket.save();

  // Add internal message about priority change
  await ticket.addMessage(
    supportUserId,
    `Ticket priority changed from ${oldPriority} to ${priority}`,
    true
  );

  sendSuccess(res, { ticket }, 'Ticket priority updated successfully');
});

module.exports = {
  getSupportDashboard,
  getTickets,
  getTicketById,
  assignTicketToSelf,
  updateTicketStatus,
  addMessage,
  escalateTicket,
  updateTicketPriority
};