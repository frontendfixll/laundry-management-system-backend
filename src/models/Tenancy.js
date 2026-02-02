const mongoose = require('mongoose');

const brandingSchema = new mongoose.Schema({
  // Business Identity
  businessName: {
    type: String,
    default: '',
    maxlength: [100, 'Business name cannot exceed 100 characters']
  },
  tagline: {
    type: String,
    default: '',
    maxlength: [200, 'Tagline cannot exceed 200 characters']
  },
  slogan: {
    type: String,
    default: '',
    maxlength: [200, 'Slogan cannot exceed 200 characters']
  },

  // Logos
  logo: {
    url: { type: String, default: '' },
    publicId: { type: String, default: '' }  // For cloud storage
  },
  secondaryLogo: {
    url: { type: String, default: '' },
    publicId: { type: String, default: '' }
  },
  favicon: {
    url: { type: String, default: '' },
    publicId: { type: String, default: '' }
  },

  // Social Media
  socialMedia: {
    facebook: { type: String, default: '' },
    instagram: { type: String, default: '' },
    twitter: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    youtube: { type: String, default: '' },
    whatsapp: { type: String, default: '' }
  },

  // Theme
  theme: {
    primaryColor: { type: String, default: '#3B82F6' },      // Blue
    secondaryColor: { type: String, default: '#10B981' },    // Green
    accentColor: { type: String, default: '#F59E0B' },       // Amber
    backgroundColor: { type: String, default: '#FFFFFF' },
    textColor: { type: String, default: '#1F2937' },
    fontFamily: { type: String, default: 'Inter' },
    layout: { type: String, enum: ['modern', 'classic', 'minimal'], default: 'modern' }
  },
  landingPageTemplate: {
    type: String,
    enum: ['original', 'minimal', 'freshspin', 'starter'],
    default: 'original'
  },
  customCss: { type: String, default: '' }
}, { _id: false });

const contactSchema = new mongoose.Schema({
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  whatsapp: { type: String, default: '' },
  address: {
    line1: { type: String, default: '' },
    line2: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    country: { type: String, default: 'India' }
  },
  coordinates: {
    lat: { type: Number },
    lng: { type: Number }
  }
}, { _id: false });

const businessHoursSchema = new mongoose.Schema({
  monday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
  tuesday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
  wednesday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
  thursday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
  friday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
  saturday: { open: String, close: String, isOpen: { type: Boolean, default: true } },
  sunday: { open: String, close: String, isOpen: { type: Boolean, default: false } }
}, { _id: false });

const subscriptionSchema = new mongoose.Schema({
  plan: { type: String, default: 'free' }, // Now supports any plan name
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingPlan' }, // Reference to BillingPlan
  status: { type: String, enum: ['active', 'trial', 'expired', 'cancelled', 'pending'], default: 'trial' },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  trialEndsAt: { type: Date },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },

  // Dynamic features - supports any feature key with boolean or number value
  // Example: { campaigns: true, loyalty_points: false, max_orders: 500 }
  features: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Features gained from active add-ons
  addOnFeatures: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Legacy features for backward compatibility (deprecated)
  legacyFeatures: {
    maxOrders: { type: Number, default: 100 },
    maxStaff: { type: Number, default: 5 },
    maxCustomers: { type: Number, default: 500 },
    customDomain: { type: Boolean, default: false },
    advancedAnalytics: { type: Boolean, default: false },
    apiAccess: { type: Boolean, default: false },
    whiteLabel: { type: Boolean, default: false }
  }
}, { _id: false });

const tenancySchema = new mongoose.Schema({
  // Basic Info
  name: {
    type: String,
    required: [true, 'Laundry name is required'],
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
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },

  // Domain Configuration
  subdomain: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  customDomain: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  domainStatus: {
    type: String,
    enum: ['pending', 'active', 'failed', 'removed'],
    default: 'pending'
  },
  domainCreatedAt: {
    type: Date
  },
  domainVerifiedAt: {
    type: Date
  },

  // Branding
  branding: {
    type: brandingSchema,
    default: () => ({})
  },

  // Contact Information
  contact: {
    type: contactSchema,
    default: () => ({})
  },

  // Business Hours
  businessHours: {
    type: businessHoursSchema,
    default: () => ({
      monday: { open: '09:00', close: '21:00', isOpen: true },
      tuesday: { open: '09:00', close: '21:00', isOpen: true },
      wednesday: { open: '09:00', close: '21:00', isOpen: true },
      thursday: { open: '09:00', close: '21:00', isOpen: true },
      friday: { open: '09:00', close: '21:00', isOpen: true },
      saturday: { open: '09:00', close: '21:00', isOpen: true },
      sunday: { open: '10:00', close: '18:00', isOpen: false }
    })
  },

  // Subscription & Billing
  subscription: {
    type: subscriptionSchema,
    default: () => ({})
  },

  // Owner/Admin
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending'],
    default: 'pending'
  },

  // Settings
  settings: {
    currency: { type: String, default: 'INR' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    language: { type: String, default: 'en' },
    taxRate: { type: Number, default: 18 },           // GST percentage
    minOrderAmount: { type: Number, default: 0 },
    maxDeliveryRadius: { type: Number, default: 10 }, // km
    autoAssignOrders: { type: Boolean, default: true },
    allowCOD: { type: Boolean, default: true },
    allowOnlinePayment: { type: Boolean, default: true },
    requireEmailVerification: { type: Boolean, default: true }
  },

  // Stats (cached for performance)
  stats: {
    totalOrders: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    totalCustomers: { type: Number, default: 0 },
    totalStaff: { type: Number, default: 0 },
    lastOrderAt: { type: Date }
  },

  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin'
  },

  // DNS Record Information (for dynamic subdomain creation)
  dnsRecord: {
    recordId: { type: String }, // DNS provider record ID
    provider: { type: String, enum: ['cloudflare', 'route53', 'manual', 'vercel'] }, // DNS provider
    createdAt: { type: Date },
    lastVerified: { type: Date }
  },

  // Upgrade Management
  pendingUpgrades: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UpgradeRequest'
  }],

  upgradeHistory: [{
    fromPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingPlan' },
    toPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'BillingPlan' },
    upgradedAt: { type: Date, default: Date.now },
    upgradedBy: mongoose.Schema.Types.ObjectId,
    upgradedByModel: { type: String, enum: ['SalesUser', 'SuperAdmin'] },
    paymentAmount: Number,
    upgradeRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'UpgradeRequest' },
    notes: String
  }],

  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date }

}, {
  timestamps: true
});

// Indexes
tenancySchema.index({ slug: 1 }, { unique: true });
tenancySchema.index({ subdomain: 1 }, { unique: true, sparse: true });
tenancySchema.index({ customDomain: 1 }, { unique: true, sparse: true });
tenancySchema.index({ owner: 1 });
tenancySchema.index({ status: 1 });
tenancySchema.index({ 'subscription.status': 1 });
tenancySchema.index({ createdAt: -1 });

// Virtual for full URL
tenancySchema.virtual('portalUrl').get(function () {
  if (this.customDomain) {
    return `https://${this.customDomain}`;
  }
  if (this.subdomain) {
    return `https://${this.subdomain}.laundry-platform.com`;
  }
  return `https://${this.slug}.laundry-platform.com`;
});

// Pre-save: Generate slug from name if not provided
tenancySchema.pre('save', function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  if (!this.subdomain && this.slug) {
    this.subdomain = this.slug;
  }
  next();
});

// Method to check if subscription is active
tenancySchema.methods.isSubscriptionActive = function () {
  const sub = this.subscription;
  if (sub.status === 'active') return true;
  if (sub.status === 'trial' && sub.trialEndsAt && new Date() < sub.trialEndsAt) return true;
  return false;
};

// Method to check feature access (supports both boolean and truthy values)
tenancySchema.methods.hasFeature = function (featureKey) {
  const planFeatures = this.subscription?.features || {};
  const addOnFeatures = this.subscription?.addOnFeatures || {};

  const planValue = planFeatures[featureKey];
  const addOnValue = addOnFeatures[featureKey];

  // Combine values (logical OR for boolean, existence check for others)
  const value = planValue || addOnValue;

  // For boolean features
  if (typeof value === 'boolean') return value;

  // For number features (like limits), check if > 0 or -1 (unlimited)
  if (typeof value === 'number') return value !== 0;

  return false;
};

// Method to get feature value (for limits)
tenancySchema.methods.getFeatureValue = function (featureKey, defaultValue = 0) {
  const planFeatures = this.subscription?.features || {};
  const addOnFeatures = this.subscription?.addOnFeatures || {};

  const planValue = planFeatures[featureKey];
  const addOnValue = addOnFeatures[featureKey];

  // If both are numbers, add them (unless one is -1 meaning unlimited)
  if (typeof planValue === 'number' && typeof addOnValue === 'number') {
    if (planValue === -1 || addOnValue === -1) return -1;
    return planValue + addOnValue;
  }

  return planValue ?? addOnValue ?? defaultValue;
};
// Method to check if a limit is exceeded
tenancySchema.methods.isLimitExceeded = function (featureKey, currentCount) {
  const limit = this.getFeatureValue(featureKey, 0);
  if (limit === -1) return false; // Unlimited
  return currentCount >= limit;
};

// Method to check limits
tenancySchema.methods.canCreateOrder = function () {
  const maxOrders = this.getFeatureValue('max_orders') || this.getFeatureValue('maxOrders') || 0;
  if (maxOrders === -1) return true;
  return this.stats.totalOrders < maxOrders;
};

tenancySchema.methods.canAddStaff = function () {
  const maxStaff = this.getFeatureValue('max_staff') || this.getFeatureValue('maxStaff') || 0;
  if (maxStaff === -1) return true;
  return this.stats.totalStaff < maxStaff;
};

// Static method to find by domain
tenancySchema.statics.findByDomain = async function (domain) {
  // Check custom domain first
  let tenancy = await this.findOne({ customDomain: domain, status: 'active' });
  if (tenancy) return tenancy;

  // Check subdomain
  const subdomain = domain.split('.')[0];
  tenancy = await this.findOne({ subdomain: subdomain, status: 'active' });
  if (tenancy) return tenancy;

  // Check slug
  return this.findOne({ slug: subdomain, status: 'active' });
};

// Upgrade Management Methods
tenancySchema.methods.hasPendingUpgrade = function () {
  return this.pendingUpgrades && this.pendingUpgrades.length > 0;
};

tenancySchema.methods.addUpgradeRequest = function (upgradeRequestId) {
  if (!this.pendingUpgrades.includes(upgradeRequestId)) {
    this.pendingUpgrades.push(upgradeRequestId);
  }
  return this;
};

tenancySchema.methods.removeUpgradeRequest = function (upgradeRequestId) {
  this.pendingUpgrades = this.pendingUpgrades.filter(
    id => !id.equals(upgradeRequestId)
  );
  return this;
};

tenancySchema.methods.addUpgradeHistory = function (upgradeData) {
  this.upgradeHistory.push({
    fromPlan: upgradeData.fromPlan,
    toPlan: upgradeData.toPlan,
    upgradedAt: upgradeData.upgradedAt || new Date(),
    upgradedBy: upgradeData.upgradedBy,
    upgradedByModel: upgradeData.upgradedByModel,
    paymentAmount: upgradeData.paymentAmount,
    upgradeRequestId: upgradeData.upgradeRequestId,
    notes: upgradeData.notes || ''
  });
  return this;
};

tenancySchema.methods.upgradePlan = async function (newPlan, upgradeData) {
  // Update current plan
  const oldPlan = this.subscription.planId;
  this.subscription.planId = newPlan._id;
  this.subscription.plan = newPlan.name;
  this.subscription.features = newPlan.features;

  // Add to history
  this.addUpgradeHistory({
    fromPlan: oldPlan,
    toPlan: newPlan._id,
    upgradedBy: upgradeData.upgradedBy,
    upgradedByModel: upgradeData.upgradedByModel,
    paymentAmount: upgradeData.paymentAmount,
    upgradeRequestId: upgradeData.upgradeRequestId,
    notes: upgradeData.notes
  });

  // Remove from pending upgrades
  if (upgradeData.upgradeRequestId) {
    this.removeUpgradeRequest(upgradeData.upgradeRequestId);
  }

  return this;
};

module.exports = mongoose.model('Tenancy', tenancySchema);
