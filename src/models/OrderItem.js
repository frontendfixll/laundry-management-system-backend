const mongoose = require('mongoose');
const { SERVICES, CLOTHING_CATEGORIES, ITEM_TYPES } = require('../config/constants');

const orderItemSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  // Unique tag/barcode for this specific item
  tagCode: {
    type: String,
    unique: true,
    sparse: true
  },
  tagGeneratedAt: {
    type: Date
  },
  // QR code data (stores the full data encoded in QR)
  qrData: {
    type: String
  },
  itemType: {
    type: String,
    required: true
    // Removed enum validation to allow dynamic items from database
    // Validation is done at API level against ServiceItem collection
  },
  service: {
    type: String,
    required: true
    // Removed enum validation to allow dynamic services created by branches
    // Validation is done at API level against Service collection
  },
  category: {
    type: String,
    enum: Object.values(CLOTHING_CATEGORIES),
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  // Pricing breakdown
  basePrice: {
    type: Number,
    required: true
  },
  serviceMultiplier: {
    type: Number,
    default: 1
  },
  categoryMultiplier: {
    type: Number,
    default: 1
  },
  expressMultiplier: {
    type: Number,
    default: 1
  },
  unitPrice: {
    type: Number,
    required: true
  },
  totalPrice: {
    type: Number,
    required: true
  },
  // Special instructions for this item
  specialInstructions: String,
  // Processing status
  processingStatus: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'quality_check', 'ready'],
    default: 'pending'
  },
  // Quality check
  qualityCheck: {
    passed: Boolean,
    notes: String,
    checkedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    checkedAt: Date
  },
  // Issues
  issues: [{
    type: {
      type: String,
      enum: ['stain_not_removed', 'damage', 'color_bleeding', 'shrinkage', 'other']
    },
    description: String,
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reportedAt: {
      type: Date,
      default: Date.now
    },
    resolved: {
      type: Boolean,
      default: false
    }
  }]
}, {
  timestamps: true
});

// Indexes
orderItemSchema.index({ order: 1 });
orderItemSchema.index({ processingStatus: 1 });
orderItemSchema.index({ tagCode: 1 });

// Generate tag code and calculate total price
orderItemSchema.pre('save', async function(next) {
  this.totalPrice = this.unitPrice * this.quantity;
  
  // Generate unique tag code if not exists
  if (!this.tagCode) {
    // Format: IT + timestamp(6 digits) + random(4 digits) = 12 character tag
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(1000 + Math.random() * 9000);
    this.tagCode = `IT${timestamp}${random}`;
    this.tagGeneratedAt = new Date();
    
    // Generate QR data (JSON string with item info)
    this.qrData = JSON.stringify({
      tagCode: this.tagCode,
      orderId: this.order.toString(),
      itemType: this.itemType,
      service: this.service
    });
  }
  
  next();
});

module.exports = mongoose.model('OrderItem', orderItemSchema);