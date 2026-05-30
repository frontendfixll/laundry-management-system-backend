// OTP verification records for the customer-app phone-OTP login flow.
// - codeHash stored, never the raw OTP (SHA-256 hex digest of OTP + phone salt)
// - expiresAt drives a TTL index so MongoDB auto-deletes stale docs
// - attempts counter bounds brute-force guessing per OTP
// - For per-phone rate limiting (cooldown / hourly cap), the controller queries
//   recent docs by phone+createdAt rather than mutating a single doc

const mongoose = require('mongoose');

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;
const MAX_VERIFY_ATTEMPTS = 5;

const otpVerificationSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    index: true,
    match: [/^[6-9]\d{9}$/, 'phone must be a 10-digit Indian mobile number']
  },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  consumed: { type: Boolean, default: false },
  consumedAt: { type: Date },
  ipAddress: { type: String },
  userAgent: { type: String }
}, {
  timestamps: true
});

// TTL: delete documents at expiresAt (cleans up old OTPs without a cron job)
otpVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Useful for both cooldown checks and rate limiting
otpVerificationSchema.index({ phone: 1, createdAt: -1 });

otpVerificationSchema.statics.OTP_LENGTH = OTP_LENGTH;
otpVerificationSchema.statics.OTP_TTL_MINUTES = OTP_TTL_MINUTES;
otpVerificationSchema.statics.MAX_VERIFY_ATTEMPTS = MAX_VERIFY_ATTEMPTS;

module.exports = mongoose.model('OtpVerification', otpVerificationSchema);
