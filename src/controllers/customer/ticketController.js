const Ticket = require('../../models/Ticket');
const Order = require('../../models/Order');
const { 
  sendSuccess, 
  sendError, 
  asyncHandler,
  getPagination,
  formatPaginationResponse
} = require('../../utils/helpers');
const { TICKET_STATUS, TICKET_CATEGORIES } = require('../../config/constants');

// @desc    Create a new ticket
// @route   POST /api/customer/tickets
// @access  Private (Customer)
const createTicket = asyncHandler(async (req, res) => {
  const { title, description, category, relatedOrderId } = req.body;
  const customerId = req.user._id;

  if (!title || !description || !category) {
    return sendError(res, 'MISSING_FIELDS', 'Title, description and category are required', 400);
  }

  // Validate category
  if (!Object.values(TICKET_CATEGORIES).includes(category)) {
    return sendError(res, 'INVALID_CATEGORY', 'Invalid ticket category', 400);
  }

  // If related order provided, verify it belongs to customer
  let relatedOrder = null;
  if (relatedOrderId) {
    relatedOrder = await Order.findOne({ _id: relatedOrderId, customer: customerId });
    if (!relatedOrder) {
      return sendError(res, 'ORDER_NOT_FOUND', 'Related order not found', 404);
    }
  }

  const ticket = await Ticket.create({
    title,
    description,
    category,
    raisedBy: customerId,
    relatedOrder: relatedOrderId || undefined,
    status: TICKET_STATUS.OPEN,
    messages: [{
      sender: customerId,
      message: description,
      isInternal: false,
      timestamp: new Date()
    }]
  });

  const populatedTicket = await Ticket.findById(ticket._id)
    .populate('raisedBy', 'name email')
    .populate('relatedOrder', 'orderNumber status');

  sendSuccess(res, { ticket: populatedTicket }, 'Ticket created successfully', 201);
});

// @desc    Get customer's tickets
// @route   GET /api/customer/tickets
// @access  Private (Customer)
const getTickets = asyncHandler(async (req, res) => {
  const customerId = req.user._id;
  const { page = 1, limit = 10, status } = req.query;
  const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit);

  let query = { raisedBy: customerId };
  if (status) {
    query.status = status;
  }

  const total = await Ticket.countDocuments(query);
  const tickets = await Ticket.find(query)
    .populate('relatedOrder', 'orderNumber status totalAmount')
    .populate('assignedTo', 'name')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .select('ticketNumber title category status priority createdAt updatedAt relatedOrder');

  const response = formatPaginationResponse(tickets, total, pageNum, limitNum);
  sendSuccess(res, response, 'Tickets retrieved successfully');
});

// @desc    Get single ticket
// @route   GET /api/customer/tickets/:ticketId
// @access  Private (Customer)
const getTicketById = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const customerId = req.user._id;

  const ticket = await Ticket.findOne({ _id: ticketId, raisedBy: customerId })
    .populate('raisedBy', 'name email phone')
    .populate('assignedTo', 'name')
    .populate('relatedOrder', 'orderNumber status totalAmount createdAt')
    .populate('messages.sender', 'name role');

  if (!ticket) {
    return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found', 404);
  }

  // Filter out internal messages (customer shouldn't see internal notes)
  const filteredMessages = ticket.messages.filter(msg => !msg.isInternal);
  const ticketObj = ticket.toObject();
  ticketObj.messages = filteredMessages;

  sendSuccess(res, { ticket: ticketObj }, 'Ticket retrieved successfully');
});

// @desc    Add message to ticket
// @route   POST /api/customer/tickets/:ticketId/messages
// @access  Private (Customer)
const addMessage = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { message } = req.body;
  const customerId = req.user._id;

  if (!message) {
    return sendError(res, 'MESSAGE_REQUIRED', 'Message is required', 400);
  }

  const ticket = await Ticket.findOne({ _id: ticketId, raisedBy: customerId });

  if (!ticket) {
    return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found', 404);
  }

  if (ticket.status === TICKET_STATUS.RESOLVED || ticket.status === TICKET_STATUS.CLOSED) {
    return sendError(res, 'TICKET_CLOSED', 'Cannot add message to resolved/closed ticket', 400);
  }

  await ticket.addMessage(customerId, message, false);

  const updatedTicket = await Ticket.findById(ticketId)
    .populate('messages.sender', 'name role')
    .select('messages');

  // Filter out internal messages
  const filteredMessages = updatedTicket.messages.filter(msg => !msg.isInternal);

  sendSuccess(res, { messages: filteredMessages }, 'Message added successfully');
});

// @desc    Get ticket categories
// @route   GET /api/customer/tickets/categories
// @access  Private (Customer)
const getCategories = asyncHandler(async (req, res) => {
  const categories = Object.entries(TICKET_CATEGORIES).map(([key, value]) => ({
    id: value,
    name: value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }));

  sendSuccess(res, { categories }, 'Categories retrieved successfully');
});

// @desc    Submit feedback for resolved ticket
// @route   POST /api/customer/tickets/:ticketId/feedback
// @access  Private (Customer)
const submitFeedback = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { rating, comment } = req.body;
  const customerId = req.user._id;

  if (!rating || rating < 1 || rating > 5) {
    return sendError(res, 'INVALID_RATING', 'Rating must be between 1 and 5', 400);
  }

  const ticket = await Ticket.findOne({ _id: ticketId, raisedBy: customerId });

  if (!ticket) {
    return sendError(res, 'TICKET_NOT_FOUND', 'Ticket not found', 404);
  }

  if (ticket.status !== TICKET_STATUS.RESOLVED) {
    return sendError(res, 'TICKET_NOT_RESOLVED', 'Can only submit feedback for resolved tickets', 400);
  }

  ticket.feedback = {
    rating,
    comment: comment || '',
    submittedAt: new Date()
  };

  await ticket.save();

  sendSuccess(res, { ticket }, 'Feedback submitted successfully');
});

module.exports = {
  createTicket,
  getTickets,
  getTicketById,
  addMessage,
  getCategories,
  submitFeedback
};
