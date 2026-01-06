const mongoose = require('mongoose')

const serviceSchema = new mongoose.Schema({
  // Tenancy Reference (Multi-tenant support)
  tenancy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    index: true
  },
  
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
  // Base pricing multiplier
  basePriceMultiplier: {
    type: Number,
    default: 1.0
  },
  // Turnaround time in hours
  turnaroundTime: {
    standard: { type: Number, default: 48 },
    express: { type: Number, default: 24 }
  },
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
  }
}, {
  timestamps: true
})

// Indexes
serviceSchema.index({ code: 1 })
serviceSchema.index({ isActive: 1 })
serviceSchema.index({ category: 1 })

module.exports = mongoose.model('Service', serviceSchema)
