const mongoose = require('mongoose')

const reportDataSchema = new mongoose.Schema({
  metric: { type: String, required: true },
  value: { type: Number, required: true },
  previousValue: Number,
  change: Number,
  changePercentage: Number,
  unit: String,
  category: String
})

const chartDataSchema = new mongoose.Schema({
  label: String,
  value: Number,
  date: Date,
  category: String,
  metadata: mongoose.Schema.Types.Mixed
})

const financialReportSchema = new mongoose.Schema({
  // Report Identification
  reportId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  
  // Report Details
  title: { type: String, required: true },
  type: {
    type: String,
    required: true,
    enum: [
      'revenue_report',
      'expense_report',
      'profit_loss',
      'cash_flow',
      'settlement_report',
      'commission_report',
      'tax_report',
      'branch_performance',
      'driver_performance',
      'customer_analysis',
      'transaction_summary',
      'reconciliation_report',
      'audit_report'
    ]
  },
  
  // Report Period
  periodType: {
    type: String,
    required: true,
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom']
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  
  // Report Status
  status: {
    type: String,
    required: true,
    enum: ['generating', 'completed', 'failed', 'scheduled'],
    default: 'generating'
  },
  
  // Report Data
  summary: {
    totalRevenue: { type: Number, default: 0 },
    totalExpenses: { type: Number, default: 0 },
    netProfit: { type: Number, default: 0 },
    totalTransactions: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    averageOrderValue: { type: Number, default: 0 },
    totalCustomers: { type: Number, default: 0 },
    totalRefunds: { type: Number, default: 0 },
    totalSettlements: { type: Number, default: 0 }
  },
  
  // Detailed Data
  data: [reportDataSchema],
  chartData: [chartDataSchema],
  
  // Breakdown by Categories
  revenueBreakdown: {
    byService: [{ service: String, amount: Number, percentage: Number }],
    byBranch: [{ branchId: mongoose.Schema.Types.ObjectId, branchName: String, amount: Number, percentage: Number }],
    byPaymentMethod: [{ method: String, amount: Number, percentage: Number }],
    byCustomerSegment: [{ segment: String, amount: Number, percentage: Number }]
  },
  
  expenseBreakdown: {
    byCategory: [{ category: String, amount: Number, percentage: Number }],
    byBranch: [{ branchId: mongoose.Schema.Types.ObjectId, branchName: String, amount: Number, percentage: Number }],
    operational: { type: Number, default: 0 },
    marketing: { type: Number, default: 0 },
    technology: { type: Number, default: 0 },
    administrative: { type: Number, default: 0 }
  },
  
  // Performance Metrics
  kpis: {
    revenueGrowth: Number,
    profitMargin: Number,
    customerAcquisitionCost: Number,
    customerLifetimeValue: Number,
    averageOrderValue: Number,
    orderFulfillmentRate: Number,
    customerRetentionRate: Number,
    refundRate: Number,
    settlementAccuracy: Number
  },
  
  // Filters Applied
  filters: {
    branchIds: [mongoose.Schema.Types.ObjectId],
    serviceTypes: [String],
    customerSegments: [String],
    paymentMethods: [String],
    orderStatuses: [String],
    customFilters: mongoose.Schema.Types.Mixed
  },
  
  // Report Configuration
  config: {
    includeCharts: { type: Boolean, default: true },
    includeBreakdowns: { type: Boolean, default: true },
    includeComparisons: { type: Boolean, default: true },
    currency: { type: String, default: 'INR' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    format: {
      type: String,
      enum: ['json', 'pdf', 'excel', 'csv'],
      default: 'json'
    }
  },
  
  // File Details (for exported reports)
  fileUrl: String,
  fileSize: Number,
  fileName: String,
  
  // Scheduling
  isScheduled: { type: Boolean, default: false },
  scheduleConfig: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'quarterly']
    },
    dayOfWeek: Number, // 0-6 for weekly
    dayOfMonth: Number, // 1-31 for monthly
    time: String, // HH:MM format
    timezone: String,
    recipients: [String], // Email addresses
    isActive: { type: Boolean, default: true }
  },
  
  // Generation Details
  generatedAt: Date,
  generationTime: Number, // Time taken to generate in milliseconds
  dataPoints: Number, // Number of data points processed
  
  // Error Details
  error: {
    message: String,
    code: String,
    stack: String,
    timestamp: Date
  },
  
  // Access Control
  visibility: {
    type: String,
    enum: ['private', 'branch', 'public'],
    default: 'private'
  },
  accessibleBy: [{ 
    userId: mongoose.Schema.Types.ObjectId,
    userType: String,
    permissions: [String]
  }],
  
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

// Indexes
financialReportSchema.index({ type: 1, status: 1 })
financialReportSchema.index({ startDate: 1, endDate: 1 })
financialReportSchema.index({ createdBy: 1, createdAt: -1 })
financialReportSchema.index({ isScheduled: 1, 'scheduleConfig.isActive': 1 })
financialReportSchema.index({ 'filters.branchIds': 1 })

// Generate unique report ID
financialReportSchema.pre('save', async function(next) {
  if (!this.reportId) {
    const prefix = this.type.toUpperCase().substring(0, 3)
    const timestamp = Date.now().toString().slice(-8)
    const random = Math.random().toString(36).substring(2, 4).toUpperCase()
    this.reportId = `RPT${prefix}${timestamp}${random}`
  }
  next()
})

// Methods
financialReportSchema.methods.markCompleted = async function() {
  this.status = 'completed'
  this.generatedAt = new Date()
  return await this.save()
}

financialReportSchema.methods.markFailed = async function(error) {
  this.status = 'failed'
  this.error = {
    message: error.message,
    code: error.code,
    stack: error.stack,
    timestamp: new Date()
  }
  return await this.save()
}

financialReportSchema.methods.updateAccess = async function(userId) {
  this.lastAccessedBy = userId
  this.lastAccessedAt = new Date()
  this.accessCount += 1
  return await this.save()
}

financialReportSchema.methods.addKPI = function(name, value, previousValue = null) {
  this.kpis[name] = value
  
  if (previousValue !== null) {
    const change = value - previousValue
    const changePercentage = previousValue !== 0 ? (change / previousValue) * 100 : 0
    
    this.data.push({
      metric: name,
      value,
      previousValue,
      change,
      changePercentage,
      category: 'kpi'
    })
  }
}

financialReportSchema.methods.addChartData = function(label, value, date = new Date(), category = 'default') {
  this.chartData.push({
    label,
    value,
    date,
    category
  })
}

// Static methods
financialReportSchema.statics.getReportStats = async function() {
  const pipeline = [
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]
  
  const result = await this.aggregate(pipeline)
  
  const stats = {
    total: 0,
    completed: 0,
    generating: 0,
    failed: 0,
    scheduled: 0
  }
  
  result.forEach(item => {
    stats.total += item.count
    stats[item._id] = item.count
  })
  
  return stats
}

financialReportSchema.statics.getScheduledReports = async function() {
  return await this.find({
    isScheduled: true,
    'scheduleConfig.isActive': true
  }).populate('createdBy', 'name email')
}

financialReportSchema.statics.generateRevenueReport = async function(startDate, endDate, filters = {}, createdBy) {
  const Transaction = mongoose.model('Transaction')
  
  // Get revenue data
  const revenueData = await Transaction.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'completed',
        type: 'payment',
        ...filters
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$netAmount' },
        totalTransactions: { $sum: 1 },
        averageOrderValue: { $avg: '$amount' }
      }
    }
  ])
  
  const summary = revenueData[0] || {
    totalRevenue: 0,
    totalTransactions: 0,
    averageOrderValue: 0
  }
  
  const report = new this({
    title: `Revenue Report - ${startDate.toDateString()} to ${endDate.toDateString()}`,
    type: 'revenue_report',
    periodType: 'custom',
    startDate,
    endDate,
    summary,
    filters,
    createdBy,
    status: 'completed',
    generatedAt: new Date()
  })
  
  return await report.save()
}

financialReportSchema.statics.generateProfitLossReport = async function(startDate, endDate, filters = {}, createdBy) {
  const Transaction = mongoose.model('Transaction')
  
  // Get revenue and expense data
  const [revenueData, expenseData] = await Promise.all([
    Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'completed',
          type: 'payment',
          ...filters
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$netAmount' }
        }
      }
    ]),
    Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'completed',
          type: { $in: ['settlement', 'refund'] },
          ...filters
        }
      },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: '$netAmount' }
        }
      }
    ])
  ])
  
  const revenue = revenueData[0]?.totalRevenue || 0
  const expenses = expenseData[0]?.totalExpenses || 0
  const netProfit = revenue - expenses
  
  const report = new this({
    title: `Profit & Loss Report - ${startDate.toDateString()} to ${endDate.toDateString()}`,
    type: 'profit_loss',
    periodType: 'custom',
    startDate,
    endDate,
    summary: {
      totalRevenue: revenue,
      totalExpenses: expenses,
      netProfit
    },
    kpis: {
      profitMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0
    },
    filters,
    createdBy,
    status: 'completed',
    generatedAt: new Date()
  })
  
  return await report.save()
}

module.exports = mongoose.model('FinancialReport', financialReportSchema)