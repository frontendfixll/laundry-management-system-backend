const express = require('express')
const router = express.Router()
const auditController = require('../controllers/auditController')
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple')
const { requirePermission, logAdminAction } = require('../middlewares/superAdminAuth')
const { param, query } = require('express-validator')

// All routes require authentication (auditor role is allowed)
router.use(authenticateSuperAdmin)

// Audit Dashboard
router.get('/dashboard', auditController.getAuditDashboard)

// Audit Logs
router.get('/logs', auditController.getAuditLogs)
router.get('/logs/users', auditController.getAuditLogs) // Filter by user actions
router.get('/logs/roles', auditController.getAuditLogs) // Filter by role assignments
router.get('/logs/system', auditController.getAuditLogs) // Filter by system events
router.get('/logs/auth', auditController.getAuditLogs) // Filter by auth events

// Cross-Tenant Visibility
router.get('/tenants', auditController.getCrossTenantOverview)
router.get('/tenants/financials', auditController.getCrossTenantOverview)
router.get('/tenants/patterns', auditController.getCrossTenantOverview)
router.get('/tenants/anomalies', auditController.getCrossTenantOverview)

// Financial Transparency
router.get('/financial/payments', (req, res, next) => {
  req.query.type = 'payments'
  auditController.getFinancialAudit(req, res, next)
})
router.get('/financial/refunds', (req, res, next) => {
  req.query.type = 'refunds'
  auditController.getFinancialAudit(req, res, next)
})
router.get('/financial/settlements', (req, res, next) => {
  req.query.type = 'settlements'
  auditController.getFinancialAudit(req, res, next)
})
router.get('/financial/ledger', (req, res, next) => {
  req.query.type = 'ledger'
  auditController.getFinancialAudit(req, res, next)
})

// Security Monitoring
router.get('/security/failed-logins', (req, res, next) => {
  req.query.type = 'failed-logins'
  auditController.getSecurityAudit(req, res, next)
})
router.get('/security/permissions', (req, res, next) => {
  req.query.type = 'permissions'
  auditController.getSecurityAudit(req, res, next)
})
router.get('/security/suspicious', (req, res, next) => {
  req.query.type = 'suspicious'
  auditController.getSecurityAudit(req, res, next)
})
router.get('/security/exports', (req, res, next) => {
  req.query.type = 'exports'
  auditController.getSecurityAudit(req, res, next)
})

// Support & Ticket Oversight
router.get('/support/tickets', auditController.getAuditLogs) // All support tickets
router.get('/support/sla', auditController.getAuditLogs) // SLA compliance
router.get('/support/escalations', auditController.getAuditLogs) // Escalation history
router.get('/support/impersonation', auditController.getAuditLogs) // Impersonation logs

// RBAC Audit
router.get('/rbac/roles', (req, res, next) => {
  req.query.type = 'roles'
  auditController.getRBACaudit(req, res, next)
})
router.get('/rbac/permissions', (req, res, next) => {
  req.query.type = 'permissions'
  auditController.getRBACaudit(req, res, next)
})
router.get('/rbac/assignments', (req, res, next) => {
  req.query.type = 'assignments'
  auditController.getRBACaudit(req, res, next)
})
router.get('/rbac/cross-tenant', (req, res, next) => {
  req.query.type = 'cross-tenant'
  auditController.getRBACaudit(req, res, next)
})

// Compliance & Reports
router.get('/compliance/dashboard', auditController.getComplianceDashboard)
router.get('/reports/financial', (req, res, next) => {
  req.query.type = 'financial'
  auditController.getFinancialAudit(req, res, next)
})
router.get('/reports/refund-abuse', auditController.getAuditLogs)
router.get('/reports/tenant-behavior', auditController.getCrossTenantOverview)
router.get('/reports/sla-support', auditController.getAuditLogs)
router.get('/reports/security', (req, res, next) => {
  req.query.type = 'suspicious'
  auditController.getSecurityAudit(req, res, next)
})

// Export Capabilities
router.post('/export/pdf', (req, res, next) => {
  req.query.format = 'pdf'
  auditController.exportAuditData(req, res, next)
})
router.post('/export/csv', (req, res, next) => {
  req.query.format = 'csv'
  auditController.exportAuditData(req, res, next)
})
router.post('/export/excel', (req, res, next) => {
  req.query.format = 'excel'
  auditController.exportAuditData(req, res, next)
})
router.get('/export/history', auditController.getAuditLogs) // Export history

module.exports = router
