// Platform-level referral record for a marketplace customer. Each user has one
// unique share code; `referredByCode` records who invited them (if anyone).

const mongoose = require('mongoose');

const customerReferralSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    code: { type: String, required: true, unique: true, uppercase: true, index: true },
    referredByCode: { type: String, uppercase: true, index: true },
    rewardGranted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CustomerReferral', customerReferralSchema);
