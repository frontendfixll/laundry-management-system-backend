const mongoose = require('mongoose');

const billingPlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  displayName: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  price: {
    monthly: { type: Number, default: 0 },
    yearly: { type: Number, default: 0 }
  },
  
  // Dynamic features - supports any feature key with boolean or number value
  // Example: { campaigns: true, loyalty_points: false, max_orders: 500 }
  features: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  },
  
  // Legacy features for backward compatibility (will be migrated to features Map)
  legacyFeatures: {
    maxOrders: { type: Number, default: 100 },
    maxStaff: { type: Number, default: 5 },
    maxCustomers: { type: Number, default: 500 },
    maxBranches: { type: Number, default: 1 },
    customDomain: { type: Boolean, default: false },
    advancedAnalytics: { type: Boolean, default: false },
    apiAccess: { type: Boolean, default: false },
    whiteLabel: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false },
    customBranding: { type: Boolean, default: true }
  },
  
  // Trial settings
  trialDays: { type: Number, default: 60 }, // 2 months trial
  
  // Highlight this plan on pricing page
  isPopular: { type: Boolean, default: false },
  
  // Badge text (e.g., "Most Popular", "Best Value")
  badge: { type: String, default: '' },
  
  isDefault: { type: Boolean, default: false }, // Default plans can't be deleted
  isCustom: { type: Boolean, default: false },  // Custom plans created by superadmin
  showOnMarketing: { type: Boolean, default: true }, // Show on public pricing page
  isActive: { type: Boolean, default: true },
  
  // Sort order for display
  sortOrder: { type: Number, default: 0 },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin'
  }
}, { timestamps: true });

// Virtual to get features as plain object (for API responses)
billingPlanSchema.virtual('featuresObject').get(function() {
  if (this.features instanceof Map) {
    return Object.fromEntries(this.features);
  }
  return this.features || {};
});

// Method to get a specific feature value
billingPlanSchema.methods.getFeature = function(key, defaultValue = false) {
  if (this.features instanceof Map) {
    return this.features.has(key) ? this.features.get(key) : defaultValue;
  }
  return this.features?.[key] ?? defaultValue;
};

// Method to set a feature value
billingPlanSchema.methods.setFeature = function(key, value) {
  if (!(this.features instanceof Map)) {
    this.features = new Map();
  }
  this.features.set(key, value);
};

// Method to check if plan has a boolean feature enabled
billingPlanSchema.methods.hasFeature = function(key) {
  return this.getFeature(key, false) === true;
};

// Ensure features is always a Map when saving
billingPlanSchema.pre('save', function(next) {
  if (this.features && !(this.features instanceof Map)) {
    this.features = new Map(Object.entries(this.features));
  }
  next();
});

// Transform for JSON output
billingPlanSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    // Convert features Map to plain object for JSON
    if (ret.features instanceof Map) {
      ret.features = Object.fromEntries(ret.features);
    }
    return ret;
  }
});

billingPlanSchema.set('toObject', {
  virtuals: true,
  transform: function(doc, ret) {
    if (ret.features instanceof Map) {
      ret.features = Object.fromEntries(ret.features);
    }
    return ret;
  }
});

const invoiceSchema = new mongoose.Schema({
  tenancy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: true,
    index: true
  },
  invoiceNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  billingPeriod: {
    start: { type: Date, required: true },
    end: { type: Date, required: true }
  },
  plan: {
    type: String,
    required: true
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly'],
    default: 'monthly'
  },
  amount: {
    subtotal: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true }
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'paid', 'overdue', 'cancelled', 'refunded'],
    default: 'pending'
  },
  dueDate: { type: Date, required: true },
  paidAt: { type: Date },
  paymentMethod: {
    type: String,
    enum: ['card', 'bank_transfer', 'upi', 'wallet', 'manual']
  },
  paymentDetails: {
    transactionId: String,
    gateway: String,
    gatewayResponse: mongoose.Schema.Types.Mixed
  },
  notes: String
}, { timestamps: true });

// Generate invoice number
invoiceSchema.pre('save', async function(next) {
  if (!this.invoiceNumber) {
    const count = await mongoose.model('TenancyInvoice').countDocuments();
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    this.invoiceNumber = `INV-${year}${month}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

const paymentSchema = new mongoose.Schema({
  tenancy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: true,
    index: true
  },
  invoice: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TenancyInvoice'
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['card', 'bank_transfer', 'upi', 'wallet', 'manual'],
    required: true
  },
  transactionId: String,
  gateway: String,
  gatewayResponse: mongoose.Schema.Types.Mixed,
  refundedAmount: { type: Number, default: 0 },
  refundedAt: Date,
  notes: String
}, { timestamps: true });

// Indexes
invoiceSchema.index({ tenancy: 1, createdAt: -1 });
invoiceSchema.index({ status: 1, dueDate: 1 });
paymentSchema.index({ tenancy: 1, createdAt: -1 });
paymentSchema.index({ status: 1 });

const BillingPlan = mongoose.model('BillingPlan', billingPlanSchema);
const TenancyInvoice = mongoose.model('TenancyInvoice', invoiceSchema);
const TenancyPayment = mongoose.model('TenancyPayment', paymentSchema);

module.exports = {
  BillingPlan,
  TenancyInvoice,
  TenancyPayment
};
