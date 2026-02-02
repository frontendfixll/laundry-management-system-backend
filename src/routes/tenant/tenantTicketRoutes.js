const express = require('express');
const router = express.Router();
const {
  createTenantTicket,
  getTenantTickets,
  getTenantTicket,
  addTicketMessage,
  reopenTicket,
  acceptResolution,
  getTenantTicketStats,
  getSubcategoriesForCategory
} = require('../../controllers/tenantTicketController');

// Middleware to ensure user is tenant admin or staff
const requireTenantRole = (req, res, next) => {
  if (!req.user || !['admin', 'branch_admin', 'staff'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Tenant role required.'
    });
  }
  next();
};

// Ticket Statistics
router.get('/stats', requireTenantRole, getTenantTicketStats);

// Get subcategories for a category
router.get('/categories/:category/subcategories', requireTenantRole, getSubcategoriesForCategory);

// Ticket CRUD Operations
router.post('/', requireTenantRole, createTenantTicket);
router.get('/', requireTenantRole, getTenantTickets);
router.get('/:id', requireTenantRole, getTenantTicket);

// Ticket Actions
router.post('/:id/messages', requireTenantRole, addTicketMessage);
router.post('/:id/reopen', requireTenantRole, reopenTicket);
router.post('/:id/accept-resolution', requireTenantRole, acceptResolution);

module.exports = router;