const express = require('express')
const router = express.Router()
const superAdminAuditController = require('../controllers/superAdminAuditController')
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple')
const { requirePermission, logAdminAction } = require('../middlewares/superAdminAuth')
const { param, query } = require('express-validator')

// Validation rules
const validateAuditQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('category')
    .optional()
    .isIn(['auth', 'orders', 'branches', 'users', 'finances', 'settings', 'system', 'audit', 'risk_management'])
    .withMessage('Invalid category'),
  query('riskLevel')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Invalid risk level'),
  query('status')
    .optional()
    .isIn(['success', 'failure', 'warning'])
    .withMessage('Invalid status'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date'),
  query('sortBy')
    .optional()
    .isIn(['timestamp', 'action', 'userEmail', 'riskLevel', 'status'])
    .withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Invalid sort order')
]

const validateStatsQuery = [
  query('timeframe')
    .optional()
    .isIn(['24h', '7d', '30d', '90d'])
    .withMessage('Invalid timeframe')
]

const validateExportQuery = [
  query('format')
    .optional()
    .isIn(['json', 'csv'])
    .withMessage('Invalid export format'),
  query('category')
    .optional()
    .isIn(['auth', 'orders', 'branches', 'users', 'finances', 'settings', 'system', 'audit', 'risk_management'])
    .withMessage('Invalid category'),
  query('riskLevel')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Invalid risk level'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date')
]

// All routes require authentication and settings permission (audit is part of settings)
router.use(authenticateSuperAdmin)
router.use(requirePermission('settings'))

// Get audit logs
router.get('/',
  validateAuditQuery,
  logAdminAction('view_audit_logs', 'audit'),
  superAdminAuditController.getAuditLogs
)

// Get audit statistics
router.get('/stats',
  validateStatsQuery,
  logAdminAction('view_audit_stats', 'audit'),
  superAdminAuditController.getAuditStats
)

// Get activity summary
router.get('/activity-summary',
  logAdminAction('view_activity_summary', 'audit'),
  superAdminAuditController.getActivitySummary
)

// Export audit logs
router.get('/export',
  validateExportQuery,
  logAdminAction('export_audit_logs', 'audit'),
  superAdminAuditController.exportAuditLogs
)

// Get single audit log
router.get('/:logId',
  param('logId').isMongoId().withMessage('Valid log ID is required'),
  logAdminAction('view_audit_log_details', 'audit'),
  superAdminAuditController.getAuditLog
)

module.exports = router
