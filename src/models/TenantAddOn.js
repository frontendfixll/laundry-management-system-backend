const mongoose = require('mongoose');
const Tenancy = require('./Tenancy');

// Usage tracking schema for usage-based add-ons
const usageTrackingSchema = new mongoose.Schema({
  // Current usage stats
  totalUsed: { type: Number, default: 0 },
  remainingCredits: { type: Number, default: 0 },

  // Usage history (last 30 days)
  dailyUsage: [{
    date: { type: Date },
    used: { type: Number, default: 0 },
    remaining: { type: Number, default: 0 }
  }],

  // Alerts and notifications
  lowBalanceAlerted: { type: Boolean, default: false },
  lastAlertSent: { type: Date },

  // Auto-renewal settings
  autoRenew: { type: Boolean, default: false },
  renewalThreshold: { type: Number, default: 10 }, // Renew when credits < this

  // Reset tracking (for monthly/yearly quotas)
  lastReset: { type: Date },
  nextReset: { type: Date },
  resetFrequency: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'] }
}, { _id: false });

// Billing history schema
const billingHistorySchema = new mongoose.Schema({
  // Transaction details
  transactionId: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },

  // Billing period
  billingPeriod: {
    start: { type: Date, required: true },
    end: { type: Date, required: true }
  },

  // Payment details
  paymentMethod: { type: String },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },

  // Stripe/Payment gateway details
  stripePaymentIntentId: { type: String },
  stripeSubscriptionId: { type: String },
  gatewayResponse: { type: mongoose.Schema.Types.Mixed },

  // Proration details
  prorationAmount: { type: Number, default: 0 },
  prorationReason: { type: String },

  // Refund details
  refundAmount: { type: Number, default: 0 },
  refundReason: { type: String },
  refundedAt: { type: Date },

  // Metadata
  notes: { type: String },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'processedByModel'
  },
  processedByModel: {
    type: String,
    enum: ['SuperAdmin', 'SalesUser', 'System']
  }
}, { timestamps: true, _id: true });

// Configuration override schema (for custom pricing/features per tenant)
const configOverrideSchema = new mongoose.Schema({
  // Custom pricing (overrides add-on default pricing)
  customPricing: {
    monthly: { type: Number },
    yearly: { type: Number },
    oneTime: { type: Number },
    currency: { type: String, default: 'INR' }
  },

  // Custom configuration (overrides add-on default config)
  customConfig: {
    type: mongoose.Schema.Types.Mixed
  },

  // Custom limits (for capacity add-ons)
  customLimits: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },

  // Discount applied
  discount: {
    type: { type: String, enum: ['percentage', 'fixed'] },
    value: { type: Number },
    reason: { type: String },
    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'discount.appliedByModel'
    },
    appliedByModel: {
      type: String,
      enum: ['SuperAdmin', 'SalesUser']
    },
    validUntil: { type: Date }
  }
}, { _id: false });

const tenantAddOnSchema = new mongoose.Schema({
  // References
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: [true, 'Tenant is required'],
    index: true
  },

  addOn: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AddOn',
    required: [true, 'Add-on is required'],
    index: true
  },

  // Subscription Details
  status: {
    type: String,
    enum: ['active', 'trial', 'suspended', 'cancelled', 'expired', 'pending_payment'],
    default: 'active',
    index: true
  },

  // Lifecycle dates
  activatedAt: { type: Date, default: Date.now },
  trialEndsAt: { type: Date },
  expiresAt: { type: Date },
  cancelledAt: { type: Date },
  suspendedAt: { type: Date },

  // Billing configuration
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly', 'one-time', 'usage-based'],
    required: true
  },

  // Next billing date
  nextBillingDate: { type: Date },

  // Quantity (for add-ons that can be purchased multiple times)
  quantity: { type: Number, default: 1, min: 1 },

  // Pricing snapshot (at time of purchase)
  pricingSnapshot: {
    monthly: { type: Number },
    yearly: { type: Number },
    oneTime: { type: Number },
    currency: { type: String, default: 'INR' },
    variant: { type: String }, // Which pricing variant was used
    region: { type: String } // Which region pricing was used
  },

  // Configuration overrides
  configOverride: {
    type: configOverrideSchema,
    default: () => ({})
  },

  // Usage tracking (for usage-based add-ons)
  usageTracking: {
    type: usageTrackingSchema,
    default: () => ({})
  },

  // Billing history
  billingHistory: [billingHistorySchema],

  // Assignment details
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'assignedByModel',
    required: true
  },

  assignedByModel: {
    type: String,
    enum: ['SuperAdmin', 'SalesUser', 'TenantAdmin', 'System'],
    required: true
  },

  // Assignment method
  assignmentMethod: {
    type: String,
    enum: ['purchase', 'admin_assign', 'sales_assign', 'trial', 'promotion'],
    default: 'purchase'
  },

  // Trial information
  trialInfo: {
    isTrialUsed: { type: Boolean, default: false },
    trialStartedAt: { type: Date },
    trialDays: { type: Number, default: 0 }
  },

  // Cancellation details
  cancellationInfo: {
    reason: { type: String },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'cancellationInfo.cancelledByModel'
    },
    cancelledByModel: {
      type: String,
      enum: ['SuperAdmin', 'SalesUser', 'TenantAdmin', 'System']
    },
    effectiveDate: { type: Date }, // When cancellation takes effect
    refundAmount: { type: Number, default: 0 },
    refundProcessed: { type: Boolean, default: false }
  },

  // Auto-renewal settings
  autoRenewal: {
    enabled: { type: Boolean, default: true },
    failedAttempts: { type: Number, default: 0 },
    lastFailedAt: { type: Date },
    nextRetryAt: { type: Date }
  },

  // Analytics and tracking
  analytics: {
    totalSpent: { type: Number, default: 0 },
    totalUsage: { type: Number, default: 0 },
    lastUsed: { type: Date },
    activationSource: { type: String }, // 'marketplace', 'sales', 'admin', etc.

    // Feature usage tracking
    featureUsage: {
      type: Map,
      of: {
        count: { type: Number, default: 0 },
        lastUsed: { type: Date }
      }
    }
  },

  // Metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  },

  // Notes and comments
  notes: [{
    content: { type: String, required: true },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'notes.addedByModel'
    },
    addedByModel: {
      type: String,
      enum: ['SuperAdmin', 'SalesUser', 'TenantAdmin']
    },
    addedAt: { type: Date, default: Date.now },
    isInternal: { type: Boolean, default: false } // Internal notes not visible to tenant
  }],

  // Soft delete
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'deletedByModel'
  },
  deletedByModel: {
    type: String,
    enum: ['SuperAdmin', 'SalesUser', 'System']
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for performance
tenantAddOnSchema.index({ tenant: 1, status: 1 });
tenantAddOnSchema.index({ tenant: 1, addOn: 1 }, { unique: true }); // One instance per tenant per add-on
tenantAddOnSchema.index({ status: 1, nextBillingDate: 1 });
tenantAddOnSchema.index({ status: 1, expiresAt: 1 });
tenantAddOnSchema.index({ assignedBy: 1, assignedByModel: 1 });
tenantAddOnSchema.index({ createdAt: -1 });

// Virtual for days remaining
tenantAddOnSchema.virtual('daysRemaining').get(function () {
  if (!this.expiresAt) return null;
  const now = new Date();
  const diffTime = this.expiresAt - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for trial status
tenantAddOnSchema.virtual('isInTrial').get(function () {
  return this.status === 'trial' && this.trialEndsAt && new Date() < this.trialEndsAt;
});

// Virtual for effective pricing
tenantAddOnSchema.virtual('effectivePricing').get(function () {
  // Use custom pricing if available, otherwise use snapshot
  if (this.configOverride?.customPricing) {
    return this.configOverride.customPricing;
  }
  return this.pricingSnapshot;
});

// Pre-save middleware
tenantAddOnSchema.pre('save', function (next) {
  // Set expiration date for one-time add-ons
  if (this.billingCycle === 'one-time' && !this.expiresAt) {
    // One-time add-ons don't expire by default
    this.expiresAt = null;
  }

  // Set next billing date for recurring add-ons
  if (['monthly', 'yearly'].includes(this.billingCycle) && !this.nextBillingDate) {
    const now = new Date();
    if (this.billingCycle === 'monthly') {
      this.nextBillingDate = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
    } else if (this.billingCycle === 'yearly') {
      this.nextBillingDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    }
  }

  // Initialize usage tracking for usage-based add-ons
  if (this.billingCycle === 'usage-based' && !this.usageTracking.lastReset) {
    this.usageTracking.lastReset = new Date();
  }

  next();
});

// Instance methods
tenantAddOnSchema.methods.isActive = function () {
  if (this.status !== 'active' && this.status !== 'trial') return false;
  if (this.expiresAt && new Date() > this.expiresAt) return false;
  if (this.status === 'trial' && this.trialEndsAt && new Date() > this.trialEndsAt) return false;
  return true;
};

tenantAddOnSchema.methods.canUse = function (amount = 1) {
  if (!this.isActive()) return false;

  // For usage-based add-ons, check remaining credits
  if (this.billingCycle === 'usage-based') {
    return this.usageTracking.remainingCredits >= amount;
  }

  return true;
};

tenantAddOnSchema.methods.consumeUsage = async function (amount = 1, metadata = {}) {
  if (this.billingCycle !== 'usage-based') {
    throw new Error('Cannot consume usage on non-usage-based add-on');
  }

  if (!this.canUse(amount)) {
    throw new Error('Insufficient credits');
  }

  // Update usage tracking
  this.usageTracking.totalUsed += amount;
  this.usageTracking.remainingCredits -= amount;

  // Update daily usage
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let dailyEntry = this.usageTracking.dailyUsage.find(entry =>
    entry.date.getTime() === today.getTime()
  );

  if (!dailyEntry) {
    dailyEntry = {
      date: today,
      used: 0,
      remaining: this.usageTracking.remainingCredits
    };
    this.usageTracking.dailyUsage.push(dailyEntry);
  }

  dailyEntry.used += amount;
  dailyEntry.remaining = this.usageTracking.remainingCredits;

  // Keep only last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  this.usageTracking.dailyUsage = this.usageTracking.dailyUsage.filter(
    entry => entry.date >= thirtyDaysAgo
  );

  // Update analytics
  this.analytics.totalUsage += amount;
  this.analytics.lastUsed = new Date();

  // Check for low balance alert
  const threshold = this.usageTracking.renewalThreshold || 10;
  if (this.usageTracking.remainingCredits <= threshold && !this.usageTracking.lowBalanceAlerted) {
    this.usageTracking.lowBalanceAlerted = true;
    this.usageTracking.lastAlertSent = new Date();

    // Emit event for notification
    this.constructor.emit('lowBalance', {
      tenantAddOn: this,
      remainingCredits: this.usageTracking.remainingCredits,
      threshold
    });
  }

  return this.save();
};

tenantAddOnSchema.methods.addCredits = async function (amount, reason = 'manual_add') {
  if (this.billingCycle !== 'usage-based') {
    throw new Error('Cannot add credits to non-usage-based add-on');
  }

  this.usageTracking.remainingCredits += amount;
  this.usageTracking.lowBalanceAlerted = false; // Reset alert flag

  // Add billing history entry
  this.billingHistory.push({
    transactionId: `credit_${Date.now()}`,
    amount: 0, // Credits added, not charged
    billingPeriod: {
      start: new Date(),
      end: new Date()
    },
    paymentStatus: 'completed',
    notes: `Added ${amount} credits - ${reason}`,
    processedByModel: 'System'
  });

  return this.save();
};

tenantAddOnSchema.methods.suspend = async function (reason, suspendedBy, suspendedByModel) {
  this.status = 'suspended';
  this.suspendedAt = new Date();

  this.notes.push({
    content: `Add-on suspended: ${reason}`,
    addedBy: suspendedBy,
    addedByModel: suspendedByModel,
    isInternal: true
  });

  return this.save();
};

tenantAddOnSchema.methods.reactivate = async function (reactivatedBy, reactivatedByModel) {
  this.status = 'active';
  this.suspendedAt = null;

  this.notes.push({
    content: 'Add-on reactivated',
    addedBy: reactivatedBy,
    addedByModel: reactivatedByModel,
    isInternal: true
  });

  return this.save();
};

tenantAddOnSchema.methods.cancel = async function (reason, cancelledBy, cancelledByModel, effectiveDate = null) {
  this.status = 'cancelled';
  this.cancelledAt = new Date();

  this.cancellationInfo = {
    reason,
    cancelledBy,
    cancelledByModel,
    effectiveDate: effectiveDate || new Date()
  };

  this.notes.push({
    content: `Add-on cancelled: ${reason}`,
    addedBy: cancelledBy,
    addedByModel: cancelledByModel,
    isInternal: false
  });

  return this.save();
};

tenantAddOnSchema.methods.addBillingRecord = function (billingData) {
  this.billingHistory.push(billingData);
  this.analytics.totalSpent += billingData.amount || 0;

  if (billingData.paymentStatus === 'completed') {
    // Update next billing date for recurring add-ons
    if (this.billingCycle === 'monthly') {
      const nextDate = new Date(this.nextBillingDate);
      nextDate.setMonth(nextDate.getMonth() + 1);
      this.nextBillingDate = nextDate;
    } else if (this.billingCycle === 'yearly') {
      const nextDate = new Date(this.nextBillingDate);
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      this.nextBillingDate = nextDate;
    }
  }

  return this;
};

// Static methods
tenantAddOnSchema.statics.findActiveByTenant = function (tenantId) {
  return this.find({
    tenant: tenantId,
    status: { $in: ['active', 'trial'] },
    isDeleted: false
  }).populate('addOn');
};

tenantAddOnSchema.statics.findByTenantAndAddOn = function (tenantId, addOnId) {
  return this.findOne({
    tenant: tenantId,
    addOn: addOnId,
    isDeleted: false
  }).populate('addOn');
};

tenantAddOnSchema.statics.findDueForBilling = function (date = new Date()) {
  return this.find({
    status: 'active',
    billingCycle: { $in: ['monthly', 'yearly'] },
    nextBillingDate: { $lte: date },
    isDeleted: false
  }).populate(['tenant', 'addOn']);
};

tenantAddOnSchema.statics.findExpiring = function (days = 7) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  return this.find({
    status: { $in: ['active', 'trial'] },
    expiresAt: { $lte: futureDate, $gte: new Date() },
    isDeleted: false
  }).populate(['tenant', 'addOn']);
};

tenantAddOnSchema.statics.getUsageStats = async function (tenantId, addOnId = null) {
  const match = { tenant: tenantId };
  if (addOnId) match.addOn = addOnId;

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$addOn',
        totalSpent: { $sum: '$analytics.totalSpent' },
        totalUsage: { $sum: '$analytics.totalUsage' },
        activeCount: {
          $sum: {
            $cond: [{ $in: ['$status', ['active', 'trial']] }, 1, 0]
          }
        }
      }
    },
    {
      $lookup: {
        from: 'addons',
        localField: '_id',
        foreignField: '_id',
        as: 'addOn'
      }
    },
    { $unwind: '$addOn' }
  ]);
};

// Post-save middleware to update Tenancy addOnFeatures
tenantAddOnSchema.post('save', async function (doc) {
  try {
    const tenantId = doc.tenant;

    // Find all active add-ons for this tenant
    const activeTenantAddOns = await doc.constructor.find({
      tenant: tenantId,
      status: { $in: ['active', 'trial'] },
      isDeleted: false
    }).populate('addOn');

    const aggregateFeatures = {};

    activeTenantAddOns.forEach(tao => {
      const features = tao.addOn?.config?.features || [];
      features.forEach(feature => {
        if (typeof feature === 'string') {
          aggregateFeatures[feature] = true;
        } else if (feature.key) {
          // Handle numeric features/limits
          if (typeof feature.value === 'number') {
            if (aggregateFeatures[feature.key] === -1 || feature.value === -1) {
              aggregateFeatures[feature.key] = -1;
            } else {
              aggregateFeatures[feature.key] = (aggregateFeatures[feature.key] || 0) + feature.value;
            }
          } else {
            aggregateFeatures[feature.key] = feature.value ?? true;
          }
        }
      });
    });

    // Update Tenancy
    await Tenancy.findByIdAndUpdate(tenantId, {
      'subscription.addOnFeatures': aggregateFeatures
    });

    console.log(`✅ Updated add-on features for tenancy ${tenantId}`);
  } catch (error) {
    console.error('❌ Failed to update tenancy add-on features:', error);
  }
});

module.exports = mongoose.model('TenantAddOn', tenantAddOnSchema);