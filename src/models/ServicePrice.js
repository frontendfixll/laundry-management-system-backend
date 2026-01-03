const mongoose = require('mongoose')

const servicePriceSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true,
    enum: ['men', 'women', 'kids', 'household', 'institutional', 'others']
  },
  garment: {
    type: String,
    required: true
  },
  dryClean: {
    type: Number,
    default: 0
  },
  steamPress: {
    type: Number,
    default: 0
  },
  starch: {
    type: Number,
    default: 0
  },
  alteration: {
    type: Number,
    default: 0
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
servicePriceSchema.index({ category: 1, isActive: 1 })
servicePriceSchema.index({ garment: 1 })

module.exports = mongoose.model('ServicePrice', servicePriceSchema)
