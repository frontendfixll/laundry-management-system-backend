const express = require('express');
const router = express.Router();
const salesAnalyticsController = require('../controllers/salesAnalyticsController');
const { authenticateSalesOrSuperAdmin, requireSalesOrSuperAdminPermission, logSalesOrSuperAdminAction } = require('../middlewares/salesOrSuperAdminAuth');

// All routes require sales or superadmin authentication
router.use(authenticateSalesOrSuperAdmin);

// Monthly revenue data
router.get('/monthly-revenue',
  requireSalesOrSuperAdminPermission('analytics', 'view'),
  logSalesOrSuperAdminAction('view_monthly_revenue', 'analytics'),
  salesAnalyticsController.getMonthlyRevenue
);

// Dashboard statistics
router.get('/dashboard-stats',
  requireSalesOrSuperAdminPermission('analytics', 'view'),
  logSalesOrSuperAdminAction('view_dashboard_stats', 'analytics'),
  salesAnalyticsController.getDashboardStats
);

// Expiring trials
router.get('/expiring-trials',
  requireSalesOrSuperAdminPermission('trials', 'view'),
  logSalesOrSuperAdminAction('view_expiring_trials', 'trials'),
  salesAnalyticsController.getExpiringTrials
);

module.exports = router;