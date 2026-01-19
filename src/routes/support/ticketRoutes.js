const express = require('express');
const {
  getSupportDashboard,
  getTickets,
  getTicketById,
  assignTicketToSelf,
  updateTicketStatus,
  addMessage,
  escalateTicket,
  updateTicketPriority
} = require('../../controllers/support/ticketController');
const { validate, ticketValidation } = require('../../utils/validators');

const router = express.Router();

// Support dashboard
router.get('/dashboard', getSupportDashboard);

// Ticket management
router.get('/', getTickets);
router.get('/:ticketId', getTicketById);
router.post('/:ticketId/assign', assignTicketToSelf);
router.put('/:ticketId/status', validate(ticketValidation.updateStatus), updateTicketStatus);
router.post('/:ticketId/messages', validate(ticketValidation.addMessage), addMessage);
router.post('/:ticketId/escalate', validate(ticketValidation.escalate), escalateTicket);
router.put('/:ticketId/priority', validate(ticketValidation.updatePriority), updateTicketPriority);

module.exports = router;