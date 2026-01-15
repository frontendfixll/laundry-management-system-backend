const mongoose = require('mongoose');
const crypto = require('crypto');

const PAYMENT_LINK_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
};

const paymentLinkSchema = new mongoose.Schema({
  // Unique token for the payment link URL
  token: {
    type: String,
    unique: true,
    required: true,
    default: () => crypto.randomBytes(32).toString('hex')
  },
  
  // Associated lead
  lead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    required: true
  },
  
  // Plan details
  plan: {
    type: String,
    enum: ['basic', 'pro', 'enterprise'],
    required: true
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly'],
    default: 'monthly'
  },
  
  // Amount
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
  
  // Validity
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  },
  
  // Status
  status: {
    type: String,
    enum: Object.values(PAYMENT_LINK_STATUS),
    default: PAYMENT_LINK_STATUS.PENDING
  },
  
  // Payment details (filled when paid)
  paidAt: Date,
  paymentMethod: {
    type: String,
    enum: ['card', 'upi', 'netbanking', 'wallet', 'manual', 'cash', 'bank_transfer', 'cheque']
  },
  transactionId: String,
  gatewayResponse: mongoose.Schema.Types.Mixed,
  stripeSessionId: String,
  
  // Created by superadmin
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin',
    required: true
  },
  
  // Notes
  notes: String,
  
  // Custom pricing flag
  isCustomPricing: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
paymentLinkSchema.index({ token: 1 });
paymentLinkSchema.index({ lead: 1 });
paymentLinkSchema.index({ status: 1 });
paymentLinkSchema.index({ expiresAt: 1 });

// Virtual for checking if expired
paymentLinkSchema.virtual('isExpired').get(function() {
  return this.status === PAYMENT_LINK_STATUS.PENDING && new Date() > this.expiresAt;
});

// Method to mark as paid
paymentLinkSchema.methods.markAsPaid = async function(paymentDetails) {
  this.status = PAYMENT_LINK_STATUS.PAID;
  this.paidAt = new Date();
  this.paymentMethod = paymentDetails.method;
  this.transactionId = paymentDetails.transactionId;
  this.gatewayResponse = paymentDetails.gatewayResponse;
  return this.save();
};

// Static method to find by token
paymentLinkSchema.statics.findByToken = function(token) {
  return this.findOne({ token }).populate('lead');
};

module.exports = mongoose.model('PaymentLink', paymentLinkSchema);
module.exports.PAYMENT_LINK_STATUS = PAYMENT_LINK_STATUS;
