const mongoose = require('mongoose')

const escalationRuleSchema = new mongoose.Schema({
  level: { type: Number, required: true, min: 1, max: 5 },
  triggerAfter: { type: Number, required: true }, // Minutes after SLA breach
  assignTo: {
    type: String,
    enum: ['admin', 'senior_admin'],
    required: true
  },
  notificationChannels: [{
    type: String,
    enum: ['email', 'sms', 'push', 'slack', 'webhook']
  }],
  actions: [{
    type: String,
    enum: ['notify', 'reassign', 'priority_increase', 'auto_resolve', 'create_ticket']
  }],
  isActive: { type: Boolean, default: true }
})

const slaTargetSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    enum: [
      'service_quality',
      'delivery_delay', 
      'damaged_items',
      'missing_items',
      'billing_issue',
      'staff_behavior',
      'refund_request',
      'technical_issue',
      'fraud_report',
      'other'
    ]
  },
  severity: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical']
  },
  priority: {
    type: String,
    required: true,
    enum: ['low', 'normal', 'high', 'urgent']
  },
  
  // Time targets in minutes
  firstResponseTime: { type: Number, required: true }, // Time to first response
  resolutionTime: { type: Number, required: true }, // Time to resolution
  
  // Business hours consideration
  businessHoursOnly: { type: Boolean, default: false },
  excludeWeekends: { type: Boolean, default: false },
  excludeHolidays: { type: Boolean, default: false },
  
  // Escalation rules for this SLA
  escalationRules: [escalationRuleSchema],
  
  isActive: { type: Boolean, default: true }
})

const businessHoursSchema = new mongoose.Schema({
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 }, // 0 = Sunday
  startTime: { type: String, required: true }, // HH:MM format
  endTime: { type: String, required: true }, // HH:MM format
  isWorkingDay: { type: Boolean, default: true }
})

const holidaySchema = new mongoose.Schema({
  name: { type: String, required: true },
  date: { type: Date, required: true },
  isRecurring: { type: Boolean, default: false },
  description: String
})

const slaConfigSchema = new mongoose.Schema({
  // Configuration Identification
  configId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  name: { type: String, required: true },
  description: String,
  
  // Configuration Status
  isActive: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false },
  
  // SLA Targets
  targets: [slaTargetSchema],
  
  // Business Hours Configuration
  businessHours: [businessHoursSchema],
  timezone: { type: String, default: 'Asia/Kolkata' },
  
  // Holiday Configuration
  holidays: [holidaySchema],
  
  // Global Escalation Settings
  globalEscalation: {
    enabled: { type: Boolean, default: true },
    maxEscalationLevel: { type: Number, default: 3, min: 1, max: 5 },
    autoEscalateAfter: { type: Number, default: 60 }, // Minutes
    escalationCooldown: { type: Number, default: 30 } // Minutes between escalations
  },
  
  // Notification Settings
  notifications: {
    slaWarning: {
      enabled: { type: Boolean, default: true },
      warningThreshold: { type: Number, default: 80 }, // Percentage of SLA time
      channels: [{
        type: String,
        enum: ['email', 'sms', 'push', 'slack', 'webhook']
      }]
    },
    slaBreach: {
      enabled: { type: Boolean, default: true },
      channels: [{
        type: String,
        enum: ['email', 'sms', 'push', 'slack', 'webhook']
      }]
    },
    escalation: {
      enabled: { type: Boolean, default: true },
      channels: [{
        type: String,
        enum: ['email', 'sms', 'push', 'slack', 'webhook']
      }]
    }
  },
  
  // Performance Metrics
  metrics: {
    targetAchievementRate: { type: Number, default: 95 }, // Percentage
    averageResponseTime: Number, // Calculated field
    averageResolutionTime: Number, // Calculated field
    breachRate: Number, // Calculated field
    lastCalculatedAt: Date
  },
  
  // Scope and Applicability
  scope: {
    type: String,
    enum: ['global', 'regional', 'city', 'branch'],
    default: 'global'
  },
  applicableBranches: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Branch' 
  }],
  applicableCities: [String],
  applicableRegions: [String],
  
  // Effective Period
  effectiveFrom: { type: Date, default: Date.now },
  effectiveTo: Date,
  
  // Approval Workflow
  approvalStatus: {
    type: String,
    enum: ['draft', 'pending_approval', 'approved', 'rejected'],
    default: 'draft'
  },
  approvedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User'
  },
  approvedAt: Date,
  rejectionReason: String,
  
  // Audit Trail
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true
  },
  lastModifiedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User'
  },
  
  // Version Control
  version: { type: Number, default: 1 },
  previousVersionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'SLAConfig'
  }
}, {
  timestamps: true
})

// Indexes
slaConfigSchema.index({ isActive: 1, isDefault: 1 })
slaConfigSchema.index({ scope: 1, applicableBranches: 1 })
slaConfigSchema.index({ effectiveFrom: 1, effectiveTo: 1 })
slaConfigSchema.index({ 'targets.category': 1, 'targets.severity': 1 })

// Generate unique config ID
slaConfigSchema.pre('save', async function(next) {
  if (!this.configId) {
    const prefix = 'SLA'
    const timestamp = Date.now().toString().slice(-8)
    const random = Math.random().toString(36).substring(2, 4).toUpperCase()
    this.configId = `${prefix}${timestamp}${random}`
  }
  
  // Ensure only one default config
  if (this.isDefault && this.isModified('isDefault')) {
    await this.constructor.updateMany(
      { _id: { $ne: this._id } },
      { isDefault: false }
    )
  }
  
  next()
})

// Methods
slaConfigSchema.methods.getSLATarget = function(category, severity, priority) {
  return this.targets.find(target => 
    target.category === category && 
    target.severity === severity && 
    target.priority === priority &&
    target.isActive
  )
}

slaConfigSchema.methods.calculateSLADeadline = function(category, severity, priority, createdAt = new Date()) {
  const target = this.getSLATarget(category, severity, priority)
  if (!target) return null
  
  let deadline = new Date(createdAt)
  
  if (target.businessHoursOnly) {
    // Calculate deadline considering business hours
    deadline = this.addBusinessMinutes(deadline, target.resolutionTime)
  } else {
    // Simple addition of minutes
    deadline.setMinutes(deadline.getMinutes() + target.resolutionTime)
  }
  
  return deadline
}

slaConfigSchema.methods.addBusinessMinutes = function(startDate, minutes) {
  let currentDate = new Date(startDate)
  let remainingMinutes = minutes
  
  while (remainingMinutes > 0) {
    const dayOfWeek = currentDate.getDay()
    const businessHour = this.businessHours.find(bh => bh.dayOfWeek === dayOfWeek)
    
    if (!businessHour || !businessHour.isWorkingDay) {
      // Skip to next working day
      currentDate.setDate(currentDate.getDate() + 1)
      currentDate.setHours(0, 0, 0, 0)
      continue
    }
    
    const [startHour, startMinute] = businessHour.startTime.split(':').map(Number)
    const [endHour, endMinute] = businessHour.endTime.split(':').map(Number)
    
    const dayStart = new Date(currentDate)
    dayStart.setHours(startHour, startMinute, 0, 0)
    
    const dayEnd = new Date(currentDate)
    dayEnd.setHours(endHour, endMinute, 0, 0)
    
    // If current time is before business hours, move to start of business hours
    if (currentDate < dayStart) {
      currentDate = new Date(dayStart)
    }
    
    // If current time is after business hours, move to next day
    if (currentDate >= dayEnd) {
      currentDate.setDate(currentDate.getDate() + 1)
      currentDate.setHours(0, 0, 0, 0)
      continue
    }
    
    // Calculate available minutes in current day
    const availableMinutes = Math.floor((dayEnd - currentDate) / (1000 * 60))
    const minutesToAdd = Math.min(remainingMinutes, availableMinutes)
    
    currentDate.setMinutes(currentDate.getMinutes() + minutesToAdd)
    remainingMinutes -= minutesToAdd
    
    // If we've used all available minutes in the day, move to next day
    if (remainingMinutes > 0) {
      currentDate.setDate(currentDate.getDate() + 1)
      currentDate.setHours(0, 0, 0, 0)
    }
  }
  
  return currentDate
}

slaConfigSchema.methods.isHoliday = function(date) {
  return this.holidays.some(holiday => {
    if (holiday.isRecurring) {
      // Check if month and day match
      return holiday.date.getMonth() === date.getMonth() && 
             holiday.date.getDate() === date.getDate()
    } else {
      // Check exact date match
      return holiday.date.toDateString() === date.toDateString()
    }
  })
}

slaConfigSchema.methods.getEscalationRules = function(category, severity, priority) {
  const target = this.getSLATarget(category, severity, priority)
  return target ? target.escalationRules.filter(rule => rule.isActive) : []
}

slaConfigSchema.methods.activate = async function() {
  // Deactivate other configs if this is being set as default
  if (this.isDefault) {
    await this.constructor.updateMany(
      { _id: { $ne: this._id } },
      { isActive: false, isDefault: false }
    )
  }
  
  this.isActive = true
  return await this.save()
}

slaConfigSchema.methods.createNewVersion = async function(updates, createdBy) {
  const newConfig = new this.constructor({
    ...this.toObject(),
    _id: undefined,
    configId: undefined, // Will be auto-generated
    ...updates,
    version: this.version + 1,
    previousVersionId: this._id,
    createdBy,
    approvalStatus: 'draft',
    approvedBy: undefined,
    approvedAt: undefined,
    createdAt: undefined,
    updatedAt: undefined
  })
  
  return await newConfig.save()
}

// Static methods
slaConfigSchema.statics.getActiveConfig = async function(branchId = null) {
  const query = { isActive: true }
  
  if (branchId) {
    query.$or = [
      { scope: 'global' },
      { scope: 'branch', applicableBranches: branchId }
    ]
  }
  
  return await this.findOne(query).sort({ scope: -1, isDefault: -1 })
}

slaConfigSchema.statics.calculateMetrics = async function(configId, startDate, endDate) {
  const Complaint = mongoose.model('Complaint')
  
  const complaints = await Complaint.find({
    createdAt: { $gte: startDate, $lte: endDate },
    status: { $in: ['resolved', 'closed'] }
  })
  
  if (complaints.length === 0) {
    return {
      totalComplaints: 0,
      averageResponseTime: 0,
      averageResolutionTime: 0,
      breachRate: 0,
      targetAchievementRate: 0
    }
  }
  
  const totalComplaints = complaints.length
  const totalResponseTime = complaints.reduce((sum, c) => sum + (c.responseTime || 0), 0)
  const totalResolutionTime = complaints.reduce((sum, c) => sum + (c.resolutionTime || 0), 0)
  const breachedComplaints = complaints.filter(c => c.slaBreached).length
  
  const averageResponseTime = totalResponseTime / totalComplaints
  const averageResolutionTime = totalResolutionTime / totalComplaints
  const breachRate = (breachedComplaints / totalComplaints) * 100
  const targetAchievementRate = ((totalComplaints - breachedComplaints) / totalComplaints) * 100
  
  return {
    totalComplaints,
    averageResponseTime: Math.round(averageResponseTime),
    averageResolutionTime: Math.round(averageResolutionTime),
    breachRate: Math.round(breachRate * 100) / 100,
    targetAchievementRate: Math.round(targetAchievementRate * 100) / 100
  }
}

module.exports = mongoose.model('SLAConfig', slaConfigSchema)