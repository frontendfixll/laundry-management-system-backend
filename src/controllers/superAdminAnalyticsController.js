const Analytics = require('../models/Analytics')
const User = require('../models/User')
const Order = require('../models/Order')
const Transaction = require('../models/Transaction')
const Branch = require('../models/Branch')
const AuditLog = require('../models/AuditLog')
const { validationResult } = require('express-validator')

// Helper functions (outside class to avoid 'this' context issues)
function generateRetentionInsights(cohortData) {
  const insights = []
  
  if (cohortData && cohortData.length > 0) {
    const avgRetention1Month = cohortData.reduce((sum, c) => 
      sum + (c.retentionRates[0]?.retentionRate || 0), 0) / cohortData.length
    
    const avgRetention6Month = cohortData.reduce((sum, c) => 
      sum + (c.retentionRates[5]?.retentionRate || 0), 0) / cohortData.length

    insights.push({
      category: 'retention',
      insight: `Average 1-month retention rate is ${avgRetention1Month.toFixed(1)}%`,
      impact: avgRetention1Month > 80 ? 'high' : avgRetention1Month > 60 ? 'medium' : 'low',
      actionable: avgRetention1Month < 70,
      recommendedActions: avgRetention1Month < 70 ? [
        'Implement onboarding program for new customers',
        'Create loyalty rewards program',
        'Improve customer service response times'
      ] : []
    })

    insights.push({
      category: 'retention',
      insight: `Average 6-month retention rate is ${avgRetention6Month.toFixed(1)}%`,
      impact: avgRetention6Month > 50 ? 'high' : avgRetention6Month > 30 ? 'medium' : 'low',
      actionable: avgRetention6Month < 40,
      recommendedActions: avgRetention6Month < 40 ? [
        'Analyze churn reasons and address top issues',
        'Implement win-back campaigns for inactive customers',
        'Enhance service quality and consistency'
      ] : []
    })
  }

  return insights
}

function generateBranchInsights(branchPerformance) {
  const insights = []
  
  if (branchPerformance && branchPerformance.length > 0) {
    const sortedByRevenue = [...branchPerformance].sort((a, b) => b.totalRevenue - a.totalRevenue)
    const topPerformer = sortedByRevenue[0]
    const bottomPerformer = sortedByRevenue[sortedByRevenue.length - 1]

    insights.push({
      category: 'performance',
      insight: `${topPerformer.branchName} is the top performing branch with ₹${topPerformer.totalRevenue.toLocaleString()} revenue`,
      impact: 'high',
      actionable: true,
      recommendedActions: [
        'Analyze success factors of top performing branch',
        'Replicate best practices across other branches',
        'Consider expanding capacity at high-performing locations'
      ]
    })

    if (bottomPerformer.totalRevenue < topPerformer.totalRevenue * 0.5) {
      insights.push({
        category: 'performance',
        insight: `${bottomPerformer.branchName} is underperforming with only ₹${bottomPerformer.totalRevenue.toLocaleString()} revenue`,
        impact: 'high',
        actionable: true,
        recommendedActions: [
          'Investigate operational issues at underperforming branch',
          'Provide additional training and support',
          'Consider marketing initiatives to increase local awareness'
        ]
      })
    }
  }

  return insights
}

function calculateGrowthRate(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

class CenterAdminAnalyticsController {
  // Get analytics dashboard overview
  async getAnalyticsOverview(req, res) {
    try {
      const { timeframe = '30d' } = req.query
      
      // Calculate date range
      const endDate = new Date()
      const startDate = new Date()
      
      switch (timeframe) {
        case '7d':
          startDate.setDate(endDate.getDate() - 7)
          break
        case '30d':
          startDate.setDate(endDate.getDate() - 30)
          break
        case '90d':
          startDate.setDate(endDate.getDate() - 90)
          break
        case '1y':
          startDate.setFullYear(endDate.getFullYear() - 1)
          break
        default:
          startDate.setDate(endDate.getDate() - 30)
      }

      // Get analytics statistics
      const analyticsStats = await Analytics.getAnalyticsStats()

      // Get key business metrics
      const [customerMetrics, revenueMetrics, orderMetrics, branchMetrics] = await Promise.all([
        getCustomerMetrics(startDate, endDate),
        getRevenueMetrics(startDate, endDate),
        getOrderMetrics(startDate, endDate),
        getBranchMetrics(startDate, endDate)
      ])

      // Calculate growth rates
      const previousStartDate = new Date(startDate)
      previousStartDate.setTime(startDate.getTime() - (endDate.getTime() - startDate.getTime()))
      
      const [previousCustomerMetrics, previousRevenueMetrics] = await Promise.all([
        getCustomerMetrics(previousStartDate, startDate),
        getRevenueMetrics(previousStartDate, startDate)
      ])

      const customerGrowth = calculateGrowthRate(
        customerMetrics.totalCustomers, 
        previousCustomerMetrics.totalCustomers
      )
      const revenueGrowth = calculateGrowthRate(
        revenueMetrics.totalRevenue, 
        previousRevenueMetrics.totalRevenue
      )

      return res.json({
        success: true,
        data: {
          overview: {
            analyticsStats,
            customerMetrics: { ...customerMetrics, growth: customerGrowth },
            revenueMetrics: { ...revenueMetrics, growth: revenueGrowth },
            orderMetrics,
            branchMetrics
          },
          timeframe
        }
      })
    } catch (error) {
      console.error('Get analytics overview error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch analytics overview'
      })
    }
  }

  // Generate customer retention analysis
  async generateCustomerRetentionAnalysis(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const { startDate, endDate, filters = {} } = req.body

      const analytics = await Analytics.generateCustomerRetentionAnalysis(
        new Date(startDate),
        new Date(endDate),
        filters,
        req.admin._id
      )

      // Calculate additional insights
      const insights = generateRetentionInsights(analytics.cohortData)
      analytics.insights = insights
      await analytics.save()

      // Log the generation
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'generate_customer_retention_analysis',
        category: 'analytics',
        description: `Generated customer retention analysis for period ${startDate} to ${endDate}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'analytics',
        resourceId: analytics._id.toString(),
        status: 'success',
        riskLevel: 'low',
        metadata: {
          analyticsType: 'customer_retention',
          startDate,
          endDate,
          analyticsId: analytics.analyticsId
        }
      })

      return res.status(201).json({
        success: true,
        message: 'Customer retention analysis generated successfully',
        data: { analytics }
      })
    } catch (error) {
      console.error('Generate customer retention analysis error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to generate customer retention analysis'
      })
    }
  }

  // Generate branch performance analysis
  async generateBranchPerformanceAnalysis(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const { startDate, endDate, filters = {} } = req.body

      const analytics = await Analytics.generateBranchPerformanceAnalysis(
        new Date(startDate),
        new Date(endDate),
        filters,
        req.admin._id
      )

      // Calculate additional insights
      const insights = generateBranchInsights(analytics.branchPerformance)
      analytics.insights = insights
      await analytics.save()

      // Log the generation
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'generate_branch_performance_analysis',
        category: 'analytics',
        description: `Generated branch performance analysis for period ${startDate} to ${endDate}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'analytics',
        resourceId: analytics._id.toString(),
        status: 'success',
        riskLevel: 'low',
        metadata: {
          analyticsType: 'branch_performance',
          startDate,
          endDate,
          analyticsId: analytics.analyticsId
        }
      })

      return res.status(201).json({
        success: true,
        message: 'Branch performance analysis generated successfully',
        data: { analytics }
      })
    } catch (error) {
      console.error('Generate branch performance analysis error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to generate branch performance analysis'
      })
    }
  }

  // Generate revenue forecast
  async generateRevenueForecast(req, res) {
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
        forecastHorizon = 12, 
        methodology = 'linear_regression',
        filters = {} 
      } = req.body

      // Get historical revenue data
      const historicalData = await getHistoricalRevenueData(
        new Date(startDate),
        new Date(endDate),
        filters
      )

      // Generate forecasts
      const forecasts = generateRevenueForecasts(
        historicalData,
        forecastHorizon,
        methodology
      )

      // Create analytics record
      const analytics = new Analytics({
        type: 'revenue_forecast',
        periodType: 'monthly',
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        forecasts,
        config: {
          includeForecasts: true,
          forecastHorizon,
          methodology
        },
        filters,
        createdBy: req.admin._id,
        status: 'completed',
        generatedAt: new Date()
      })

      await analytics.save()

      // Log the generation
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'generate_revenue_forecast',
        category: 'analytics',
        description: `Generated revenue forecast for ${forecastHorizon} months using ${methodology}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'analytics',
        resourceId: analytics._id.toString(),
        status: 'success',
        riskLevel: 'low',
        metadata: {
          analyticsType: 'revenue_forecast',
          forecastHorizon,
          methodology,
          analyticsId: analytics.analyticsId
        }
      })

      return res.status(201).json({
        success: true,
        message: 'Revenue forecast generated successfully',
        data: { analytics }
      })
    } catch (error) {
      console.error('Generate revenue forecast error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to generate revenue forecast'
      })
    }
  }

  // Generate expansion analysis
  async generateExpansionAnalysis(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const { targetLocation, marketData } = req.body

      // Perform expansion analysis
      const expansionAnalysis = await performExpansionAnalysis(targetLocation, marketData)

      // Create analytics record
      const analytics = new Analytics({
        type: 'expansion_analysis',
        periodType: 'yearly',
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        expansionAnalysis: [expansionAnalysis],
        createdBy: req.admin._id,
        status: 'completed',
        generatedAt: new Date()
      })

      await analytics.save()

      // Log the generation
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'generate_expansion_analysis',
        category: 'analytics',
        description: `Generated expansion analysis for ${targetLocation.city}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'analytics',
        resourceId: analytics._id.toString(),
        status: 'success',
        riskLevel: 'medium',
        metadata: {
          analyticsType: 'expansion_analysis',
          targetCity: targetLocation.city,
          analyticsId: analytics.analyticsId
        }
      })

      return res.status(201).json({
        success: true,
        message: 'Expansion analysis generated successfully',
        data: { analytics, expansionAnalysis }
      })
    } catch (error) {
      console.error('Generate expansion analysis error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to generate expansion analysis'
      })
    }
  }

  // Get all analytics
  async getAnalytics(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        type,
        status,
        startDate,
        endDate,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query

      // Build query
      const query = {}
      
      if (type) query.type = type
      if (status) query.status = status
      
      if (startDate || endDate) {
        query.createdAt = {}
        if (startDate) query.createdAt.$gte = new Date(startDate)
        if (endDate) query.createdAt.$lte = new Date(endDate)
      }
      
      if (search) {
        query.$or = [
          { analyticsId: { $regex: search, $options: 'i' } },
          { type: { $regex: search, $options: 'i' } }
        ]
      }

      // Execute query
      const analytics = await Analytics.find(query)
        .populate('createdBy', 'name email')
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean()

      const total = await Analytics.countDocuments(query)

      return res.json({
        success: true,
        data: {
          analytics,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
            limit: parseInt(limit)
          }
        }
      })
    } catch (error) {
      console.error('Get analytics error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch analytics'
      })
    }
  }

  // Get single analytics
  async getAnalyticsById(req, res) {
    try {
      const { analyticsId } = req.params

      const analytics = await Analytics.findById(analyticsId)
        .populate('createdBy', 'name email')

      if (!analytics) {
        return res.status(404).json({
          success: false,
          message: 'Analytics not found'
        })
      }

      // Update access tracking
      await analytics.updateAccess(req.admin._id)

      return res.json({
        success: true,
        data: { analytics }
      })
    } catch (error) {
      console.error('Get analytics by ID error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch analytics'
      })
    }
  }

  // Helper methods
  async getCustomerMetrics(startDate, endDate) {
    const [totalCustomers, newCustomers, activeCustomers] = await Promise.all([
      User.countDocuments({ 
        role: 'customer',
        createdAt: { $lte: endDate }
      }),
      User.countDocuments({ 
        role: 'customer',
        createdAt: { $gte: startDate, $lte: endDate }
      }),
      Order.distinct('customer', {
        createdAt: { $gte: startDate, $lte: endDate }
      }).then(ids => ids.length)
    ])

    const retentionRate = totalCustomers > 0 ? (activeCustomers / totalCustomers) * 100 : 0

    return {
      totalCustomers,
      newCustomers,
      activeCustomers,
      retentionRate
    }
  }

  async getRevenueMetrics(startDate, endDate) {
    const transactions = await Transaction.find({
      createdAt: { $gte: startDate, $lte: endDate },
      status: 'completed',
      type: 'payment'
    })

    const totalRevenue = transactions.reduce((sum, t) => sum + t.netAmount, 0)
    const totalTransactions = transactions.length
    const averageOrderValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0

    return {
      totalRevenue,
      totalTransactions,
      averageOrderValue
    }
  }

  async getOrderMetrics(startDate, endDate) {
    const [totalOrders, completedOrders, cancelledOrders] = await Promise.all([
      Order.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate }
      }),
      Order.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'delivered'
      }),
      Order.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'cancelled'
      })
    ])

    const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0
    const cancellationRate = totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0

    return {
      totalOrders,
      completedOrders,
      cancelledOrders,
      completionRate,
      cancellationRate
    }
  }

  async getBranchMetrics(startDate, endDate) {
    const totalBranches = await Branch.countDocuments({ isActive: true })
    
    const branchRevenue = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'completed',
          type: 'payment',
          branchId: { $exists: true }
        }
      },
      {
        $group: {
          _id: '$branchId',
          revenue: { $sum: '$netAmount' },
          orders: { $sum: 1 }
        }
      },
      {
        $sort: { revenue: -1 }
      }
    ])

    const activeBranches = branchRevenue.length
    const totalBranchRevenue = branchRevenue.reduce((sum, b) => sum + b.revenue, 0)
    const averageRevenuePerBranch = activeBranches > 0 ? totalBranchRevenue / activeBranches : 0

    return {
      totalBranches,
      activeBranches,
      totalBranchRevenue,
      averageRevenuePerBranch,
      topPerformingBranches: branchRevenue.slice(0, 5)
    }
  }

  calculateGrowthRate(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0
    return ((current - previous) / previous) * 100
  }

  generateRetentionInsights(cohortData) {
    const insights = []
    
    if (cohortData.length > 0) {
      // Calculate average retention rates
      const avgRetention1Month = cohortData.reduce((sum, c) => 
        sum + (c.retentionRates[0]?.retentionRate || 0), 0) / cohortData.length
      
      const avgRetention6Month = cohortData.reduce((sum, c) => 
        sum + (c.retentionRates[5]?.retentionRate || 0), 0) / cohortData.length

      insights.push({
        category: 'retention',
        insight: `Average 1-month retention rate is ${avgRetention1Month.toFixed(1)}%`,
        impact: avgRetention1Month > 80 ? 'high' : avgRetention1Month > 60 ? 'medium' : 'low',
        actionable: avgRetention1Month < 70,
        recommendedActions: avgRetention1Month < 70 ? [
          'Implement onboarding program for new customers',
          'Create loyalty rewards program',
          'Improve customer service response times'
        ] : []
      })

      insights.push({
        category: 'retention',
        insight: `Average 6-month retention rate is ${avgRetention6Month.toFixed(1)}%`,
        impact: avgRetention6Month > 50 ? 'high' : avgRetention6Month > 30 ? 'medium' : 'low',
        actionable: avgRetention6Month < 40,
        recommendedActions: avgRetention6Month < 40 ? [
          'Analyze churn reasons and address top issues',
          'Implement win-back campaigns for inactive customers',
          'Enhance service quality and consistency'
        ] : []
      })
    }

    return insights
  }

  generateBranchInsights(branchPerformance) {
    const insights = []
    
    if (branchPerformance.length > 0) {
      // Find top and bottom performers
      const sortedByRevenue = [...branchPerformance].sort((a, b) => b.totalRevenue - a.totalRevenue)
      const topPerformer = sortedByRevenue[0]
      const bottomPerformer = sortedByRevenue[sortedByRevenue.length - 1]

      insights.push({
        category: 'performance',
        insight: `${topPerformer.branchName} is the top performing branch with ₹${topPerformer.totalRevenue.toLocaleString()} revenue`,
        impact: 'high',
        actionable: true,
        recommendedActions: [
          'Analyze success factors of top performing branch',
          'Replicate best practices across other branches',
          'Consider expanding capacity at high-performing locations'
        ]
      })

      if (bottomPerformer.totalRevenue < topPerformer.totalRevenue * 0.5) {
        insights.push({
          category: 'performance',
          insight: `${bottomPerformer.branchName} is underperforming with only ₹${bottomPerformer.totalRevenue.toLocaleString()} revenue`,
          impact: 'high',
          actionable: true,
          recommendedActions: [
            'Investigate operational issues at underperforming branch',
            'Provide additional training and support',
            'Consider marketing initiatives to increase local awareness'
          ]
        })
      }
    }

    return insights
  }

  async getHistoricalRevenueData(startDate, endDate, filters) {
    const pipeline = [
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'completed',
          type: 'payment',
          ...(filters.branchIds && { branchId: { $in: filters.branchIds } })
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m', date: '$createdAt' }
          },
          revenue: { $sum: '$netAmount' },
          transactions: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]

    return await Transaction.aggregate(pipeline)
  }

  generateRevenueForecasts(historicalData, horizon, methodology) {
    const forecasts = []
    
    if (historicalData.length < 2) {
      return forecasts // Need at least 2 data points for forecasting
    }

    // Simple linear regression for demonstration
    const revenues = historicalData.map(d => d.revenue)
    const n = revenues.length
    const sumX = n * (n + 1) / 2
    const sumY = revenues.reduce((sum, r) => sum + r, 0)
    const sumXY = revenues.reduce((sum, r, i) => sum + r * (i + 1), 0)
    const sumX2 = n * (n + 1) * (2 * n + 1) / 6

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n

    // Generate forecasts
    for (let i = 1; i <= horizon; i++) {
      const x = n + i
      const predictedValue = intercept + slope * x
      const confidence = Math.max(0, 100 - (i * 5)) // Decreasing confidence over time

      const forecastDate = new Date(historicalData[n - 1]._id + '-01')
      forecastDate.setMonth(forecastDate.getMonth() + i)

      forecasts.push({
        metric: 'revenue',
        period: forecastDate.toISOString().substring(0, 7),
        predictedValue: Math.max(0, predictedValue),
        confidenceInterval: {
          lower: Math.max(0, predictedValue * 0.8),
          upper: predictedValue * 1.2
        },
        methodology
      })
    }

    return forecasts
  }

  async performExpansionAnalysis(targetLocation, marketData) {
    // This is a simplified expansion analysis
    // In a real implementation, this would involve complex market research and data analysis
    
    const analysisId = `EXP${Date.now()}${Math.random().toString(36).substring(2, 4).toUpperCase()}`
    
    // Calculate risk score based on market data
    let riskScore = 50 // Base risk
    
    if (marketData.competitorCount > 5) riskScore += 20
    if (marketData.marketSaturation > 70) riskScore += 15
    if (marketData.averageIncome < 50000) riskScore += 10
    
    riskScore = Math.min(100, Math.max(0, riskScore))

    // Generate financial projections
    const estimatedMonthlyRevenue = marketData.demandEstimate * 150 // ₹150 average order value
    const setupCost = 500000 // ₹5 lakh setup cost
    const monthlyOperatingCost = 100000 // ₹1 lakh monthly operating cost
    const breakEvenMonths = Math.ceil(setupCost / (estimatedMonthlyRevenue - monthlyOperatingCost))

    const projectedMonthlyRevenue = []
    for (let month = 1; month <= 24; month++) {
      const growthFactor = Math.min(1, month / 6) // Ramp up over 6 months
      projectedMonthlyRevenue.push({
        month,
        revenue: estimatedMonthlyRevenue * growthFactor,
        orders: Math.floor(estimatedMonthlyRevenue * growthFactor / 150),
        customers: Math.floor(estimatedMonthlyRevenue * growthFactor / 300) // Assuming 2 orders per customer
      })
    }

    // Determine recommendation
    let recommendation = 'not_recommended'
    let confidence = 30

    if (riskScore < 40 && breakEvenMonths < 18) {
      recommendation = 'highly_recommended'
      confidence = 85
    } else if (riskScore < 60 && breakEvenMonths < 24) {
      recommendation = 'recommended'
      confidence = 70
    } else if (riskScore < 80) {
      recommendation = 'conditional'
      confidence = 50
    }

    return {
      analysisId,
      targetLocation,
      marketData,
      projections: {
        setupCost,
        monthlyOperatingCost,
        breakEvenMonths,
        projectedMonthlyRevenue,
        roi12Months: ((estimatedMonthlyRevenue * 12 - monthlyOperatingCost * 12 - setupCost) / setupCost) * 100,
        roi24Months: ((estimatedMonthlyRevenue * 24 - monthlyOperatingCost * 24 - setupCost) / setupCost) * 100
      },
      overallRiskScore: riskScore,
      recommendation: {
        decision: recommendation,
        confidence,
        reasoning: `Based on market analysis, the location shows ${riskScore < 50 ? 'low' : riskScore < 70 ? 'medium' : 'high'} risk with projected break-even in ${breakEvenMonths} months.`,
        conditions: recommendation === 'conditional' ? [
          'Conduct detailed competitor analysis',
          'Negotiate lower setup costs',
          'Implement aggressive marketing strategy'
        ] : [],
        timeline: recommendation === 'highly_recommended' ? '3-6 months' : '6-12 months'
      }
    }
  }
}

module.exports = new CenterAdminAnalyticsController()