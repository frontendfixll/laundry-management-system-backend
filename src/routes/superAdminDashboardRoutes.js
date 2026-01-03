const express = require('express')
const router = express.Router()
const superAdminDashboardController = require('../controllers/superAdminDashboardController')
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple')
const { query } = require('express-validator')

// Dashboard overview validation
const validateDashboardQuery = [
  query('timeframe')
    .optional()
    .isIn(['24h', '7d', '30d', '90d'])
    .withMessage('Invalid timeframe. Must be 24h, 7d, 30d, or 90d')
]

// Analytics query validation
const validateAnalyticsQuery = [
  query('startDate')
    .isISO8601()
    .withMessage('Start date must be a valid ISO 8601 date'),
  query('endDate')
    .isISO8601()
    .withMessage('End date must be a valid ISO 8601 date'),
  query('groupBy')
    .optional()
    .isIn(['hour', 'day', 'week', 'month'])
    .withMessage('Group by must be hour, day, week, or month'),
  query('metrics')
    .optional()
    .custom((value) => {
      if (typeof value === 'string') {
        value = [value]
      }
      if (!Array.isArray(value)) {
        throw new Error('Metrics must be an array')
      }
      const validMetrics = ['revenue', 'orders', 'customers', 'branches']
      const invalidMetrics = value.filter(metric => !validMetrics.includes(metric))
      if (invalidMetrics.length > 0) {
        throw new Error(`Invalid metrics: ${invalidMetrics.join(', ')}`)
      }
      return true
    })
]

// All routes require authentication
router.use(authenticateSuperAdmin)

// Dashboard overview
router.get('/overview',
  validateDashboardQuery,
  superAdminDashboardController.getDashboardOverview
)

// Detailed analytics
router.get('/analytics',
  validateAnalyticsQuery,
  superAdminDashboardController.getDetailedAnalytics
)

module.exports = router