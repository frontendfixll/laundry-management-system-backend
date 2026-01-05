const express = require('express');
const { protect, requirePermission } = require('../../middlewares/auth');
const { injectTenancyFromUser } = require('../../middlewares/tenancyMiddleware');
const {
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
  getLogisticsPartnerById,
  createLogisticsPartner,
  updateLogisticsPartner,
  deleteLogisticsPartner,
  toggleLogisticsPartnerStatus,
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
} = require('../../controllers/admin/adminController');

// Import inventory functions from center admin controller
const {
  getInventory,
  addInventoryItem,
  updateInventoryStock,
  deleteInventoryItem
} = require('../../controllers/centerAdmin/centerAdminController');

const {
  getWeeklyOrders,
  getOrderStatusDistribution,
  getRevenueData,
  getHourlyOrders,
  getServiceDistribution
} = require('../../controllers/admin/analyticsController');

// Support/Ticket functions (merged from support controller)
const {
  getSupportDashboard,
  getTickets,
  getTicketById,
  updateTicketStatus,
  assignTicket,
  addMessageToTicket,
  escalateTicket,
  resolveTicket
} = require('../../controllers/support/supportController');

const {
  getDeliveryPricing,
  updateDeliveryPricing,
  updateBranchCoordinates,
  getBranchCoordinates,
  getBranchesCoordinatesStatus,
  updateBranchDeliveryPricing
} = require('../../controllers/admin/deliveryPricingController');

// Branding routes for multi-tenant support
const brandingRoutes = require('./brandingRoutes');

const router = express.Router();

// Apply authentication and tenancy injection
router.use(protect);
router.use(injectTenancyFromUser);

// Dashboard routes
router.get('/dashboard', getDashboard);

// Analytics routes for charts
router.get('/analytics/weekly-orders', getWeeklyOrders);
router.get('/analytics/order-status', getOrderStatusDistribution);
router.get('/analytics/revenue', getRevenueData);
router.get('/analytics/hourly-orders', getHourlyOrders);
router.get('/analytics/service-distribution', getServiceDistribution);

// Order management routes
router.get('/orders', getAllOrders);
router.put('/orders/:orderId/assign-branch', assignOrderToBranch);
router.put('/orders/:orderId/assign-logistics', assignOrderToLogistics);
router.put('/orders/:orderId/status', updateOrderStatus);
router.put('/orders/:orderId/payment-status', updatePaymentStatus);
router.post('/fix-delivered-payments', fixDeliveredPayments);

// Customer management routes
router.get('/customers', getCustomers);
router.put('/customers/:customerId/toggle-status', toggleCustomerStatus);
router.put('/customers/:customerId/vip', tagVIPCustomer);

// Complaint management routes
router.get('/complaints', getComplaints);
router.get('/complaints/:complaintId', getComplaintById);
router.put('/complaints/:complaintId/assign', assignComplaint);
router.put('/complaints/:complaintId/status', updateComplaintStatus);

// Refund management routes
router.get('/refunds', getRefundRequests);
router.get('/refunds/:refundId', getRefundById);
router.post('/refunds', createRefundRequest);
router.put('/refunds/:refundId/approve', approveRefund);
router.put('/refunds/:refundId/reject', rejectRefund);
router.put('/refunds/:refundId/escalate', escalateRefund);
router.put('/refunds/:refundId/process', processRefund);

// Support agents and logistics partners
router.get('/support-agents', getSupportAgents);
router.get('/logistics-partners', getLogisticsPartners);
router.get('/logistics-partners/:partnerId', getLogisticsPartnerById);
router.post('/logistics-partners', requirePermission('logistics', 'create'), createLogisticsPartner);
router.put('/logistics-partners/:partnerId', requirePermission('logistics', 'update'), updateLogisticsPartner);
router.delete('/logistics-partners/:partnerId', requirePermission('logistics', 'delete'), deleteLogisticsPartner);
router.patch('/logistics-partners/:partnerId/toggle-status', requirePermission('logistics', 'update'), toggleLogisticsPartnerStatus);

// Payment management routes
router.get('/payments', getPayments);
router.get('/payments/stats', getPaymentStats);

// Analytics routes
router.get('/analytics', getAnalytics);

// Staff management routes
router.get('/staff', getStaff);
router.get('/staff/:staffId', getStaffById);
router.post('/staff', createStaff);
router.put('/staff/:staffId', updateStaff);
router.delete('/staff/:staffId', deleteStaff);
router.put('/staff/:staffId/reactivate', reactivateStaff);
router.patch('/staff/:userId/status', toggleStaffStatus);

// Branch management routes
router.get('/branches', getBranches);
router.get('/branches/coordinates-status', getBranchesCoordinatesStatus);
router.get('/branches/:branchId/coordinates', getBranchCoordinates);
router.put('/branches/:branchId/coordinates', updateBranchCoordinates);
router.put('/branches/:branchId/delivery-pricing', updateBranchDeliveryPricing);

// Delivery pricing routes
router.get('/delivery-pricing', getDeliveryPricing);
router.put('/delivery-pricing', updateDeliveryPricing);

// Notification routes
router.get('/notifications', getNotifications);
router.get('/notifications/unread-count', getUnreadNotificationCount);
router.put('/notifications/mark-read', markNotificationsAsRead);
router.put('/notifications/mark-all-read', markAllNotificationsAsRead);

// Support Ticket routes (RBAC controlled - requires support permission)
router.get('/support/dashboard', getSupportDashboard);
router.get('/support/tickets', getTickets);
router.get('/support/tickets/:ticketId', getTicketById);
router.put('/support/tickets/:ticketId/status', updateTicketStatus);
router.put('/support/tickets/:ticketId/assign', assignTicket);
router.post('/support/tickets/:ticketId/messages', addMessageToTicket);
router.put('/support/tickets/:ticketId/escalate', escalateTicket);
router.put('/support/tickets/:ticketId/resolve', resolveTicket);

// Inventory routes
router.get('/inventory', getInventory);
router.post('/inventory', addInventoryItem);
router.put('/inventory/:itemId/stock', updateInventoryStock);
router.delete('/inventory/:itemId', deleteInventoryItem);

// Branding routes (multi-tenant)
router.use('/tenancy', brandingRoutes);

module.exports = router;