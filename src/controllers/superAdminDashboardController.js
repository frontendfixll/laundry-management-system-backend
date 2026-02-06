const Order = require('../models/Order')
const User = require('../models/User')
const Branch = require('../models/Branch')
const AuditLog = require('../models/AuditLog')
const Tenancy = require('../models/Tenancy')
const { TenancyPayment } = require('../models/TenancyBilling')
const { validationResult } = require('express-validator')

const centerAdminDashboardController = {
  // Get comprehensive dashboard overview
  getDashboardOverview: async function (req, res) {
    try {
      const { timeframe = '30d' } = req.query

      // Calculate date range
      const now = new Date()
      let startDate

      switch (timeframe) {
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
          break
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          break
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      }

      // Parallel data fetching for better performance
      const [
        totalStats,
        tenancyStats,
        recentOrders,
        topBranches,
        revenueData,
        customerGrowth,
        orderStatusDistribution,
        recentActivities,
        alerts,
        systemHealth
      ] = await Promise.all([
        centerAdminDashboardController.getTotalStats(startDate),
        centerAdminDashboardController.getTenancyStats(startDate),
        centerAdminDashboardController.getRecentOrders(10),
        centerAdminDashboardController.getTopBranches(startDate, 5),
        centerAdminDashboardController.getRevenueData(startDate),
        centerAdminDashboardController.getCustomerGrowth(startDate),
        centerAdminDashboardController.getOrderStatusDistribution(startDate),
        centerAdminDashboardController.getRecentActivities(10),
        centerAdminDashboardController.getSystemAlerts(),
        centerAdminDashboardController.getSystemHealth()
      ])

      return res.json({
        success: true,
        data: {
          overview: totalStats,
          tenancies: tenancyStats,
          recentOrders,
          topBranches,
          revenue: revenueData,
          customerGrowth,
          orderDistribution: orderStatusDistribution,
          recentActivities,
          alerts,
          systemHealth,
          timeframe,
          generatedAt: new Date().toISOString()
        }
      })
    } catch (error) {
      console.error('Dashboard overview error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard data'
      })
    }
  },

  // Get total statistics
  getTotalStats: async function (startDate) {
    const [
      totalOrders,
      totalRevenue,
      totalCustomers,
      activeBranches,
      periodOrders,
      periodRevenue,
      periodCustomers,
      avgOrderValue
    ] = await Promise.all([
      Order.countDocuments(),
      Order.aggregate([
        { $group: { _id: null, total: { $sum: '$pricing.total' } } }
      ]),
      User.countDocuments({ role: 'customer' }),
      Branch.countDocuments({ isActive: true }),
      Order.countDocuments({ createdAt: { $gte: startDate } }),
      Order.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: null, total: { $sum: '$pricing.total' } } }
      ]),
      User.countDocuments({
        role: 'customer',
        createdAt: { $gte: startDate }
      }),
      Order.aggregate([
        { $group: { _id: null, avg: { $avg: '$pricing.total' } } }
      ])
    ])

    const currentRevenue = totalRevenue[0]?.total || 0
    const periodRevenueAmount = periodRevenue[0]?.total || 0
    const averageOrderValue = avgOrderValue[0]?.avg || 0

    // Calculate growth percentages
    const orderGrowth = totalOrders > 0 ? ((periodOrders / totalOrders) * 100) : 0
    const revenueGrowth = currentRevenue > 0 ? ((periodRevenueAmount / currentRevenue) * 100) : 0
    const customerGrowth = totalCustomers > 0 ? ((periodCustomers / totalCustomers) * 100) : 0

    return {
      totalOrders,
      totalRevenue: currentRevenue,
      totalCustomers,
      activeBranches,
      averageOrderValue,
      periodStats: {
        orders: periodOrders,
        revenue: periodRevenueAmount,
        customers: periodCustomers
      },
      growth: {
        orders: orderGrowth,
        revenue: revenueGrowth,
        customers: customerGrowth
      }
    }
  },

  // Get tenancy statistics
  getTenancyStats: async function (startDate) {
    try {
      const [
        totalTenancies,
        activeTenancies,
        newTenancies,
        tenanciesByPlan,
        platformRevenue
      ] = await Promise.all([
        Tenancy.countDocuments(),
        Tenancy.countDocuments({ status: 'active' }),
        Tenancy.countDocuments({ createdAt: { $gte: startDate } }),
        Tenancy.aggregate([
          { $group: { _id: '$subscription.plan', count: { $sum: 1 } } }
        ]),
        TenancyPayment.aggregate([
          { $match: { status: 'completed', createdAt: { $gte: startDate } } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
      ]);

      return {
        total: totalTenancies,
        active: activeTenancies,
        new: newTenancies,
        platformRevenue: platformRevenue[0]?.total || 0,
        byPlan: tenanciesByPlan.reduce((acc, item) => {
          acc[item._id || 'free'] = item.count;
          return acc;
        }, {})
      };
    } catch (error) {
      console.error('Get tenancy stats error:', error);
      return {
        total: 0,
        active: 0,
        new: 0,
        platformRevenue: 0,
        byPlan: {}
      };
    }
  },

  // Get recent orders
  getRecentOrders: async function (limit = 10) {
    const orders = await Order.find()
      .populate('customer', 'name email')
      .populate('branch', 'name code')
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('orderNumber status pricing createdAt items')
      .lean()

    // Transform to match frontend expectations
    return orders.map(order => ({
      _id: order._id,
      orderId: order.orderNumber,
      status: order.status,
      totalAmount: order.pricing?.total || 0,
      createdAt: order.createdAt,
      items: order.items || [],
      customerId: order.customer,
      branchId: order.branch
    }))
  },

  // Get top performing branches
  getTopBranches: async function (startDate, limit = 5) {
    return await Order.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: '$branch',
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$pricing.total' },
          avgOrderValue: { $avg: '$pricing.total' }
        }
      },
      {
        $lookup: {
          from: 'branches',
          localField: '_id',
          foreignField: '_id',
          as: 'branch'
        }
      },
      { $unwind: '$branch' },
      {
        $project: {
          branchId: '$_id',
          branchName: '$branch.name',
          branchCode: '$branch.code',
          totalOrders: 1,
          totalRevenue: 1,
          avgOrderValue: 1
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: limit }
    ])
  },

  // Get revenue data for charts
  getRevenueData: async function (startDate) {
    const dailyRevenue = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          revenue: { $sum: '$pricing.total' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ])

    const serviceRevenue = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $lookup: {
          from: 'orderitems',
          localField: 'items',
          foreignField: '_id',
          as: 'orderItems'
        }
      },
      { $unwind: '$orderItems' },
      {
        $group: {
          _id: '$orderItems.service',
          revenue: { $sum: '$orderItems.totalPrice' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { revenue: -1 } }
    ])

    return {
      daily: dailyRevenue,
      byService: serviceRevenue
    }
  },

  // Get customer growth data
  getCustomerGrowth: async function (startDate) {
    return await User.aggregate([
      {
        $match: {
          role: 'customer',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          newCustomers: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ])
  },

  // Get order status distribution
  getOrderStatusDistribution: async function (startDate) {
    return await Order.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          revenue: { $sum: '$pricing.total' }
        }
      },
      { $sort: { count: -1 } }
    ])
  },

  // Get recent system activities
  getRecentActivities: async function (limit = 10) {
    return await AuditLog.find({
      category: { $in: ['orders', 'branches', 'users', 'finances'] },
      riskLevel: { $in: ['medium', 'high', 'critical'] }
    })
      .sort({ timestamp: -1 })
      .limit(limit)
      .select('action description userEmail timestamp riskLevel category')
      .lean()
  },

  // Get system alerts
  getSystemAlerts: async function () {
    const now = new Date()
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const [
      failedLogins,
      suspiciousActivities,
      highValueOrders,
      systemErrors
    ] = await Promise.all([
      AuditLog.countDocuments({
        action: 'LOGIN_FAILED',
        timestamp: { $gte: last24h }
      }),
      AuditLog.countDocuments({
        severity: { $in: ['high', 'critical'] },
        timestamp: { $gte: last24h }
      }),
      Order.countDocuments({
        'pricing.total': { $gte: 5000 },
        createdAt: { $gte: last24h }
      }),
      AuditLog.countDocuments({
        outcome: 'failure',
        entity: 'System',
        timestamp: { $gte: last24h }
      })
    ])

    const alerts = []

    if (failedLogins > 0) {
      alerts.push({
        id: `alert-failed-logins-${Date.now()}`,
        type: 'security',
        level: 'high',
        message: `${failedLogins} failed login attempts in last 24h`,
        action: 'Review security logs',
        actionUrl: '/superadmin/audit?filter=LOGIN_FAILED'
      })
    }

    if (suspiciousActivities > 5) {
      alerts.push({
        id: `alert-suspicious-${Date.now()}`,
        type: 'security',
        level: 'critical',
        message: `${suspiciousActivities} suspicious activities detected`,
        action: 'Investigate immediately',
        actionUrl: '/superadmin/audit?severity=high,critical'
      })
    }

    if (highValueOrders > 0) {
      alerts.push({
        id: `alert-high-value-${Date.now()}`,
        type: 'business',
        level: 'medium',
        message: `${highValueOrders} high-value orders (₹5000+) require review`,
        action: 'Review orders',
        actionUrl: '/superadmin/orders?minAmount=5000'
      })
    }

    if (systemErrors > 0) {
      alerts.push({
        id: `alert-system-errors-${Date.now()}`,
        type: 'system',
        level: 'high',
        message: `${systemErrors} system errors in last 24h`,
        action: 'Check system health',
        actionUrl: '/superadmin/audit?category=system&outcome=failure'
      })
    }

    return alerts
  },

  // Get system health metrics
  getSystemHealth: async function () {
    const now = new Date()
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    try {
      // Count total requests/operations in last 30 days
      const [totalOperations, failedOperations, recentErrors] = await Promise.all([
        AuditLog.countDocuments({
          timestamp: { $gte: last30Days }
        }),
        AuditLog.countDocuments({
          status: 'failure',
          timestamp: { $gte: last30Days }
        }),
        AuditLog.countDocuments({
          status: 'failure',
          timestamp: { $gte: last24h }
        })
      ])

      // Calculate uptime percentage
      // Uptime = (Total - Failed) / Total * 100
      let uptime = 99.9 // Default if no data
      if (totalOperations > 0) {
        const successRate = ((totalOperations - failedOperations) / totalOperations) * 100
        uptime = Math.min(99.99, Math.max(0, successRate))
      }

      // Determine status based on recent errors
      let status = 'healthy'
      if (recentErrors > 50) {
        status = 'critical'
      } else if (recentErrors > 20) {
        status = 'degraded'
      } else if (recentErrors > 5) {
        status = 'minor_issues'
      }

      return {
        uptime: parseFloat(uptime.toFixed(2)),
        status,
        totalOperations,
        failedOperations,
        recentErrors,
        lastChecked: now.toISOString()
      }
    } catch (error) {
      console.error('Error calculating system health:', error)
      return {
        uptime: 99.9,
        status: 'unknown',
        lastChecked: now.toISOString()
      }
    }
  },

  // Get detailed analytics
  getDetailedAnalytics: async function (req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const {
        startDate,
        endDate,
        groupBy = 'day',
        metrics = ['revenue', 'orders', 'customers']
      } = req.query

      const start = new Date(startDate)
      const end = new Date(endDate)

      const analyticsData = {}

      // Revenue analytics
      if (metrics.includes('revenue')) {
        analyticsData.revenue = await centerAdminDashboardController.getRevenueAnalytics(start, end, groupBy)
      }

      // Order analytics
      if (metrics.includes('orders')) {
        analyticsData.orders = await centerAdminDashboardController.getOrderAnalytics(start, end, groupBy)
      }

      // Customer analytics
      if (metrics.includes('customers')) {
        analyticsData.customers = await centerAdminDashboardController.getCustomerAnalytics(start, end, groupBy)
      }

      // Branch performance
      if (metrics.includes('branches')) {
        analyticsData.branches = await centerAdminDashboardController.getBranchAnalytics(start, end)
      }

      return res.json({
        success: true,
        data: analyticsData,
        period: { startDate: start, endDate: end },
        groupBy
      })
    } catch (error) {
      console.error('Detailed analytics error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch analytics data'
      })
    }
  },

  // Revenue analytics helper
  getRevenueAnalytics: async function (startDate, endDate, groupBy) {
    const groupStage = centerAdminDashboardController.getGroupStage(groupBy)

    return await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: groupStage,
          totalRevenue: { $sum: '$pricing.total' },
          avgOrderValue: { $avg: '$pricing.total' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ])
  },

  // Order analytics helper
  getOrderAnalytics: async function (startDate, endDate, groupBy) {
    const groupStage = centerAdminDashboardController.getGroupStage(groupBy)

    return await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            period: groupStage,
            status: '$status'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.period': 1 } }
    ])
  },

  // Customer analytics helper
  getCustomerAnalytics: async function (startDate, endDate, groupBy) {
    const groupStage = centerAdminDashboardController.getGroupStage(groupBy)

    return await User.aggregate([
      {
        $match: {
          role: 'customer',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: groupStage,
          newCustomers: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ])
  },

  // Branch analytics helper
  getBranchAnalytics: async function (startDate, endDate) {
    return await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$branch',
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$pricing.total' },
          avgOrderValue: { $avg: '$pricing.total' }
        }
      },
      {
        $lookup: {
          from: 'branches',
          localField: '_id',
          foreignField: '_id',
          as: 'branch'
        }
      },
      { $unwind: '$branch' },
      {
        $project: {
          branchName: '$branch.name',
          branchCode: '$branch.code',
          totalOrders: 1,
          totalRevenue: 1,
          avgOrderValue: 1,
          efficiency: {
            $divide: ['$totalRevenue', '$totalOrders']
          }
        }
      },
      { $sort: { totalRevenue: -1 } }
    ])
  },

  // Helper to get group stage based on groupBy parameter
  getGroupStage: function (groupBy) {
    switch (groupBy) {
      case 'hour':
        return {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
          hour: { $hour: '$createdAt' }
        }
      case 'day':
        return {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        }
      case 'week':
        return {
          year: { $year: '$createdAt' },
          week: { $week: '$createdAt' }
        }
      case 'month':
        return {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        }
      default:
        return {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        }
    }
  }
}

module.exports = centerAdminDashboardController