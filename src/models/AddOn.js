const mongoose = require('mongoose');

// Add-on configuration schema for flexible feature definitions
const configSchema = new mongoose.Schema({
  // For capacity add-ons
  capacity: {
    feature: { type: String }, // e.g., 'max_branches', 'max_staff'
    increment: { type: Number }, // How much to increase by
    unit: { type: String } // e.g., 'branches', 'users', 'orders'
  },
  
  // For feature unlock add-ons
  features: [{
    key: { type: String }, // e.g., 'campaigns', 'loyalty_points'
    value: { type: mongoose.Schema.Types.Mixed } // true/false or numeric value
  }],
  
  // For usage-based add-ons
  usage: {
    type: { type: String, enum: ['credits', 'quota', 'allowance'] },
    amount: { type: Number }, // Number of credits/quota
    unit: { type: String }, // e.g., 'sms', 'emails', 'api_calls'
    autoRenew: { type: Boolean, default: false },
    lowBalanceThreshold: { type: Number, default: 10 } // Alert when credits < this
  },
  
  // For integration add-ons
  integrations: [{
    service: { type: String }, // e.g., 'stripe', 'pos_system', 'accounting'
    endpoints: [{ type: String }], // Available API endpoints
    rateLimit: { type: Number } // Requests per minute
  }],
  
  // For branding add-ons
  branding: {
    customDomain: { type: Boolean, default: false },
    whiteLabel: { type: Boolean, default: false },
    customThemes: { type: Number, default: 0 }, // Number of custom themes allowed
    logoUpload: { type: Boolean, default: false }
  },
  
  // For support add-ons
  support: {
    priority: { type: String, enum: ['standard', 'priority', 'premium'] },
    responseTime: { type: String }, // e.g., '24h', '4h', '1h'
    channels: [{ type: String }], // e.g., ['email', 'chat', 'phone']
    dedicatedManager: { type: Boolean, default: false }
  }
}, { _id: false });

// Pricing schema with regional and dynamic pricing support
const pricingSchema = new mongoose.Schema({
  // Base pricing
  monthly: { type: Number, default: 0 },
  yearly: { type: Number, default: 0 },
  oneTime: { type: Number, default: 0 },
  
  // Regional pricing (currency code as key)
  regional: {
    type: Map,
    of: {
      monthly: { type: Number },
      yearly: { type: Number },
      oneTime: { type: Number },
      currency: { type: String }
    },
    default: new Map()
  },
  
  // Dynamic pricing for A/B testing
  variants: [{
    name: { type: String }, // e.g., 'variant_a', 'holiday_special'
    monthly: { type: Number },
    yearly: { type: Number },
    oneTime: { type: Number },
    isActive: { type: Boolean, default: false },
    startDate: { type: Date },
    endDate: { type: Date },
    targetPercentage: { type: Number, default: 50 } // % of users to show this variant
  }],
  
  // Discount rules
  discounts: [{
    type: { type: String, enum: ['percentage', 'fixed'] },
    value: { type: Number },
    minQuantity: { type: Number, default: 1 },
    validUntil: { type: Date },
    isActive: { type: Boolean, default: true }
  }]
}, { _id: false });

// Eligibility rules schema
const eligibilitySchema = new mongoose.Schema({
  // Plan requirements
  plans: [{ type: String }], // Which plans can purchase this add-on
  excludePlans: [{ type: String }], // Plans that cannot purchase
  
  // Feature requirements
  requiredFeatures: [{ type: String }], // Must have these features
  conflictingFeatures: [{ type: String }], // Cannot have these features
  
  // Usage requirements
  minUsage: {
    feature: { type: String },
    threshold: { type: Number }
  },
  
  // Geographic restrictions
  allowedCountries: [{ type: String }],
  blockedCountries: [{ type: String }],
  
  // Time-based restrictions
  availableFrom: { type: Date },
  availableUntil: { type: Date },
  
  // Custom rules (for complex business logic)
  customRules: [{
    name: { type: String },
    condition: { type: String }, // JavaScript condition as string
    errorMessage: { type: String }
  }]
}, { _id: false });

const addOnSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Add-on name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens']
  },
  
  displayName: {
    type: String,
    required: [true, 'Display name is required'],
    trim: true,
    maxlength: [150, 'Display name cannot exceed 150 characters']
  },
  
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  shortDescription: {
    type: String,
    maxlength: [100, 'Short description cannot exceed 100 characters']
  },
  
  // Categorization
  category: {
    type: String,
    enum: ['capacity', 'feature', 'usage', 'branding', 'integration', 'support'],
    required: [true, 'Category is required']
  },
  
  subcategory: {
    type: String,
    maxlength: [50, 'Subcategory cannot exceed 50 characters']
  },
  
  tags: [{ 
    type: String,
    maxlength: [30, 'Tag cannot exceed 30 characters']
  }],
  
  // Pricing
  pricing: {
    type: pricingSchema,
    required: true
  },
  
  // Billing Configuration
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly', 'one-time', 'usage-based'],
    required: [true, 'Billing cycle is required']
  },
  
  // Configuration
  config: {
    type: configSchema,
    required: true
  },
  
  // Eligibility Rules
  eligibility: {
    type: eligibilitySchema,
    default: () => ({})
  },
  
  // Visual & Marketing
  icon: {
    type: String,
    default: 'package' // Lucide icon name
  },
  
  color: {
    type: String,
    default: '#3B82F6',
    match: [/^#[0-9A-F]{6}$/i, 'Color must be a valid hex color']
  },
  
  images: [{
    url: { type: String },
    alt: { type: String },
    type: { type: String, enum: ['thumbnail', 'banner', 'screenshot'] }
  }],
  
  // Marketing Content
  benefits: [{ 
    type: String,
    maxlength: [200, 'Benefit cannot exceed 200 characters']
  }],
  
  features: [{ 
    type: String,
    maxlength: [200, 'Feature cannot exceed 200 characters']
  }],
  
  useCases: [{ 
    type: String,
    maxlength: [300, 'Use case cannot exceed 300 characters']
  }],
  
  // Status & Visibility
  status: {
    type: String,
    enum: ['draft', 'active', 'hidden', 'deprecated'],
    default: 'draft'
  },
  
  isPopular: { type: Boolean, default: false },
  isRecommended: { type: Boolean, default: false },
  isFeatured: { type: Boolean, default: false },
  
  // Display Settings
  sortOrder: { type: Number, default: 0 },
  showOnMarketplace: { type: Boolean, default: true },
  showOnPricingPage: { type: Boolean, default: false },
  
  // Trial & Limits
  trialDays: { type: Number, default: 0 },
  maxQuantity: { type: Number, default: 1 }, // Max instances per tenant
  
  // Analytics & Tracking
  analytics: {
    views: { type: Number, default: 0 },
    purchases: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
    lastPurchase: { type: Date }
  },
  
  // SEO & Metadata
  seo: {
    title: { type: String, maxlength: [60, 'SEO title cannot exceed 60 characters'] },
    description: { type: String, maxlength: [160, 'SEO description cannot exceed 160 characters'] },
    keywords: [{ type: String }]
  },
  
  // Versioning
  version: { type: String, default: '1.0.0' },
  changelog: [{
    version: { type: String },
    changes: [{ type: String }],
    date: { type: Date, default: Date.now }
  }],
  
  // Management
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin',
    required: true
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin'
  },
  
  // Soft delete
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin'
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
addOnSchema.index({ slug: 1 }, { unique: true });
addOnSchema.index({ category: 1, status: 1 });
addOnSchema.index({ status: 1, showOnMarketplace: 1 });
addOnSchema.index({ isPopular: -1, sortOrder: 1 });
addOnSchema.index({ createdAt: -1 });
addOnSchema.index({ 'analytics.purchases': -1 });

// Virtual for formatted pricing
addOnSchema.virtual('formattedPricing').get(function() {
  const pricing = this.pricing;
  return {
    monthly: pricing.monthly ? `₹${pricing.monthly}` : null,
    yearly: pricing.yearly ? `₹${pricing.yearly}` : null,
    oneTime: pricing.oneTime ? `₹${pricing.oneTime}` : null,
    savings: pricing.yearly && pricing.monthly ? 
      Math.round(((pricing.monthly * 12 - pricing.yearly) / (pricing.monthly * 12)) * 100) : 0
  };
});

// Pre-save middleware
addOnSchema.pre('save', function(next) {
  // Generate slug from name if not provided
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  
  // Set display name from name if not provided
  if (!this.displayName && this.name) {
    this.displayName = this.name;
  }
  
  // Update analytics conversion rate
  if (this.analytics.views > 0) {
    this.analytics.conversionRate = (this.analytics.purchases / this.analytics.views) * 100;
  }
  
  next();
});

// Methods
addOnSchema.methods.isEligibleForTenant = function(tenant) {
  const eligibility = this.eligibility;
  
  // Check plan eligibility
  if (eligibility.plans && eligibility.plans.length > 0) {
    if (!eligibility.plans.includes(tenant.subscription.plan)) {
      return { eligible: false, reason: 'Plan not eligible' };
    }
  }
  
  // Check excluded plans
  if (eligibility.excludePlans && eligibility.excludePlans.includes(tenant.subscription.plan)) {
    return { eligible: false, reason: 'Plan excluded' };
  }
  
  // Check required features
  if (eligibility.requiredFeatures && eligibility.requiredFeatures.length > 0) {
    for (const feature of eligibility.requiredFeatures) {
      if (!tenant.hasFeature(feature)) {
        return { eligible: false, reason: `Missing required feature: ${feature}` };
      }
    }
  }
  
  // Check conflicting features
  if (eligibility.conflictingFeatures && eligibility.conflictingFeatures.length > 0) {
    for (const feature of eligibility.conflictingFeatures) {
      if (tenant.hasFeature(feature)) {
        return { eligible: false, reason: `Conflicting feature: ${feature}` };
      }
    }
  }
  
  // Check time-based restrictions
  const now = new Date();
  if (eligibility.availableFrom && now < eligibility.availableFrom) {
    return { eligible: false, reason: 'Not yet available' };
  }
  
  if (eligibility.availableUntil && now > eligibility.availableUntil) {
    return { eligible: false, reason: 'No longer available' };
  }
  
  return { eligible: true };
};

addOnSchema.methods.getPricingForRegion = function(countryCode = 'IN', currency = 'INR') {
  const pricing = this.pricing;
  
  // Check for regional pricing
  if (pricing.regional && pricing.regional.has(countryCode)) {
    return pricing.regional.get(countryCode);
  }
  
  // Check for currency-based pricing
  for (const [region, regionPricing] of pricing.regional) {
    if (regionPricing.currency === currency) {
      return regionPricing;
    }
  }
  
  // Return base pricing
  return {
    monthly: pricing.monthly,
    yearly: pricing.yearly,
    oneTime: pricing.oneTime,
    currency: 'INR'
  };
};

addOnSchema.methods.getActiveVariant = function() {
  const variants = this.pricing.variants.filter(v => 
    v.isActive && 
    (!v.startDate || new Date() >= v.startDate) &&
    (!v.endDate || new Date() <= v.endDate)
  );
  
  if (variants.length === 0) return null;
  
  // Simple random selection based on target percentage
  const random = Math.random() * 100;
  let cumulative = 0;
  
  for (const variant of variants) {
    cumulative += variant.targetPercentage;
    if (random <= cumulative) {
      return variant;
    }
  }
  
  return variants[0]; // Fallback
};

addOnSchema.methods.incrementView = function() {
  this.analytics.views += 1;
  return this.save();
};

addOnSchema.methods.recordPurchase = function(amount) {
  this.analytics.purchases += 1;
  this.analytics.revenue += amount;
  this.analytics.lastPurchase = new Date();
  // Use updateOne to avoid full model validation
  return this.constructor.updateOne(
    { _id: this._id },
    { 
      $inc: { 
        'analytics.purchases': 1,
        'analytics.revenue': amount
      },
      $set: {
        'analytics.lastPurchase': new Date()
      }
    }
  );
};

// Static methods
addOnSchema.statics.findByCategory = function(category, options = {}) {
  const query = { 
    category, 
    status: 'active', 
    isDeleted: false,
    ...options 
  };
  
  return this.find(query)
    .sort({ isPopular: -1, sortOrder: 1, createdAt: -1 });
};

addOnSchema.statics.findForMarketplace = function(filters = {}) {
  const query = {
    status: 'active',
    showOnMarketplace: true,
    isDeleted: false,
    ...filters
  };
  
  return this.find(query)
    .sort({ 
      isFeatured: -1, 
      isPopular: -1, 
      sortOrder: 1, 
      createdAt: -1 
    });
};

addOnSchema.statics.findEligibleForTenant = async function(tenantId) {
  const Tenancy = require('./Tenancy');
  const tenant = await Tenancy.findById(tenantId);
  
  if (!tenant) {
    throw new Error('Tenant not found');
  }
  
  const addOns = await this.findForMarketplace();
  const eligibleAddOns = [];
  
  for (const addOn of addOns) {
    const eligibility = addOn.isEligibleForTenant(tenant);
    if (eligibility.eligible) {
      eligibleAddOns.push(addOn);
    }
  }
  
  return eligibleAddOns;
};

module.exports = mongoose.model('AddOn', addOnSchema);