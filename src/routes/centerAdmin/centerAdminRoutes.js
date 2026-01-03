const express = require('express');
const { protect, restrictTo } = require('../../middlewares/auth');
const {
  getDashboard,
  getOrders,
  updateOrderStatus,
  assignStaffToOrder,
  getStaff,
  toggleStaffAvailability,
  getAnalytics,
  getSettings,
  updateSettings,
  getInventory,
  addInventoryItem,
  updateInventoryStock,
  deleteInventoryItem,
  addWorker,
  updateWorker,
  deleteWorker,
  getWorkerTypes,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationsAsRead,
  markAllNotificationsAsRead,
  getBranchServices,
  createBranchService,
  deleteBranchService,
  toggleBranchService,
  updateBranchServiceSettings,
  getServiceItems,
  addServiceItem,
  updateServiceItem,
  deleteServiceItem
} = require('../../controllers/centerAdmin/centerAdminController');

const {
  getStaffTypes,
  createStaffType,
  updateStaffType,
  deleteStaffType
} = require('../../controllers/centerAdmin/staffTypeController');

const router = express.Router();

// Apply authentication and role restriction
// Admin role now handles all branch management (center_admin and branch_manager merged)
router.use(protect);
router.use(restrictTo('admin'));  // Simplified - only admin role

// Dashboard
router.get('/dashboard', getDashboard);

// Orders
router.get('/orders', getOrders);
router.put('/orders/:orderId/status', updateOrderStatus);
router.put('/orders/:orderId/assign', assignStaffToOrder);

// Staff
router.get('/staff', getStaff);
router.patch('/staff/:staffId/availability', toggleStaffAvailability);

// Workers Management
router.get('/worker-types', getWorkerTypes);
router.post('/workers', addWorker);
router.put('/workers/:workerId', updateWorker);
router.delete('/workers/:workerId', deleteWorker);

// Staff Types Management (dynamic staff types)
router.get('/staff-types', getStaffTypes);
router.post('/staff-types', createStaffType);
router.put('/staff-types/:id', updateStaffType);
router.delete('/staff-types/:id', deleteStaffType);

// Inventory
router.get('/inventory', getInventory);
router.post('/inventory', addInventoryItem);
router.put('/inventory/:itemId/stock', updateInventoryStock);
router.delete('/inventory/:itemId', deleteInventoryItem);

// Analytics
router.get('/analytics', getAnalytics);

// Services Management (enable/disable services for branch + create custom services)
router.get('/services', getBranchServices);
router.post('/services', createBranchService);
router.put('/services/:serviceId/toggle', toggleBranchService);
router.put('/services/:serviceId/settings', updateBranchServiceSettings);
router.delete('/services/:serviceId', deleteBranchService);

// Service Items Management (add items to services)
router.get('/services/:serviceId/items', getServiceItems);
router.post('/services/:serviceId/items', addServiceItem);
router.put('/services/:serviceId/items/:itemId', updateServiceItem);
router.delete('/services/:serviceId/items/:itemId', deleteServiceItem);

// Notifications
router.get('/notifications', getNotifications);
router.get('/notifications/unread-count', getUnreadNotificationCount);
router.put('/notifications/mark-read', markNotificationsAsRead);
router.put('/notifications/mark-all-read', markAllNotificationsAsRead);

// Settings
router.get('/settings', getSettings);
router.put('/settings', updateSettings);

module.exports = router;
