const mongoose = require('mongoose');
const { ORDER_STATUS, PAYMENT_METHODS } = require('../config/constants');

const orderSchema = new mongoose.Schema({
  // Tenancy Reference (Multi-tenant support)
  tenancy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: true,
    index: true
  },
  
  orderNumber: {
    type: String,
    required: true
  },
  // Barcode for order tracking and scanning
  barcode: {
    type: String,
    sparse: true
  },
  barcodeGeneratedAt: {
    type: Date
  },
  // Service type: full_service, self_drop_self_pickup, self_drop_home_delivery, home_pickup_self_pickup
  serviceType: {
    type: String,
    enum: ['full_service', 'self_drop_self_pickup', 'self_drop_home_delivery', 'home_pickup_self_pickup'],
    default: 'full_service'
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  branch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch'
  },
  // Pickup details
  pickupAddress: {
    name: String,
    phone: String,
    addressLine1: String,
    addressLine2: String,
    landmark: String,
    city: String,
    pincode: String
  },
  pickupDate: {
    type: Date,
    required: true
  },
  pickupTimeSlot: {
    type: String,
    required: true
  },
  // Delivery details
  deliveryAddress: {
    name: String,
    phone: String,
    addressLine1: String,
    addressLine2: String,
    landmark: String,
    city: String,
    pincode: String
  },
  estimatedDeliveryDate: Date,
  actualDeliveryDate: Date,
  // Order items
  items: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OrderItem'
  }],
  // Pricing
  pricing: {
    subtotal: {
      type: Number,
      required: true
    },
    expressCharge: {
      type: Number,
      default: 0
    },
    deliveryCharge: {
      type: Number,
      default: 0
    },
    discount: {
      type: Number,
      default: 0
    },
    couponCode: {
      type: String
    },
    couponDiscount: {
      type: Number,
      default: 0
    },
    tax: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      required: true
    }
  },
  // Distance-based delivery details
  deliveryDetails: {
    distance: {
      type: Number,  // Distance in km
      default: 0
    },
    deliveryCharge: {
      type: Number,  // Calculated delivery charge
      default: 0
    },
    calculatedAt: {
      type: Date
    },
    isFallbackPricing: {
      type: Boolean,
      default: false
    },
    // Snapshot of pricing config at order time (for audit)
    pricingSnapshot: {
      baseDistance: Number,
      perKmRate: Number,
      maxDistance: Number
    }
  },
  // Payment
  paymentMethod: {
    type: String,
    enum: Object.values(PAYMENT_METHODS),
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentDetails: {
    transactionId: String,
    paidAt: Date
  },
  // Status tracking
  status: {
    type: String,
    enum: Object.values(ORDER_STATUS),
    default: ORDER_STATUS.PLACED
  },
  statusHistory: [{
    status: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    notes: String
  }],
  // Logistics
  logisticsPartner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LogisticsPartner'
  },
  // Special instructions
  specialInstructions: String,
  // Staff assignment
  assignedStaff: [{
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff'
    },
    assignedAt: Date,
    completedAt: Date
  }],
  // Flags
  isExpress: {
    type: Boolean,
    default: false
  },
  isVIPOrder: {
    type: Boolean,
    default: false
  },
  isCancelled: {
    type: Boolean,
    default: false
  },
  cancellationReason: String,
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancelledAt: Date,
  // Rating
  rating: {
    score: {
      type: Number,
      min: 1,
      max: 5
    },
    feedback: String,
    ratedAt: Date
  },
  // Invoice
  invoiceGenerated: {
    type: Boolean,
    default: false
  },
  invoiceUrl: String
}, {
  timestamps: true
});

// Indexes
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ barcode: 1 });
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ branch: 1, status: 1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ pickupDate: 1 });

// Generate order number and barcode
orderSchema.pre('save', async function(next) {
  if (!this.orderNumber) {
    const count = await mongoose.model('Order').countDocuments();
    this.orderNumber = `ORD${Date.now()}${String(count + 1).padStart(4, '0')}`;
  }
  
  // Generate unique barcode if not exists
  if (!this.barcode) {
    // Format: LP + timestamp(6 digits) + random(4 digits) = 12 character barcode
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(1000 + Math.random() * 9000);
    this.barcode = `LP${timestamp}${random}`;
    this.barcodeGeneratedAt = new Date();
  }
  
  next();
});

// Update status with history
orderSchema.methods.updateStatus = function(newStatus, updatedBy, notes = '') {
  this.status = newStatus;
  this.statusHistory.push({
    status: newStatus,
    updatedBy,
    updatedAt: new Date(),
    notes
  });
  return this.save();
};

// Check if order can be cancelled
orderSchema.methods.canBeCancelled = function() {
  const cancellableStatuses = [
    ORDER_STATUS.PLACED,
    ORDER_STATUS.ASSIGNED_TO_BRANCH,
    ORDER_STATUS.ASSIGNED_TO_LOGISTICS_PICKUP
  ];
  return cancellableStatuses.includes(this.status);
};

module.exports = mongoose.model('Order', orderSchema);