const mongoose = require('mongoose');

const subscriptionPromoSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  description: { type: String, trim: true, default: '' },
  grantsPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BillingPlan',
    required: true,
  },
  trialDays: { type: Number, required: true, min: 1, max: 365 },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
  maxRedemptions: { type: Number, default: null, min: 1 },
  usedCount: { type: Number, default: 0, min: 0 },
  expiresAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesUser' },
  createdByModel: { type: String, enum: ['SalesUser', 'SuperAdmin'], default: 'SalesUser' },
}, { timestamps: true });

subscriptionPromoSchema.methods.isRedeemable = function () {
  if (!this.isActive) return { ok: false, reason: 'Promo is inactive' };
  if (this.expiresAt && this.expiresAt < new Date()) return { ok: false, reason: 'Promo has expired' };
  if (this.maxRedemptions != null && this.usedCount >= this.maxRedemptions) {
    return { ok: false, reason: 'Promo redemption limit reached' };
  }
  return { ok: true };
};

module.exports = mongoose.model('SubscriptionPromo', subscriptionPromoSchema);
