const mongoose = require('mongoose')

const serviceItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  itemId: {
    type: String,
    required: true
  },
  service: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['men', 'women', 'kids', 'household', 'institutional', 'others']
  },
  basePrice: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  // For branch-created service items
  createdByBranch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch'
  }
}, {
  timestamps: true
})

// Indexes
serviceItemSchema.index({ service: 1, isActive: 1 })
serviceItemSchema.index({ itemId: 1 })
serviceItemSchema.index({ category: 1 })
serviceItemSchema.index({ createdByBranch: 1 })

// Compound unique index - itemId should be unique per branch (or global if no branch)
serviceItemSchema.index({ itemId: 1, createdByBranch: 1 }, { unique: true })

module.exports = mongoose.model('ServiceItem', serviceItemSchema)
