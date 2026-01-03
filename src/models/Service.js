const mongoose = require('mongoose')

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Service name is required'],
    trim: true
  },
  code: {
    type: String,
    required: [true, 'Service code is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  icon: {
    type: String,
    default: 'Shirt'
  },
  category: {
    type: String,
    enum: ['laundry', 'dry_cleaning', 'pressing', 'specialty', 'other'],
    default: 'laundry'
  },
  // Base pricing multiplier (can be overridden at branch level)
  basePriceMultiplier: {
    type: Number,
    default: 1.0
  },
  // Turnaround time in hours
  turnaroundTime: {
    standard: { type: Number, default: 48 },
    express: { type: Number, default: 24 }
  },
  // Branch-specific settings
  branches: [{
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    priceMultiplier: {
      type: Number,
      default: 1.0
    },
    customTurnaround: {
      standard: Number,
      express: Number
    }
  }],
  // Global settings
  isActive: {
    type: Boolean,
    default: true
  },
  isExpressAvailable: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  // Created by
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // If created by branch manager (branch-specific service)
  createdByBranch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch'
  }
}, {
  timestamps: true
})

// Indexes
serviceSchema.index({ code: 1 })
serviceSchema.index({ isActive: 1 })
serviceSchema.index({ 'branches.branch': 1 })
serviceSchema.index({ category: 1 })

// Check if service is active for a specific branch
serviceSchema.methods.isActiveForBranch = function(branchId) {
  const branchConfig = this.branches.find(b => b.branch.toString() === branchId.toString())
  if (branchConfig) {
    return branchConfig.isActive
  }
  return this.isActive // Default to global setting
}

// Get price multiplier for a branch
serviceSchema.methods.getPriceMultiplier = function(branchId) {
  const branchConfig = this.branches.find(b => b.branch.toString() === branchId.toString())
  if (branchConfig && branchConfig.priceMultiplier) {
    return branchConfig.priceMultiplier
  }
  return this.basePriceMultiplier
}

module.exports = mongoose.model('Service', serviceSchema)
