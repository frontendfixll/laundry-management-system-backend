const mongoose = require('mongoose')
const SuperAdmin = require('../models/SuperAdmin')
const CenterAdmin = require('../models/CenterAdmin')
const SalesUser = require('../models/SalesUser')
const Tenancy = require('../models/Tenancy')
const Order = require('../models/Order')
const Transaction = require('../models/Transaction')
const AuditLog = require('../models/AuditLog')
const ComplianceRecord = require('../models/ComplianceRecord')
const SecurityEvent = require('../models/SecurityEvent')
const { sendSuccess, sendError, asyncHandler } = require('../utils/helpers')

/**
 * Audit Controller - Comprehensive audit functionality for Platform Auditors
 * Provides read-only access to all platform data for compliance and auditing
 */

// Get comprehensive audit dashboard overview
const getAuditDashboard = asyncHandler(async (req, res) => {
  try {
    // Get real audit statistics
    const [
      totalAuditLogs,
      todayLogs,
      criticalEvents,
      securityAlerts,
      crossTenantAccess,
      financialTransactions,
      userActions,
      systemEvents,
      complianceScore,
      securityDashboard
    ] = await Promise.all([
      AuditLog.countDocuments(),
      AuditLog.countDocuments({
        timestamp: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }),
      AuditLog.countDocuments({ severity: 'critical' }),
      SecurityEvent.countDocuments({ 
        severity: { $in: ['high', 'critical'] },
        resolved: false 
      }),
      AuditLog.countDocuments({ tenantId: { $ne: null } }),
      Transaction.countDocuments(),
      SuperAdmin.countDocuments() + CenterAdmin.countDocuments() + SalesUser.countDocuments(),
      AuditLog.countDocuments({ action: { $regex: 'SYSTEM_' } }),
      ComplianceRecord.calculateComplianceScore(),
      SecurityEvent.getSecurityDashboard(24)
    ])

    // Get recent real audit logs
    const recentAuditLogs = await AuditLog.find({})
      .populate('tenantId', 'businessName subdomain')
      .sort({ timestamp: -1 })
      .limit(10)
      .lean()

    // Transform audit logs for frontend
    const transformedLogs = recentAuditLogs.map(log => ({
      _id: log._id,
      timestamp: log.timestamp,
      who: log.who,
      role: log.role,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      tenantId: log.tenantId?._id,
      tenantName: log.tenantId?.businessName || 'Platform',
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      outcome: log.outcome,
      details: log.details,
      severity: log.severity
    }))

    // Get tenant overview with real data
    const tenantOverview = await Tenancy.aggregate([
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'tenancyId',
          as: 'orders'
        }
      },
      {
        $lookup: {
          from: 'transactions',
          localField: '_id',
          foreignField: 'tenancyId',
          as: 'transactions'
        }
      },
      {
        $lookup: {
          from: 'centeradmins',
          localField: '_id',
          foreignField: 'tenancyId',
          as: 'users'
        }
      },
      {
        $project: {
          name: '$subdomain',
          businessName: '$businessName',
          totalOrders: { $size: '$orders' },
          totalRevenue: {
            $sum: {
              $map: {
                input: '$transactions',
                as: 'transaction',
                in: '$$transaction.amount'
              }
            }
          },
          activeUsers: { $size: '$users' },
          lastActivity: '$updatedAt',
          status: {
            $cond: {
              if: '$isActive',
              then: 'active',
              else: 'inactive'
            }
          },
          riskScore: {
            $cond: {
              if: { $gt: [{ $size: '$orders' }, 100] },
              then: 1,
              else: {
                $cond: {
                  if: { $gt: [{ $size: '$orders' }, 50] },
                  then: 2,
                  else: 3
                }
              }
            }
          }
        }
      },
      { $limit: 20 }
    ])

    // Get financial integrity data
    const financialIntegrity = await Transaction.aggregate([
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          successfulTransactions: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
            }
          },
          failedTransactions: {
            $sum: {
              $cond: [{ $eq: ['$status', 'failed'] }, 1, 0]
            }
          },
          pendingTransactions: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pending'] }, 1, 0]
            }
          }
        }
      }
    ])

    const financialData = financialIntegrity[0] || {
      totalTransactions: 0,
      totalAmount: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      pendingTransactions: 0
    }

    // Calculate financial metrics
    const refundRate = financialData.totalTransactions > 0 
      ? ((financialData.failedTransactions / financialData.totalTransactions) * 100).toFixed(1)
      : 0

    const chargebackRate = 0.8 // Mock data - implement actual chargeback tracking

    sendSuccess(res, {
      stats: {
        totalAuditLogs,
        todayLogs,
        criticalEvents,
        securityAlerts,
        crossTenantAccess,
        financialTransactions,
        userActions,
        systemEvents,
        complianceScore: Math.round(complianceScore * 10) / 10,
        securityScore: Math.round((100 - securityDashboard.summary.avgRiskScore) * 10) / 10
      },
      recentAuditLogs: transformedLogs,
      tenantOverview,
      financialIntegrity: {
        totalTransactions: financialData.totalTransactions,
        totalAmount: financialData.totalAmount,
        discrepancies: financialData.failedTransactions,
        pendingReconciliation: financialData.pendingTransactions,
        refundRate: parseFloat(refundRate),
        chargebackRate
      },
      securitySummary: securityDashboard.summary,
      complianceOverview: await ComplianceRecord.getComplianceDashboard()
    }, 'Audit dashboard data retrieved successfully')

  } catch (error) {
    console.error('Error fetching audit dashboard:', error)
    sendError(res, 'AUDIT_DASHBOARD_ERROR', 'Failed to fetch audit dashboard data', 500)
  }
})

// Get audit logs with filtering and pagination
const getAuditLogs = asyncHandler(async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      severity, 
      action, 
      entity, 
      startDate, 
      endDate,
      search 
    } = req.query

    // Build query for real audit logs
    let query = {}
    
    if (severity) {
      query.severity = severity
    }
    
    if (action) {
      query.action = { $regex: action, $options: 'i' }
    }
    
    if (entity) {
      query.entity = entity
    }
    
    if (startDate || endDate) {
      query.timestamp = {}
      if (startDate) query.timestamp.$gte = new Date(startDate)
      if (endDate) query.timestamp.$lte = new Date(endDate)
    }
    
    if (search) {
      query.$or = [
        { who: { $regex: search, $options: 'i' } },
        { action: { $regex: search, $options: 'i' } },
        { entity: { $regex: search, $options: 'i' } }
      ]
    }

    // Get real audit logs with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit)
    
    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('tenantId', 'businessName subdomain')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AuditLog.countDocuments(query)
    ])

    // Transform logs for frontend
    const transformedLogs = logs.map(log => ({
      _id: log._id,
      timestamp: log.timestamp,
      who: log.who,
      role: log.role,
      action: log.action,
      entity: log.entity,
      entityId: log.entityId,
      tenantId: log.tenantId?._id,
      tenantName: log.tenantId?.businessName || 'Platform',
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      outcome: log.outcome,
      details: log.details,
      severity: log.severity
    }))

    sendSuccess(res, {
      logs: transformedLogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }, 'Audit logs retrieved successfully')

  } catch (error) {
    console.error('Error fetching audit logs:', error)
    sendError(res, 'AUDIT_LOGS_ERROR', 'Failed to fetch audit logs', 500)
  }
})

// Get cross-tenant overview
const getCrossTenantOverview = asyncHandler(async (req, res) => {
  try {
    const tenants = await Tenancy.aggregate([
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'tenancyId',
          as: 'orders'
        }
      },
      {
        $lookup: {
          from: 'transactions',
          localField: '_id',
          foreignField: 'tenancyId',
          as: 'transactions'
        }
      },
      {
        $lookup: {
          from: 'centeradmins',
          localField: '_id',
          foreignField: 'tenancyId',
          as: 'admins'
        }
      },
      {
        $project: {
          businessName: 1,
          subdomain: 1,
          isActive: 1,
          createdAt: 1,
          updatedAt: 1,
          totalOrders: { $size: '$orders' },
          totalRevenue: {
            $sum: {
              $map: {
                input: '$transactions',
                as: 'transaction',
                in: '$$transaction.amount'
              }
            }
          },
          activeUsers: { $size: '$admins' },
          lastActivity: '$updatedAt',
          riskScore: {
            $switch: {
              branches: [
                { case: { $gt: [{ $size: '$orders' }, 1000] }, then: 1 },
                { case: { $gt: [{ $size: '$orders' }, 500] }, then: 2 },
                { case: { $gt: [{ $size: '$orders' }, 100] }, then: 3 },
                { case: { $gt: [{ $size: '$orders' }, 10] }, then: 4 }
              ],
              default: 5
            }
          }
        }
      },
      { $sort: { totalRevenue: -1 } }
    ])

    sendSuccess(res, { tenants }, 'Cross-tenant overview retrieved successfully')

  } catch (error) {
    console.error('Error fetching cross-tenant overview:', error)
    sendError(res, 'CROSS_TENANT_ERROR', 'Failed to fetch cross-tenant overview', 500)
  }
})

// Get financial audit data
const getFinancialAudit = asyncHandler(async (req, res) => {
  try {
    const { type = 'payments' } = req.query

    let data = {}

    switch (type) {
      case 'payments':
        data = await Transaction.aggregate([
          {
            $group: {
              _id: {
                date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                status: '$status'
              },
              count: { $sum: 1 },
              totalAmount: { $sum: '$amount' }
            }
          },
          { $sort: { '_id.date': -1 } },
          { $limit: 30 }
        ])
        break

      case 'refunds':
        data = await Transaction.find({ 
          type: 'refund',
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        })
        .populate('tenancyId', 'businessName subdomain')
        .sort({ createdAt: -1 })
        .limit(100)
        break

      case 'settlements':
        // Mock settlement data
        data = [
          {
            _id: 'settlement_1',
            date: new Date(),
            tenantId: 'tenant_1',
            tenantName: 'Clean & Fresh Laundry',
            amount: 15000,
            status: 'completed',
            transactionCount: 45
          }
        ]
        break

      case 'ledger':
        data = await Transaction.aggregate([
          {
            $group: {
              _id: '$tenancyId',
              totalCredits: {
                $sum: {
                  $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0]
                }
              },
              totalDebits: {
                $sum: {
                  $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0]
                }
              },
              balance: {
                $sum: {
                  $cond: [
                    { $eq: ['$type', 'credit'] },
                    '$amount',
                    { $multiply: ['$amount', -1] }
                  ]
                }
              }
            }
          },
          {
            $lookup: {
              from: 'tenancies',
              localField: '_id',
              foreignField: '_id',
              as: 'tenant'
            }
          },
          {
            $project: {
              tenantName: { $arrayElemAt: ['$tenant.businessName', 0] },
              totalCredits: 1,
              totalDebits: 1,
              balance: 1
            }
          }
        ])
        break

      default:
        return sendError(res, 'INVALID_TYPE', 'Invalid financial audit type', 400)
    }

    sendSuccess(res, { data, type }, 'Financial audit data retrieved successfully')

  } catch (error) {
    console.error('Error fetching financial audit data:', error)
    sendError(res, 'FINANCIAL_AUDIT_ERROR', 'Failed to fetch financial audit data', 500)
  }
})

// Get security audit data
const getSecurityAudit = asyncHandler(async (req, res) => {
  try {
    const { type = 'failed-logins', hours = 24 } = req.query

    let data = {}

    switch (type) {
      case 'failed-logins':
        data = await SecurityEvent.find({
          eventType: { $in: ['LOGIN_FAILED', 'LOGIN_BRUTE_FORCE'] },
          timestamp: { $gte: new Date(Date.now() - hours * 60 * 60 * 1000) }
        })
        .sort({ timestamp: -1 })
        .limit(100)
        .lean()
        break

      case 'permissions':
        data = await SecurityEvent.find({
          eventType: 'PERMISSION_DENIED',
          timestamp: { $gte: new Date(Date.now() - hours * 60 * 60 * 1000) }
        })
        .sort({ timestamp: -1 })
        .limit(100)
        .lean()
        break

      case 'suspicious':
        data = await SecurityEvent.find({
          eventType: { $in: ['SUSPICIOUS_ACTIVITY', 'UNUSUAL_BEHAVIOR'] },
          timestamp: { $gte: new Date(Date.now() - hours * 60 * 60 * 1000) }
        })
        .sort({ riskScore: -1, timestamp: -1 })
        .limit(100)
        .lean()
        break

      case 'exports':
        data = await AuditLog.find({
          action: 'DATA_EXPORT',
          timestamp: { $gte: new Date(Date.now() - hours * 60 * 60 * 1000) }
        })
        .populate('tenantId', 'businessName')
        .sort({ timestamp: -1 })
        .limit(100)
        .lean()
        break

      default:
        return sendError(res, 'INVALID_TYPE', 'Invalid security audit type', 400)
    }

    sendSuccess(res, { data, type }, 'Security audit data retrieved successfully')

  } catch (error) {
    console.error('Error fetching security audit data:', error)
    sendError(res, 'SECURITY_AUDIT_ERROR', 'Failed to fetch security audit data', 500)
  }
})

// Get RBAC audit data
const getRBACaudit = asyncHandler(async (req, res) => {
  try {
    const { type = 'roles' } = req.query

    let data = {}

    switch (type) {
      case 'roles':
        data = await SuperAdmin.aggregate([
          {
            $lookup: {
              from: 'superadminroles',
              localField: 'roles',
              foreignField: '_id',
              as: 'roleDetails'
            }
          },
          {
            $project: {
              email: 1,
              name: 1,
              isActive: 1,
              roles: '$roleDetails.name',
              lastLogin: 1,
              createdAt: 1
            }
          }
        ])
        break

      case 'permissions':
        const SuperAdminRole = mongoose.model('SuperAdminRole')
        data = await SuperAdminRole.find({}, 'name slug permissions isActive createdAt')
        break

      case 'assignments':
        // Mock role assignment history
        data = [
          {
            _id: '1',
            timestamp: new Date(),
            user: 'admin@laundrylobby.com',
            assignedBy: 'superadmin@laundrylobby.com',
            oldRole: 'Platform Support',
            newRole: 'Platform Finance Admin',
            reason: 'Department transfer'
          }
        ]
        break

      case 'cross-tenant':
        // Mock cross-tenant role analysis
        data = await Tenancy.aggregate([
          {
            $lookup: {
              from: 'centeradmins',
              localField: '_id',
              foreignField: 'tenancyId',
              as: 'admins'
            }
          },
          {
            $project: {
              businessName: 1,
              subdomain: 1,
              adminCount: { $size: '$admins' },
              roles: '$admins.role'
            }
          }
        ])
        break

      default:
        return sendError(res, 'INVALID_TYPE', 'Invalid RBAC audit type', 400)
    }

    sendSuccess(res, { data, type }, 'RBAC audit data retrieved successfully')

  } catch (error) {
    console.error('Error fetching RBAC audit data:', error)
    sendError(res, 'RBAC_AUDIT_ERROR', 'Failed to fetch RBAC audit data', 500)
  }
})

// Export audit data with watermarking
const exportAuditData = asyncHandler(async (req, res) => {
  try {
    const { type, format = 'csv', startDate, endDate } = req.query
    const auditorEmail = req.admin?.email || 'unknown'
    
    // Generate watermark
    const watermark = `AUD-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`
    
    // Get real export data based on type
    let exportData = []
    let filename = ''
    
    switch (type) {
      case 'financial':
        exportData = await Transaction.find({
          createdAt: {
            $gte: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            $lte: endDate ? new Date(endDate) : new Date()
          }
        }).populate('tenancyId', 'businessName subdomain')
        filename = `financial-audit-${watermark}.${format}`
        break
        
      case 'security':
        exportData = await SecurityEvent.find({
          timestamp: {
            $gte: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            $lte: endDate ? new Date(endDate) : new Date()
          }
        })
        filename = `security-audit-${watermark}.${format}`
        break
        
      case 'compliance':
        exportData = await ComplianceRecord.find({
          isActive: true
        })
        filename = `compliance-audit-${watermark}.${format}`
        break
        
      case 'audit-logs':
        exportData = await AuditLog.find({
          timestamp: {
            $gte: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            $lte: endDate ? new Date(endDate) : new Date()
          }
        }).populate('tenantId', 'businessName subdomain')
        filename = `audit-logs-${watermark}.${format}`
        break
        
      default:
        return sendError(res, 'INVALID_TYPE', 'Invalid export type', 400)
    }
    
    // Log export event in audit trail
    await AuditLog.logAction({
      who: auditorEmail,
      whoId: req.admin._id,
      role: 'Platform Auditor',
      action: 'DATA_EXPORT',
      entity: 'AuditLog',
      entityId: watermark,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      outcome: 'success',
      severity: 'medium',
      details: {
        exportType: type,
        format,
        recordCount: exportData.length,
        watermark,
        startDate,
        endDate
      },
      complianceFlags: ['GDPR']
    })
    
    console.log(`🔍 AUDIT EXPORT: ${auditorEmail} exported ${type} data (${watermark})`)
    
    sendSuccess(res, {
      exportId: watermark,
      filename,
      recordCount: exportData.length,
      watermark,
      downloadUrl: `/api/audit/download/${watermark}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    }, 'Export prepared successfully')

  } catch (error) {
    console.error('Error preparing audit export:', error)
    sendError(res, 'EXPORT_ERROR', 'Failed to prepare audit export', 500)
  }
})

// Get compliance dashboard
const getComplianceDashboard = asyncHandler(async (req, res) => {
  try {
    const { tenantId } = req.query
    
    const [
      complianceOverview,
      overdueReviews,
      complianceScore,
      recentAssessments,
      riskDistribution
    ] = await Promise.all([
      ComplianceRecord.getComplianceDashboard(tenantId),
      ComplianceRecord.getOverdueReviews(),
      ComplianceRecord.calculateComplianceScore(tenantId),
      ComplianceRecord.find({
        tenantId: tenantId || null,
        isActive: true
      })
      .sort({ 'lastAssessment.date': -1 })
      .limit(10),
      ComplianceRecord.aggregate([
        { $match: { tenantId: tenantId || null, isActive: true } },
        {
          $group: {
            _id: '$riskLevel',
            count: { $sum: 1 }
          }
        }
      ])
    ])

    sendSuccess(res, {
      overview: complianceOverview,
      overdueReviews: overdueReviews.length,
      complianceScore: Math.round(complianceScore * 10) / 10,
      recentAssessments,
      riskDistribution
    }, 'Compliance dashboard retrieved successfully')

  } catch (error) {
    console.error('Error fetching compliance dashboard:', error)
    sendError(res, 'COMPLIANCE_DASHBOARD_ERROR', 'Failed to fetch compliance dashboard', 500)
  }
})

module.exports = {
  getAuditDashboard,
  getAuditLogs,
  getCrossTenantOverview,
  getFinancialAudit,
  getSecurityAudit,
  getRBACaudit,
  exportAuditData,
  getComplianceDashboard
}