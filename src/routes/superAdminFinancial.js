const express = require('express')
const router = express.Router()
const superAdminFinancialController = require('../controllers/superAdminFinancialController')
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple')
const { requirePermission, logAdminAction } = require('../middlewares/superAdminAuth')
const { body, param, query } = require('express-validator')

// Validation rules
const validateRefundApproval = [
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes must not exceed 500 characters')
]

const validateRefundRejection = [
  body('reason')
    .isLength({ min: 1, max: 500 })
    .withMessage('Rejection reason is required and must not exceed 500 characters')
]

const validateSettlementCreation = [
  body('type')
    .isIn(['driver', 'branch', 'staff', 'vendor', 'partner'])
    .withMessage('Valid settlement type is required'),
  body('recipientId')
    .isMongoId()
    .withMessage('Valid recipient ID is required'),
  body('recipientName')
    .isLength({ min: 1, max: 100 })
    .withMessage('Recipient name is required'),
  body('grossAmount')
    .isFloat({ min: 0 })
    .withMessage('Gross amount must be a positive number'),
  body('netAmount')
    .isFloat({ min: 0 })
    .withMessage('Net amount must be a positive number'),
  body('periodStart')
    .isISO8601()
    .withMessage('Valid period start date is required'),
  body('periodEnd')
    .isISO8601()
    .withMessage('Valid period end date is required'),
  body('paymentMethod')
    .isIn(['bank_transfer', 'upi', 'cash', 'cheque', 'wallet'])
    .withMessage('Valid payment method is required')
]

const validateReportGeneration = [
  body('type')
    .isIn(['revenue_report', 'expense_report', 'profit_loss', 'cash_flow', 'settlement_report'])
    .withMessage('Valid report type is required'),
  body('startDate')
    .isISO8601()
    .withMessage('Valid start date is required'),
  body('endDate')
    .isISO8601()
    .withMessage('Valid end date is required'),
  body('filters')
    .optional()
    .isObject()
    .withMessage('Filters must be an object')
]

// All routes require authentication and finances permission
router.use(authenticateSuperAdmin)
router.use(requirePermission('finances'))

// Financial Overview
router.get('/overview',
  query('timeframe')
    .optional()
    .isIn(['7d', '30d', '90d', '1y'])
    .withMessage('Invalid timeframe'),
  logAdminAction('view_financial_overview', 'financial'),
  superAdminFinancialController.getFinancialOverview
)

// Transactions
router.get('/transactions',
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('type')
    .optional()
    .isIn(['payment', 'refund', 'settlement', 'commission', 'penalty', 'bonus', 'adjustment'])
    .withMessage('Invalid transaction type'),
  query('status')
    .optional()
    .isIn(['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'])
    .withMessage('Invalid transaction status'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date'),
  logAdminAction('view_transactions', 'financial'),
  superAdminFinancialController.getTransactions
)

router.get('/transactions/:transactionId',
  param('transactionId').isMongoId().withMessage('Valid transaction ID is required'),
  logAdminAction('view_transaction_details', 'financial'),
  superAdminFinancialController.getTransaction
)

// Refund Management
router.post('/transactions/:transactionId/approve-refund',
  param('transactionId').isMongoId().withMessage('Valid transaction ID is required'),
  validateRefundApproval,
  logAdminAction('approve_refund', 'financial'),
  superAdminFinancialController.approveRefund
)

router.post('/transactions/:transactionId/reject-refund',
  param('transactionId').isMongoId().withMessage('Valid transaction ID is required'),
  validateRefundRejection,
  logAdminAction('reject_refund', 'financial'),
  superAdminFinancialController.rejectRefund
)

// Settlements
router.get('/settlements',
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('type')
    .optional()
    .isIn(['driver', 'branch', 'staff', 'vendor', 'partner'])
    .withMessage('Invalid settlement type'),
  query('status')
    .optional()
    .isIn(['draft', 'pending_approval', 'approved', 'processing', 'completed', 'failed', 'cancelled'])
    .withMessage('Invalid settlement status'),
  logAdminAction('view_settlements', 'financial'),
  superAdminFinancialController.getSettlements
)

router.post('/settlements',
  validateSettlementCreation,
  logAdminAction('create_settlement', 'financial'),
  superAdminFinancialController.createSettlement
)

router.post('/settlements/:settlementId/approve',
  param('settlementId').isMongoId().withMessage('Valid settlement ID is required'),
  body('comments')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Comments must not exceed 500 characters'),
  logAdminAction('approve_settlement', 'financial'),
  superAdminFinancialController.approveSettlement
)

// Revenue report data (analytics) - must be before /reports/:reportId
router.get('/reports/revenue',
  query('range').optional().isIn(['7d', '30d', '90d', '6m', '1y']).withMessage('Invalid range'),
  query('type').optional().isIn(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).withMessage('Invalid type'),
  logAdminAction('view_revenue_report_data', 'financial'),
  superAdminFinancialController.getRevenueReportData
)

// Financial Reports (list generated reports)
router.get('/reports',
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('type')
    .optional()
    .isIn(['revenue_report', 'expense_report', 'profit_loss', 'cash_flow', 'settlement_report'])
    .withMessage('Invalid report type'),
  query('status')
    .optional()
    .isIn(['generating', 'completed', 'failed', 'scheduled'])
    .withMessage('Invalid report status'),
  logAdminAction('view_financial_reports', 'financial'),
  superAdminFinancialController.getReports
)

router.post('/reports/generate',
  validateReportGeneration,
  logAdminAction('generate_financial_report', 'financial'),
  superAdminFinancialController.generateReport
)

router.get('/reports/:reportId',
  param('reportId').isMongoId().withMessage('Valid report ID is required'),
  logAdminAction('view_financial_report', 'financial'),
  superAdminFinancialController.getReport
)

module.exports = router
