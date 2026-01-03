const express = require('express');
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple');
const {
  getAllOrders,
  getOrderById,
  assignOrderToBranch,
  assignLogisticsPartner,
  updateOrderStatus
} = require('../controllers/superAdminOrdersController');

const router = express.Router();

// Apply super admin authentication
router.use(authenticateSuperAdmin);

// Order routes
router.get('/', getAllOrders);
router.get('/:orderId', getOrderById);
router.put('/:orderId/assign-branch', assignOrderToBranch);
router.put('/:orderId/assign-logistics', assignLogisticsPartner);
router.put('/:orderId/status', updateOrderStatus);

module.exports = router;
