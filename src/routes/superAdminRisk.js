const express = require('express')
const router = express.Router()
const superAdminRiskController = require('../controllers/superAdminRiskController')
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple')
const { requirePermission, logAdminAction } = require('../middlewares/superAdminAuth')
const { body, param, query } = require('express-validator')

// Validation rules
const validateComplaintEscalation = [
  body('reason')
    .isLength({ min: 1, max: 500 })
    .withMessage('Escalation reason is required and must not exceed 500 characters'),
  body('level')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Escalation level must be between 1 and 5')
]

const validateComplaintAssignment = [
  body('assignedTo')
    .isMongoId()
    .withMessage('Valid assignee ID is required'),
  body('assignedToModel')
    .isIn(['CenterAdmin', 'SupportAgent', 'BranchManager'])
    .withMessage('Valid assignee model is required')
]

const validateComplaintResolution = [
  body('resolution')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Resolution description is required and must not exceed 1000 characters'),
  body('resolutionType')
    .isIn(['refund', 'replacement', 'compensation', 'apology', 'policy_change', 'no_action', 'other'])
    .withMessage('Valid resolution type is required'),
  body('amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number')
]

const validateBlacklistEntry = [
  body('entityType')
    .isIn(['customer', 'driver', 'vendor', 'branch_staff', 'phone_number', 'email', 'device', 'ip_address'])
    .withMessage('Valid entity type is required'),
  body('reason')
    .isIn(['fraud', 'payment_default', 'abusive_behavior', 'fake_orders', 'policy_violation', 'security_threat', 'spam', 'identity_theft', 'chargeback_abuse', 'other'])
    .withMessage('Valid reason is required'),
  body('description')
    .isLength({ min: 1, max: 1000 })
    .withMessage('Description is required and must not exceed 1000 characters'),
  body('severity')
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Valid severity is required'),
  body('identifiers')
    .isObject()
    .withMessage('Identifiers object is required')
]

const validateSLAConfiguration = [
  body('name')
    .isLength({ min: 1, max: 100 })
    .withMessage('Configuration name is required and must not exceed 100 characters'),
  body('targets')
    .isArray({ min: 1 })
    .withMessage('At least one SLA target is required'),
  body('targets.*.category')
    .isIn(['service_quality', 'delivery_delay', 'damaged_items', 'missing_items', 'billing_issue', 'staff_behavior', 'refund_request', 'technical_issue', 'fraud_report', 'other'])
    .withMessage('Valid category is required for each target'),
  body('targets.*.severity')
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Valid severity is required for each target'),
  body('targets.*.priority')
    .isIn(['low', 'normal', 'high', 'urgent'])
    .withMessage('Valid priority is required for each target'),
  body('targets.*.firstResponseTime')
    .isInt({ min: 1 })
    .withMessage('First response time must be a positive integer (minutes)'),
  body('targets.*.resolutionTime')
    .isInt({ min: 1 })
    .withMessage('Resolution time must be a positive integer (minutes)')
]

// All routes require authentication and settings permission
router.use(authenticateSuperAdmin)
router.use(requirePermission('settings'))

// Risk Management Overview
router.get('/overview',
  query('timeframe')
    .optional()
    .isIn(['7d', '30d', '90d'])
    .withMessage('Invalid timeframe'),
  logAdminAction('view_risk_overview', 'risk_management'),
  superAdminRiskController.getRiskOverview
)

// Complaints Management
router.get('/complaints',
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['open', 'in_progress', 'escalated', 'resolved', 'closed', 'reopened'])
    .withMessage('Invalid complaint status'),
  query('category')
    .optional()
    .isIn(['service_quality', 'delivery_delay', 'damaged_items', 'missing_items', 'billing_issue', 'staff_behavior', 'refund_request', 'technical_issue', 'fraud_report', 'other'])
    .withMessage('Invalid complaint category'),
  query('severity')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical'])
    .withMessage('Invalid severity'),
  query('priority')
    .optional()
    .isIn(['low', 'normal', 'high', 'urgent'])
    .withMessage('Invalid priority'),
  logAdminAction('view_complaints', 'risk_management'),
  superAdminRiskController.getComplaints
)

router.get('/complaints/:complaintId',
  param('complaintId').isMongoId().withMessage('Valid complaint ID is required'),
  logAdminAction('view_complaint_details', 'risk_management'),
  superAdminRiskController.getComplaint
)

router.post('/complaints/:complaintId/escalate',
  param('complaintId').isMongoId().withMessage('Valid complaint ID is required'),
  validateComplaintEscalation,
  logAdminAction('escalate_complaint', 'risk_management'),
  superAdminRiskController.escalateComplaint
)

router.post('/complaints/:complaintId/assign',
  param('complaintId').isMongoId().withMessage('Valid complaint ID is required'),
  validateComplaintAssignment,
  logAdminAction('assign_complaint', 'risk_management'),
  superAdminRiskController.assignComplaint
)

router.post('/complaints/:complaintId/resolve',
  param('complaintId').isMongoId().withMessage('Valid complaint ID is required'),
  validateComplaintResolution,
  logAdminAction('resolve_complaint', 'risk_management'),
  superAdminRiskController.resolveComplaint
)

// Blacklist Management
router.get('/blacklist',
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('entityType')
    .optional()
    .isIn(['customer', 'driver', 'vendor', 'branch_staff', 'phone_number', 'email', 'device', 'ip_address'])
    .withMessage('Invalid entity type'),
  query('status')
    .optional()
    .isIn(['active', 'inactive', 'under_review', 'appealed', 'expired'])
    .withMessage('Invalid status'),
  query('reason')
    .optional()
    .isIn(['fraud', 'payment_default', 'abusive_behavior', 'fake_orders', 'policy_violation', 'security_threat', 'spam', 'identity_theft', 'chargeback_abuse', 'other'])
    .withMessage('Invalid reason'),
  logAdminAction('view_blacklist', 'risk_management'),
  superAdminRiskController.getBlacklistEntries
)

router.post('/blacklist',
  validateBlacklistEntry,
  logAdminAction('create_blacklist_entry', 'risk_management'),
  superAdminRiskController.createBlacklistEntry
)

router.put('/blacklist/:entryId',
  param('entryId').isMongoId().withMessage('Valid entry ID is required'),
  logAdminAction('update_blacklist_entry', 'risk_management'),
  superAdminRiskController.updateBlacklistEntry
)

router.post('/blacklist/check',
  body('entityType')
    .isIn(['customer', 'driver', 'vendor', 'branch_staff', 'phone_number', 'email', 'device', 'ip_address'])
    .withMessage('Valid entity type is required'),
  body('identifiers')
    .isObject()
    .withMessage('Identifiers object is required'),
  superAdminRiskController.checkBlacklist
)

// SLA Configuration Management
router.get('/sla-configs',
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('scope')
    .optional()
    .isIn(['global', 'regional', 'city', 'branch'])
    .withMessage('Invalid scope'),
  logAdminAction('view_sla_configurations', 'risk_management'),
  superAdminRiskController.getSLAConfigurations
)

router.post('/sla-configs',
  validateSLAConfiguration,
  logAdminAction('create_sla_configuration', 'risk_management'),
  superAdminRiskController.createSLAConfiguration
)

module.exports = router
