const mongoose = require('mongoose')

const serviceItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { 
    type: String, 
    required: true,
    enum: ['wash_fold', 'dry_cleaning', 'iron_press', 'shoe_cleaning', 'additional']
  },
  basePrice: { type: Number, required: true, min: 0 },
  unit: { 
    type: String, 
    required: true,
    enum: ['per_piece', 'per_kg', 'per_pair', 'per_set']
  },
  minQuantity: { type: Number, default: 1 },
  maxQuantity: { type: Number, default: 100 },
  isActive: { type: Boolean, default: true },
  description: String,
  processingTime: { type: Number, default: 24 }, // hours
  specialInstructions: String
})

const expressChargeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: {
    type: String,
    required: true,
    enum: ['percentage', 'fixed_amount', 'per_item']
  },
  value: { type: Number, required: true, min: 0 },
  minOrderValue: { type: Number, default: 0 },
  maxOrderValue: { type: Number, default: 0 }, // 0 = no limit
  deliveryTime: { type: Number, required: true }, // hours
  isActive: { type: Boolean, default: true },
  description: String
})

const holidayPricingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  type: {
    type: String,
    required: true,
    enum: ['percentage_increase', 'fixed_surcharge', 'multiplier']
  },
  value: { type: Number, required: true, min: 0 },
  applicableServices: [{
    type: String,
    enum: ['wash_fold', 'dry_cleaning', 'iron_press', 'shoe_cleaning', 'all']
  }],
  isRecurring: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  description: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'CenterAdmin' }
})

const discountPolicySchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, unique: true, sparse: true }, // Optional discount code
  type: {
    type: String,
    required: true,
    enum: ['percentage', 'fixed_amount', 'buy_x_get_y', 'bulk_discount']
  },
  value: { type: Number, required: true, min: 0 },
  
  // Conditions
  minOrderValue: { type: Number, default: 0 },
  maxOrderValue: { type: Number, default: 0 }, // 0 = no limit
  minQuantity: { type: Number, default: 1 },
  maxUsagePerCustomer: { type: Number, default: 0 }, // 0 = unlimited
  maxTotalUsage: { type: Number, default: 0 }, // 0 = unlimited
  
  // Validity
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  
  // Applicability
  applicableServices: [{
    type: String,
    enum: ['wash_fold', 'dry_cleaning', 'iron_press', 'shoe_cleaning', 'all']
  }],
  applicableBranches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
  customerSegments: [{
    type: String,
    enum: ['new_customer', 'regular_customer', 'premium_customer', 'all']
  }],
  
  // Usage tracking
  usageCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  description: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'CenterAdmin' }
})

const pricingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  version: { type: String, required: true },
  isActive: { type: Boolean, default: false },
  isDefault: { type: Boolean, default: false },
  
  // Service Items
  serviceItems: [serviceItemSchema],
  
  // Express Charges
  expressCharges: [expressChargeSchema],
  
  // Holiday Pricing
  holidayPricing: [holidayPricingSchema],
  
  // Discount Policies
  discountPolicies: [discountPolicySchema],
  
  // Global Settings
  settings: {
    currency: { type: String, default: 'INR' },
    taxRate: { type: Number, default: 18 }, // GST percentage
    deliveryCharges: {
      freeDeliveryThreshold: { type: Number, default: 500 },
      standardCharge: { type: Number, default: 50 },
      expressCharge: { type: Number, default: 100 }
    },
    roundingRule: {
      type: String,
      enum: ['round_up', 'round_down', 'round_nearest'],
      default: 'round_nearest'
    },
    minimumOrderValue: { type: Number, default: 100 }
  },
  
  // Approval and Audit
  approvalStatus: {
    type: String,
    enum: ['draft', 'pending_approval', 'approved', 'rejected'],
    default: 'draft'
  },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'CenterAdmin' },
  approvedAt: Date,
  rejectionReason: String,
  
  // Effective dates
  effectiveFrom: Date,
  effectiveTo: Date,
  
  // Creation and modification
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'CenterAdmin', required: true },
  lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'CenterAdmin' },
  
  // Usage statistics
  stats: {
    ordersProcessed: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    discountsApplied: { type: Number, default: 0 },
    averageOrderValue: { type: Number, default: 0 }
  }
}, {
  timestamps: true
})

// Indexes
pricingSchema.index({ isActive: 1, isDefault: 1 })
pricingSchema.index({ version: 1 })
pricingSchema.index({ effectiveFrom: 1, effectiveTo: 1 })
pricingSchema.index({ 'serviceItems.category': 1 })
pricingSchema.index({ 'discountPolicies.code': 1 })

// Ensure only one default pricing
pricingSchema.pre('save', async function(next) {
  if (this.isDefault && this.isModified('isDefault')) {
    await this.constructor.updateMany(
      { _id: { $ne: this._id } },
      { isDefault: false }
    )
  }
  next()
})

// Method to calculate item price
pricingSchema.methods.calculateItemPrice = function(itemName, quantity = 1, options = {}) {
  const item = this.serviceItems.find(item => 
    item.name.toLowerCase() === itemName.toLowerCase() && item.isActive
  )
  
  if (!item) {
    throw new Error(`Service item '${itemName}' not found`)
  }
  
  let basePrice = item.basePrice * quantity
  
  // Apply express charges if requested
  if (options.isExpress && this.expressCharges.length > 0) {
    const expressCharge = this.expressCharges.find(charge => 
      charge.isActive && 
      basePrice >= charge.minOrderValue &&
      (charge.maxOrderValue === 0 || basePrice <= charge.maxOrderValue)
    )
    
    if (expressCharge) {
      switch (expressCharge.type) {
        case 'percentage':
          basePrice += (basePrice * expressCharge.value / 100)
          break
        case 'fixed_amount':
          basePrice += expressCharge.value
          break
        case 'per_item':
          basePrice += (expressCharge.value * quantity)
          break
      }
    }
  }
  
  // Apply holiday pricing if applicable
  const now = new Date()
  const holidayPricing = this.holidayPricing.find(holiday =>
    holiday.isActive &&
    now >= holiday.startDate &&
    now <= holiday.endDate &&
    (holiday.applicableServices.includes('all') || 
     holiday.applicableServices.includes(item.category))
  )
  
  if (holidayPricing) {
    switch (holidayPricing.type) {
      case 'percentage_increase':
        basePrice += (basePrice * holidayPricing.value / 100)
        break
      case 'fixed_surcharge':
        basePrice += holidayPricing.value
        break
      case 'multiplier':
        basePrice *= holidayPricing.value
        break
    }
  }
  
  return Math.round(basePrice * 100) / 100 // Round to 2 decimal places
}

// Method to apply discount
pricingSchema.methods.applyDiscount = function(orderTotal, discountCode, customerInfo = {}) {
  let discount = 0
  let appliedDiscount = null
  
  // Find applicable discount
  const now = new Date()
  const applicableDiscounts = this.discountPolicies.filter(policy =>
    policy.isActive &&
    now >= policy.startDate &&
    now <= policy.endDate &&
    orderTotal >= policy.minOrderValue &&
    (policy.maxOrderValue === 0 || orderTotal <= policy.maxOrderValue) &&
    (!discountCode || policy.code === discountCode)
  )
  
  // Apply the best discount
  for (const policy of applicableDiscounts) {
    let policyDiscount = 0
    
    switch (policy.type) {
      case 'percentage':
        policyDiscount = (orderTotal * policy.value / 100)
        break
      case 'fixed_amount':
        policyDiscount = policy.value
        break
      // Add more discount types as needed
    }
    
    if (policyDiscount > discount) {
      discount = policyDiscount
      appliedDiscount = policy
    }
  }
  
  return {
    discount: Math.round(discount * 100) / 100,
    appliedDiscount,
    finalAmount: Math.round((orderTotal - discount) * 100) / 100
  }
}

// Method to calculate total order price
pricingSchema.methods.calculateOrderTotal = function(items, options = {}) {
  let subtotal = 0
  const itemDetails = []
  
  // Calculate item prices
  for (const orderItem of items) {
    try {
      const itemPrice = this.calculateItemPrice(
        orderItem.name, 
        orderItem.quantity, 
        options
      )
      
      subtotal += itemPrice
      itemDetails.push({
        name: orderItem.name,
        quantity: orderItem.quantity,
        unitPrice: itemPrice / orderItem.quantity,
        totalPrice: itemPrice
      })
    } catch (error) {
      throw new Error(`Error calculating price for ${orderItem.name}: ${error.message}`)
    }
  }
  
  // Apply discount if provided
  let discountInfo = { discount: 0, appliedDiscount: null, finalAmount: subtotal }
  if (options.discountCode || options.autoApplyBestDiscount) {
    discountInfo = this.applyDiscount(subtotal, options.discountCode, options.customerInfo)
  }
  
  // Calculate tax
  const taxAmount = (discountInfo.finalAmount * this.settings.taxRate / 100)
  
  // Calculate delivery charges
  let deliveryCharge = 0
  if (options.includeDelivery && discountInfo.finalAmount < this.settings.deliveryCharges.freeDeliveryThreshold) {
    deliveryCharge = options.isExpress 
      ? this.settings.deliveryCharges.expressCharge
      : this.settings.deliveryCharges.standardCharge
  }
  
  const total = discountInfo.finalAmount + taxAmount + deliveryCharge
  
  return {
    itemDetails,
    subtotal: Math.round(subtotal * 100) / 100,
    discount: discountInfo.discount,
    appliedDiscount: discountInfo.appliedDiscount,
    taxAmount: Math.round(taxAmount * 100) / 100,
    deliveryCharge,
    total: Math.round(total * 100) / 100
  }
}

// Static method to get active pricing
pricingSchema.statics.getActivePricing = async function() {
  return await this.findOne({ isActive: true, isDefault: true })
}

module.exports = mongoose.model('Pricing', pricingSchema)