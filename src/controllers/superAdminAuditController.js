const AuditLog = require('../models/AuditLog')
const CenterAdmin = require('../models/CenterAdmin')
const { validationResult } = require('express-validator')

class CenterAdminAuditController {
  // Get audit logs with filtering and pagination
  async getAuditLogs(req, res) {
    try {
      const {
        page = 1,
        limit = 50,
        category,
        action,
        userEmail,
        riskLevel,
        status,
        startDate,
        endDate,
        search,
        sortBy = 'timestamp',
        sortOrder = 'desc'
      } = req.query

      // Build filter query
      const filter = {}

      if (category) filter.category = category
      if (action) filter.action = { $regex: action, $options: 'i' }
      if (userEmail) filter.userEmail = { $regex: userEmail, $options: 'i' }
      if (riskLevel) filter.riskLevel = riskLevel
      if (status) filter.status = status

      // Date range filter
      if (startDate || endDate) {
        filter.timestamp = {}
        if (startDate) filter.timestamp.$gte = new Date(startDate)
        if (endDate) filter.timestamp.$lte = new Date(endDate)
      }

      // Search filter
      if (search) {
        filter.$or = [
          { action: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { userEmail: { $regex: search, $options: 'i' } }
        ]
      }

      // Sort configuration
      const sort = {}
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1

      // Execute query with pagination
      const skip = (parseInt(page) - 1) * parseInt(limit)
      const [logs, total] = await Promise.all([
        AuditLog.find(filter)
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        AuditLog.countDocuments(filter)
      ])

      // Calculate pagination info
      const pages = Math.ceil(total / parseInt(limit))

      return res.json({
        success: true,
        data: {
          logs,
          pagination: {
            current: parseInt(page),
            pages,
            total,
            limit: parseInt(limit)
          }
        }
      })
    } catch (error) {
      console.error('Get audit logs error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch audit logs'
      })
    }
  }

  // Get audit log by ID
  async getAuditLog(req, res) {
    try {
      const { logId } = req.params

      const log = await AuditLog.findById(logId).lean()
      if (!log) {
        return res.status(404).json({
          success: false,
          message: 'Audit log not found'
        })
      }

      return res.json({
        success: true,
        data: { log }
      })
    } catch (error) {
      console.error('Get audit log error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch audit log'
      })
    }
  }

  // Get audit statistics
  async getAuditStats(req, res) {
    try {
      const { timeframe = '30d' } = req.query

      // Calculate date range
      const endDate = new Date()
      const startDate = new Date()
      
      switch (timeframe) {
        case '24h':
          startDate.setHours(endDate.getHours() - 24)
          break
        case '7d':
          startDate.setDate(endDate.getDate() - 7)
          break
        case '30d':
          startDate.setDate(endDate.getDate() - 30)
          break
        case '90d':
          startDate.setDate(endDate.getDate() - 90)
          break
        default:
          startDate.setDate(endDate.getDate() - 30)
      }

      // Get statistics
      const [
        totalLogs,
        logsByCategory,
        logsByRiskLevel,
        logsByStatus,
        recentActivity,
        topUsers,
        topActions
      ] = await Promise.all([
        // Total logs in timeframe
        AuditLog.countDocuments({
          timestamp: { $gte: startDate, $lte: endDate }
        }),

        // Logs by category
        AuditLog.aggregate([
          { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),

        // Logs by risk level
        AuditLog.aggregate([
          { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
          { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),

        // Logs by status
        AuditLog.aggregate([
          { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ]),

        // Recent high-risk activities
        AuditLog.find({
          timestamp: { $gte: startDate, $lte: endDate },
          riskLevel: { $in: ['high', 'critical'] }
        })
          .sort({ timestamp: -1 })
          .limit(10)
          .lean(),

        // Top users by activity
        AuditLog.aggregate([
          { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
          { $group: { _id: '$userEmail', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ]),

        // Top actions
        AuditLog.aggregate([
          { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
          { $group: { _id: '$action', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ])
      ])

      // Calculate activity timeline (daily breakdown)
      const activityTimeline = await AuditLog.aggregate([
        { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: {
              year: { $year: '$timestamp' },
              month: { $month: '$timestamp' },
              day: { $dayOfMonth: '$timestamp' }
            },
            total: { $sum: 1 },
            success: {
              $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
            },
            failure: {
              $sum: { $cond: [{ $eq: ['$status', 'failure'] }, 1, 0] }
            },
            high_risk: {
              $sum: { $cond: [{ $in: ['$riskLevel', ['high', 'critical']] }, 1, 0] }
            }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ])

      return res.json({
        success: true,
        data: {
          overview: {
            totalLogs,
            timeframe,
            startDate,
            endDate
          },
          breakdown: {
            byCategory: logsByCategory,
            byRiskLevel: logsByRiskLevel,
            byStatus: logsByStatus
          },
          activity: {
            timeline: activityTimeline,
            recentHighRisk: recentActivity,
            topUsers,
            topActions
          }
        }
      })
    } catch (error) {
      console.error('Get audit stats error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch audit statistics'
      })
    }
  }

  // Export audit logs
  async exportAuditLogs(req, res) {
    try {
      const {
        format = 'json',
        category,
        startDate,
        endDate,
        riskLevel
      } = req.query

      // Build filter
      const filter = {}
      if (category) filter.category = category
      if (riskLevel) filter.riskLevel = riskLevel
      if (startDate || endDate) {
        filter.timestamp = {}
        if (startDate) filter.timestamp.$gte = new Date(startDate)
        if (endDate) filter.timestamp.$lte = new Date(endDate)
      }

      // Get logs
      const logs = await AuditLog.find(filter)
        .sort({ timestamp: -1 })
        .limit(10000) // Limit for performance
        .lean()

      // Log the export action
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'export_audit_logs',
        category: 'audit',
        description: `Exported ${logs.length} audit logs in ${format} format`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        status: 'success',
        riskLevel: 'medium',
        metadata: {
          format,
          recordCount: logs.length,
          filters: { category, startDate, endDate, riskLevel }
        }
      })

      if (format === 'csv') {
        // Convert to CSV
        const csv = this.convertToCSV(logs)
        res.setHeader('Content-Type', 'text/csv')
        res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${Date.now()}.csv`)
        return res.send(csv)
      }

      // Return JSON by default
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${Date.now()}.json`)
      return res.json({
        success: true,
        data: {
          logs,
          exportedAt: new Date(),
          totalRecords: logs.length
        }
      })
    } catch (error) {
      console.error('Export audit logs error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to export audit logs'
      })
    }
  }

  // Helper method to convert logs to CSV
  convertToCSV(logs) {
    if (logs.length === 0) return ''

    const headers = [
      'Timestamp',
      'User Email',
      'Action',
      'Category',
      'Description',
      'Status',
      'Risk Level',
      'IP Address',
      'User Agent'
    ]

    const rows = logs.map(log => [
      log.timestamp?.toISOString() || '',
      log.userEmail || '',
      log.action || '',
      log.category || '',
      log.description || '',
      log.status || '',
      log.riskLevel || '',
      log.ipAddress || '',
      log.userAgent || ''
    ])

    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    return csvContent
  }

  // Get system activity summary
  async getActivitySummary(req, res) {
    try {
      const now = new Date()
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

      const [
        last24hActivity,
        last7dActivity,
        criticalAlerts,
        failedLogins,
        systemErrors
      ] = await Promise.all([
        AuditLog.countDocuments({ timestamp: { $gte: last24h } }),
        AuditLog.countDocuments({ timestamp: { $gte: last7d } }),
        AuditLog.countDocuments({ 
          riskLevel: 'critical',
          timestamp: { $gte: last24h }
        }),
        AuditLog.countDocuments({
          action: 'failed_login',
          timestamp: { $gte: last24h }
        }),
        AuditLog.countDocuments({
          status: 'failure',
          category: 'system',
          timestamp: { $gte: last24h }
        })
      ])

      return res.json({
        success: true,
        data: {
          summary: {
            last24h: last24hActivity,
            last7d: last7dActivity,
            criticalAlerts,
            failedLogins,
            systemErrors
          },
          alerts: {
            highFailedLogins: failedLogins > 10,
            criticalIssues: criticalAlerts > 0,
            systemIssues: systemErrors > 5
          }
        }
      })
    } catch (error) {
      console.error('Get activity summary error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch activity summary'
      })
    }
  }
}

module.exports = new CenterAdminAuditController()