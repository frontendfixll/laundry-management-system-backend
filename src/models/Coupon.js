const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  tenancy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: true,
    index: true
  },
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: ['percentage', 'fixed_amount'],
    required: true
  },
  value: {
    type: Number,
    required: true,
    min: 0
  },
  minOrderValue: {
    type: Number,
    default: 0
  },
  maxDiscount: {
    type: Number,
    default: 0  // 0 = no limit
  },
  usageLimit: {
    type: Number,
    default: 0  // 0 = unlimited
  },
  usedCount: {
    type: Number,
    default: 0
  },
  perUserLimit: {
    type: Number,
    default: 1
  },
  userUsage: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    count: { type: Number, default: 0 }
  }],
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  applicableServices: [{
    type: String,
    default: 'all'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Compound index for unique code per tenancy
couponSchema.index({ tenancy: 1, code: 1 }, { unique: true });

// Check if coupon is valid
couponSchema.methods.isValid = function(orderValue = 0, userId = null) {
  const now = new Date();
  
  // Check if active
  if (!this.isActive) {
    return { valid: false, message: 'Coupon is not active' };
  }
  
  // Check dates
  if (now < this.startDate) {
    return { valid: false, message: 'Coupon is not yet active' };
  }
  if (now > this.endDate) {
    return { valid: false, message: 'Coupon has expired' };
  }
  
  // Check usage limit
  if (this.usageLimit > 0 && this.usedCount >= this.usageLimit) {
    return { valid: false, message: 'Coupon usage limit reached' };
  }
  
  // Check minimum order value
  if (orderValue < this.minOrderValue) {
    return { valid: false, message: `Minimum order value is ₹${this.minOrderValue}` };
  }
  
  // Check per user limit
  if (userId && this.perUserLimit > 0) {
    const userUsageRecord = this.userUsage.find(u => u.user.toString() === userId.toString());
    if (userUsageRecord && userUsageRecord.count >= this.perUserLimit) {
      return { valid: false, message: 'You have already used this coupon' };
    }
  }
  
  return { valid: true };
};

// Calculate discount
couponSchema.methods.calculateDiscount = function(orderValue) {
  let discount = 0;
  
  if (this.type === 'percentage') {
    discount = (orderValue * this.value) / 100;
  } else {
    discount = this.value;
  }
  
  // Apply max discount cap
  if (this.maxDiscount > 0 && discount > this.maxDiscount) {
    discount = this.maxDiscount;
  }
  
  // Discount cannot exceed order value
  if (discount > orderValue) {
    discount = orderValue;
  }
  
  return Math.round(discount);
};

// Record usage
couponSchema.methods.recordUsage = async function(userId, orderId = null, discountAmount = 0) {
  this.usedCount += 1;
  
  const userIndex = this.userUsage.findIndex(u => u.user.toString() === userId.toString());
  if (userIndex >= 0) {
    this.userUsage[userIndex].count += 1;
  } else {
    this.userUsage.push({ user: userId, count: 1 });
  }
  
  return this.save();
};

// Alias for isValid - used by order controller
couponSchema.methods.canBeUsedBy = function(userId, orderValue = 0) {
  return this.isValid(orderValue, userId);
};

// Static method to find valid coupon
couponSchema.statics.findValidCoupon = async function(tenancyId, code) {
  const coupon = await this.findOne({
    tenancy: tenancyId,
    code: code.toUpperCase(),
    isActive: true
  });
  
  if (!coupon) return null;
  
  const now = new Date();
  if (now < coupon.startDate || now > coupon.endDate) return null;
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) return null;
  
  return coupon;
};

module.exports = mongoose.model('Coupon', couponSchema);
