const mongoose = require('mongoose')

const metricDataSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  value: { type: Number, required: true },
  previousValue: Number,
  change: Number,
  changePercentage: Number,
  metadata: mongoose.Schema.Types.Mixed
})

const cohortDataSchema = new mongoose.Schema({
  cohortMonth: { type: String, required: true }, // YYYY-MM format
  cohortSize: { type: Number, required: true },
  retentionRates: [{
    period: Number, // months after acquisition
    activeUsers: Number,
    retentionRate: Number
  }],
  revenueData: [{
    period: Number,
    totalRevenue: Number,
    averageRevenue: Number
  }]
})

const branchPerformanceSchema = new mongoose.Schema({
  branchId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Branch',
    required: true
  },
  branchName: { type: String, required: true },
  period: { type: String, required: true }, // YYYY-MM format
  
  // Revenue Metrics
  totalRevenue: { type: Number, default: 0 },
  revenueGrowth: { type: Number, default: 0 },
  averageOrderValue: { type: Number, default: 0 },
  
  // Order Metrics
  totalOrders: { type: Number, default: 0 },
  completedOrders: { type: Number, default: 0 },
  cancelledOrders: { type: Number, default: 0 },
  orderCompletionRate: { type: Number, default: 0 },
  
  // Customer Metrics
  totalCustomers: { type: Number, default: 0 },
  newCustomers: { type: Number, default: 0 },
  returningCustomers: { type: Number, default: 0 },
  customerRetentionRate: { type: Number, default: 0 },
  
  // Operational Metrics
  averageDeliveryTime: { type: Number, default: 0 },
  onTimeDeliveryRate: { type: Number, default: 0 },
  customerSatisfactionScore: { type: Number, default: 0 },
  complaintRate: { type: Number, default: 0 },
  
  // Financial Metrics
  operatingCosts: { type: Number, default: 0 },
  profitMargin: { type: Number, default: 0 },
  costPerOrder: { type: Number, default: 0 },
  
  // Staff Metrics
  totalStaff: { type: Number, default: 0 },
  staffUtilization: { type: Number, default: 0 },
  staffProductivity: { type: Number, default: 0 },
  
  // Rankings
  revenueRank: Number,
  growthRank: Number,
  efficiencyRank: Number,
  overallRank: Number,
  
  // Scores (0-100)
  performanceScore: { type: Number, default: 0 },
  efficiencyScore: { type: Number, default: 0 },
  qualityScore: { type: Number, default: 0 }
})

const expansionAnalysisSchema = new mongoose.Schema({
  analysisId: { 
    type: String,
    sparse: true,
    index: true
  },
  
  // Location Analysis
  targetLocation: {
    city: { type: String, required: true },
    area: String,
    pincode: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  
  // Market Analysis
  marketData: {
    populationDensity: Number,
    averageIncome: Number,
    competitorCount: Number,
    marketSaturation: Number, // 0-100
    demandEstimate: Number,
    seasonalityFactor: Number
  },
  
  // Financial Projections
  projections: {
    setupCost: Number,
    monthlyOperatingCost: Number,
    breakEvenMonths: Number,
    projectedMonthlyRevenue: [{
      month: Number,
      revenue: Number,
      orders: Number,
      customers: Number
    }],
    roi12Months: Number,
    roi24Months: Number,
    roi36Months: Number
  },
  
  // Risk Assessment
  riskFactors: [{
    factor: String,
    impact: { type: String, enum: ['low', 'medium', 'high'] },
    probability: { type: String, enum: ['low', 'medium', 'high'] },
    mitigation: String
  }],
  overallRiskScore: { type: Number, min: 0, max: 100 },
  
  // Recommendations
  recommendation: {
    decision: { type: String, enum: ['highly_recommended', 'recommended', 'conditional', 'not_recommended'] },
    confidence: { type: Number, min: 0, max: 100 },
    reasoning: String,
    conditions: [String],
    timeline: String
  },
  
  // Competitive Analysis
  competitors: [{
    name: String,
    distance: Number, // km
    services: [String],
    pricing: String,
    marketShare: Number,
    strengths: [String],
    weaknesses: [String]
  }],
  
  // Success Factors
  successFactors: [{
    factor: String,
    importance: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
    currentStatus: String,
    requiredActions: [String]
  }],
  
  // Analysis Metadata
  analysisDate: { type: Date, default: Date.now },
  dataSourcesUsed: [String],
  assumptions: [String],
  limitations: [String],
  
  // Approval and Review
  status: {
    type: String,
    enum: ['draft', 'under_review', 'approved', 'rejected', 'implemented'],
    default: 'draft'
  },
  reviewedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CenterAdmin'
  },
  reviewedAt: Date,
  reviewNotes: String,
  
  // Implementation Tracking
  implementationDate: Date,
  actualResults: {
    actualSetupCost: Number,
    actualBreakEvenMonths: Number,
    actualROI: Number,
    performanceVsProjection: Number // percentage
  }
})

const analyticsSchema = new mongoose.Schema({
  // Analytics Identification
  analyticsId: { 
    type: String, 
    unique: true,
    sparse: true,
    index: true
  },
  
  // Analysis Type
  type: {
    type: String,
    required: true,
    enum: [
      'customer_retention',
      'revenue_forecast',
      'branch_performance',
      'market_analysis',
      'cohort_analysis',
      'churn_prediction',
      'demand_forecast',
      'expansion_analysis',
      'competitive_analysis',
      'seasonal_analysis'
    ]
  },
  
  // Time Period
  periodType: {
    type: String,
    required: true,
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  
  // Analysis Status
  status: {
    type: String,
    required: true,
    enum: ['generating', 'completed', 'failed', 'scheduled'],
    default: 'generating'
  },
  
  // Key Metrics
  keyMetrics: {
    customerRetentionRate: Number,
    churnRate: Number,
    customerLifetimeValue: Number,
    averageOrderValue: Number,
    monthlyRecurringRevenue: Number,
    revenueGrowthRate: Number,
    customerAcquisitionCost: Number,
    netPromoterScore: Number
  },
  
  // Detailed Data
  metricsData: [metricDataSchema],
  cohortData: [cohortDataSchema],
  branchPerformance: [branchPerformanceSchema],
  
  // Forecasting Data
  forecasts: [{
    metric: String,
    period: String, // YYYY-MM
    predictedValue: Number,
    confidenceInterval: {
      lower: Number,
      upper: Number
    },
    accuracy: Number, // if historical data available
    methodology: String
  }],
  
  // Insights and Recommendations
  insights: [{
    category: String,
    insight: String,
    impact: { type: String, enum: ['low', 'medium', 'high'] },
    actionable: Boolean,
    recommendedActions: [String]
  }],
  
  // Expansion Analysis
  expansionAnalysis: [expansionAnalysisSchema],
  
  // Filters and Scope
  filters: {
    branchIds: [mongoose.Schema.Types.ObjectId],
    customerSegments: [String],
    serviceTypes: [String],
    geographicRegions: [String],
    customFilters: mongoose.Schema.Types.Mixed
  },
  
  // Configuration
  config: {
    includeForecasts: { type: Boolean, default: true },
    forecastHorizon: { type: Number, default: 12 }, // months
    confidenceLevel: { type: Number, default: 95 }, // percentage
    methodology: String,
    dataQualityScore: Number
  },
  
  // Generation Details
  generatedAt: Date,
  generationTime: Number, // milliseconds
  dataPoints: Number,
  
  // Error Details
  error: {
    message: String,
    code: String,
    stack: String,
    timestamp: Date
  },
  
  // Scheduling
  isScheduled: { type: Boolean, default: false },
  scheduleConfig: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'quarterly']
    },
    dayOfWeek: Number,
    dayOfMonth: Number,
    time: String,
    timezone: String,
    recipients: [String],
    isActive: { type: Boolean, default: true }
  },
  
  // Access Control
  visibility: {
    type: String,
    enum: ['private', 'team', 'organization'],
    default: 'private'
  },
  
  // Audit Trail
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CenterAdmin',
    required: true
  },
  lastAccessedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'CenterAdmin'
  },
  lastAccessedAt: Date,
  accessCount: { type: Number, default: 0 },
  
  // Metadata
  tags: [String],
  notes: String,
  version: { type: Number, default: 1 }
}, {
  timestamps: true
})

// Indexes for performance
analyticsSchema.index({ type: 1, status: 1 })
analyticsSchema.index({ startDate: 1, endDate: 1 })
analyticsSchema.index({ createdBy: 1, createdAt: -1 })
analyticsSchema.index({ isScheduled: 1, 'scheduleConfig.isActive': 1 })
analyticsSchema.index({ 'filters.branchIds': 1 })
analyticsSchema.index({ 'branchPerformance.branchId': 1, 'branchPerformance.period': 1 })

// Generate unique analytics ID
analyticsSchema.pre('save', async function(next) {
  if (!this.analyticsId) {
    const prefix = this.type.toUpperCase().substring(0, 3)
    const timestamp = Date.now().toString().slice(-8)
    const random = Math.random().toString(36).substring(2, 4).toUpperCase()
    this.analyticsId = `ANL${prefix}${timestamp}${random}`
  }
  next()
})

// Methods
analyticsSchema.methods.markCompleted = async function() {
  this.status = 'completed'
  this.generatedAt = new Date()
  return await this.save()
}

analyticsSchema.methods.markFailed = async function(error) {
  this.status = 'failed'
  this.error = {
    message: error.message,
    code: error.code,
    stack: error.stack,
    timestamp: new Date()
  }
  return await this.save()
}

analyticsSchema.methods.updateAccess = async function(userId) {
  this.lastAccessedBy = userId
  this.lastAccessedAt = new Date()
  this.accessCount += 1
  return await this.save()
}

analyticsSchema.methods.addInsight = function(category, insight, impact, actions = []) {
  this.insights.push({
    category,
    insight,
    impact,
    actionable: actions.length > 0,
    recommendedActions: actions
  })
}

analyticsSchema.methods.addForecast = function(metric, period, value, confidence, methodology) {
  this.forecasts.push({
    metric,
    period,
    predictedValue: value,
    confidenceInterval: confidence,
    methodology
  })
}

// Static methods
analyticsSchema.statics.getAnalyticsStats = async function() {
  const pipeline = [
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        }
      }
    }
  ]
  
  const result = await this.aggregate(pipeline)
  
  const stats = {
    total: 0,
    byType: {},
    completionRate: 0
  }
  
  let totalCompleted = 0
  
  result.forEach(item => {
    stats.total += item.count
    totalCompleted += item.completed
    stats.byType[item._id] = {
      total: item.count,
      completed: item.completed,
      completionRate: item.count > 0 ? (item.completed / item.count) * 100 : 0
    }
  })
  
  stats.completionRate = stats.total > 0 ? (totalCompleted / stats.total) * 100 : 0
  
  return stats
}

analyticsSchema.statics.getScheduledAnalytics = async function() {
  return await this.find({
    isScheduled: true,
    'scheduleConfig.isActive': true
  }).populate('createdBy', 'name email')
}

analyticsSchema.statics.generateCustomerRetentionAnalysis = async function(startDate, endDate, filters = {}, createdBy) {
  const User = mongoose.model('User')
  const Order = mongoose.model('Order')
  
  // Calculate cohort data
  const cohorts = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        role: 'customer',
        ...filters
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m', date: '$createdAt' }
        },
        cohortSize: { $sum: 1 },
        customers: { $push: '$_id' }
      }
    }
  ])
  
  // Calculate retention rates for each cohort
  const cohortData = []
  for (const cohort of cohorts) {
    const retentionRates = []
    
    for (let period = 1; period <= 12; period++) {
      const periodStart = new Date(cohort._id + '-01')
      periodStart.setMonth(periodStart.getMonth() + period)
      const periodEnd = new Date(periodStart)
      periodEnd.setMonth(periodEnd.getMonth() + 1)
      
      const activeUsers = await Order.distinct('customerId', {
        customerId: { $in: cohort.customers },
        createdAt: { $gte: periodStart, $lt: periodEnd }
      })
      
      retentionRates.push({
        period,
        activeUsers: activeUsers.length,
        retentionRate: (activeUsers.length / cohort.cohortSize) * 100
      })
    }
    
    cohortData.push({
      cohortMonth: cohort._id,
      cohortSize: cohort.cohortSize,
      retentionRates
    })
  }
  
  const analytics = new this({
    type: 'customer_retention',
    periodType: 'monthly',
    startDate,
    endDate,
    cohortData,
    filters,
    createdBy,
    status: 'completed',
    generatedAt: new Date()
  })
  
  return await analytics.save()
}

analyticsSchema.statics.generateBranchPerformanceAnalysis = async function(startDate, endDate, filters = {}, createdBy) {
  const Branch = mongoose.model('Branch')
  const Order = mongoose.model('Order')
  const Transaction = mongoose.model('Transaction')
  
  const branches = await Branch.find(filters.branchIds ? { _id: { $in: filters.branchIds } } : {})
  const branchPerformance = []
  
  for (const branch of branches) {
    // Calculate metrics for each branch
    const [orders, transactions] = await Promise.all([
      Order.find({
        branchId: branch._id,
        createdAt: { $gte: startDate, $lte: endDate }
      }),
      Transaction.find({
        branchId: branch._id,
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'completed'
      })
    ])
    
    const totalRevenue = transactions.reduce((sum, t) => sum + t.netAmount, 0)
    const totalOrders = orders.length
    const completedOrders = orders.filter(o => o.status === 'completed').length
    
    branchPerformance.push({
      branchId: branch._id,
      branchName: branch.name,
      period: startDate.toISOString().substring(0, 7),
      totalRevenue,
      totalOrders,
      completedOrders,
      orderCompletionRate: totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0,
      averageOrderValue: completedOrders > 0 ? totalRevenue / completedOrders : 0
    })
  }
  
  // Calculate rankings
  branchPerformance.sort((a, b) => b.totalRevenue - a.totalRevenue)
  branchPerformance.forEach((branch, index) => {
    branch.revenueRank = index + 1
  })
  
  const analytics = new this({
    type: 'branch_performance',
    periodType: 'monthly',
    startDate,
    endDate,
    branchPerformance,
    filters,
    createdBy,
    status: 'completed',
    generatedAt: new Date()
  })
  
  return await analytics.save()
}

module.exports = mongoose.model('Analytics', analyticsSchema)