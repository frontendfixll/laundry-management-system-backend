const mongoose = require('mongoose');

const LEAD_STATUS = {
  NEW: 'new',
  CONTACTED: 'contacted',
  CONVERTED: 'converted',
  CLOSED: 'closed'
};

const BUSINESS_TYPES = {
  SMALL_LAUNDRY: 'small_laundry',
  CHAIN: 'chain',
  DRY_CLEANER: 'dry_cleaner',
  OTHER: 'other'
};

const INTERESTED_PLANS = {
  FREE: 'free',
  BASIC: 'basic',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
  UNDECIDED: 'undecided'
};

const leadSchema = new mongoose.Schema({
  // Contact Info
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  
  // Business Info
  businessName: {
    type: String,
    required: [true, 'Business name is required'],
    trim: true
  },
  businessType: {
    type: String,
    enum: Object.values(BUSINESS_TYPES),
    required: [true, 'Business type is required']
  },
  
  // Address
  address: {
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    country: { type: String, trim: true, default: 'India' }
  },
  
  // Plan Interest
  interestedPlan: {
    type: String,
    enum: Object.values(INTERESTED_PLANS),
    default: INTERESTED_PLANS.UNDECIDED
  },
  
  // Business Scale
  expectedMonthlyOrders: {
    type: String,
    enum: ['0-100', '100-500', '500-1000', '1000-5000', '5000+'],
    default: '0-100'
  },
  currentBranches: {
    type: Number,
    default: 1
  },
  
  // Additional
  message: {
    type: String,
    trim: true
  },
  source: {
    type: String,
    enum: ['website', 'pricing_page', 'referral', 'other'],
    default: 'website'
  },
  
  // Lead Management
  status: {
    type: String,
    enum: Object.values(LEAD_STATUS),
    default: LEAD_STATUS.NEW
  },
  notes: {
    type: String,
    trim: true
  },
  convertedToTenancy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy'
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
leadSchema.index({ status: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ email: 1 });
leadSchema.index({ interestedPlan: 1 });

module.exports = mongoose.model('Lead', leadSchema);
module.exports.LEAD_STATUS = LEAD_STATUS;
module.exports.BUSINESS_TYPES = BUSINESS_TYPES;
module.exports.INTERESTED_PLANS = INTERESTED_PLANS;
