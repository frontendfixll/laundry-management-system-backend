const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * PendingSignup Model
 * Stores signup data temporarily until payment is completed
 * After successful Stripe payment, this is converted to Tenancy + User
 */
const pendingSignupSchema = new mongoose.Schema({
  // Unique token for verification
  token: {
    type: String,
    unique: true,
    required: true,
    default: () => crypto.randomBytes(32).toString('hex')
  },
  
  // Business Information
  businessName: {
    type: String,
    required: [true, 'Business name is required'],
    trim: true,
    maxlength: [100, 'Business name cannot exceed 100 characters']
  },
  
  // Owner Information
  ownerName: {
    type: String,
    required: [true, 'Owner name is required'],
    trim: true,
    maxlength: [100, 'Owner name cannot exceed 100 characters']
  },
  
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },
  
  phone: {
    type: String,
    required: [true, 'Phone is required'],
    trim: true
  },
  
  // Hashed password (user sets before payment)
  passwordHash: {
    type: String,
    required: true
  },
  
  // Business Address
  address: {
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    country: { type: String, default: 'India' }
  },
  
  // Selected Plan
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BillingPlan',
    required: true
  },
  planName: {
    type: String,
    required: true
  },
  
  // Billing
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
  
  currency: {
    type: String,
    default: 'INR'
  },
  
  // Stripe
  stripeSessionId: {
    type: String,
    sparse: true
  },
  stripePaymentIntentId: {
    type: String,
    sparse: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'payment_processing', 'completed', 'failed', 'expired'],
    default: 'pending'
  },
  
  // Result references (filled after completion)
  tenancy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy'
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Timestamps
  completedAt: { type: Date },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
  },
  
  // Error tracking
  errorMessage: { type: String },
  
  // IP and metadata for fraud prevention
  ipAddress: { type: String },
  userAgent: { type: String }
}, {
  timestamps: true
});

// Indexes
pendingSignupSchema.index({ token: 1 }, { unique: true });
pendingSignupSchema.index({ email: 1 });
pendingSignupSchema.index({ stripeSessionId: 1 }, { sparse: true });
pendingSignupSchema.index({ status: 1, expiresAt: 1 });
pendingSignupSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 }); // Auto-delete after 7 days

// Virtual for checking if expired
pendingSignupSchema.virtual('isExpired').get(function() {
  return this.status === 'pending' && new Date() > this.expiresAt;
});

// Method to mark as completed
pendingSignupSchema.methods.markCompleted = async function(tenancyId, userId) {
  this.status = 'completed';
  this.completedAt = new Date();
  this.tenancy = tenancyId;
  this.user = userId;
  return this.save();
};

// Method to mark as failed
pendingSignupSchema.methods.markFailed = async function(errorMessage) {
  this.status = 'failed';
  this.errorMessage = errorMessage;
  return this.save();
};

// Static method to find by token
pendingSignupSchema.statics.findByToken = function(token) {
  return this.findOne({ token }).populate('plan');
};

// Static method to find by Stripe session
pendingSignupSchema.statics.findByStripeSession = function(sessionId) {
  return this.findOne({ stripeSessionId: sessionId }).populate('plan');
};

// Static method to cleanup expired signups
pendingSignupSchema.statics.cleanupExpired = async function() {
  const result = await this.updateMany(
    { status: 'pending', expiresAt: { $lt: new Date() } },
    { $set: { status: 'expired' } }
  );
  return result.modifiedCount;
};

module.exports = mongoose.model('PendingSignup', pendingSignupSchema);
