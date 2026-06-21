// Platform-level wallet for marketplace (mobile) customers. One per user,
// not scoped to a tenancy — credits come from referrals/refunds and can be
// redeemed against any branch's order.

const mongoose = require('mongoose');

const customerWalletSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CustomerWallet', customerWalletSchema);
