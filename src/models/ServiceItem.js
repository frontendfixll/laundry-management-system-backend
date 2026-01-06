const mongoose = require('mongoose')

const serviceItemSchema = new mongoose.Schema({
  // Tenancy Reference (Multi-tenant support)
  tenancy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    index: true
  },
  
  name: {
    type: String,
    required: true
  },
  itemId: {
    type: String,
    required: true,
    unique: true
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
  }
}, {
  timestamps: true
})

// Indexes
serviceItemSchema.index({ service: 1, isActive: 1 })
serviceItemSchema.index({ itemId: 1 })
serviceItemSchema.index({ category: 1 })

module.exports = mongoose.model('ServiceItem', serviceItemSchema)
