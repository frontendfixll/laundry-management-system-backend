// Phone-OTP login for the customer mobile app.
//
// Flow:
//   POST /api/customer-app/auth/otp/send    { phone }
//     → generate 6-digit code, hash+store, SMS via smsService
//   POST /api/customer-app/auth/otp/verify  { phone, code, name? }
//     → verify hash, find-or-create platform-level User, return our JWT
//
// Rate limits (enforced in this controller, not via express-rate-limit, so
// they're per-phone rather than per-IP — IP rate-limit is fine to layer on
// top if abuse becomes a problem):
//   - Send: 1 OTP per phone per 60 seconds (cooldown)
//   - Send: max 5 OTPs per phone per hour
//   - Verify: max 5 attempts per OTP (then it's invalidated)

const crypto = require('crypto');
const User = require('../../models/User');
const OtpVerification = require('../../models/OtpVerification');
const { generateAccessToken } = require('../../utils/jwt');
const { sendOtpSms } = require('../../services/smsService');
const { applyReferralOnSignup } = require('./customerReferralController');

const SEND_COOLDOWN_MS = 60 * 1000;        // 60s between sends
const HOURLY_SEND_LIMIT = 5;               // max 5 sends per hour per phone

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

function isValidIndianMobile(phone) {
  return /^[6-9]\d{9}$/.test(phone);
}

function generateOtp(length = OtpVerification.OTP_LENGTH) {
  // crypto.randomInt is uniform — avoids the modulo bias of Math.random
  let code = '';
  for (let i = 0; i < length; i++) code += crypto.randomInt(0, 10).toString();
  return code;
}

function hashCode(code, phone) {
  // Salt the hash with phone so the same OTP for different phones produces
  // different hashes — defends against rainbow-table-style lookups if the
  // OTP collection is ever leaked.
  return crypto.createHash('sha256').update(`${phone}:${code}`).digest('hex');
}

// POST /api/customer-app/auth/otp/send
exports.sendOtp = async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    if (!phone || !isValidIndianMobile(phone)) {
      return res.status(400).json({
        success: false,
        error: 'Valid 10-digit Indian mobile number required'
      });
    }

    const now = Date.now();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);

    // Per-phone cooldown — find the most recent OTP for this phone
    const lastOtp = await OtpVerification.findOne({ phone }).sort({ createdAt: -1 }).lean();
    if (lastOtp && now - new Date(lastOtp.createdAt).getTime() < SEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((SEND_COOLDOWN_MS - (now - new Date(lastOtp.createdAt).getTime())) / 1000);
      return res.status(429).json({
        success: false,
        error: `Please wait ${waitSec}s before requesting another OTP`,
        retryAfterSec: waitSec
      });
    }

    // Per-phone hourly limit
    const recentCount = await OtpVerification.countDocuments({
      phone,
      createdAt: { $gte: oneHourAgo }
    });
    if (recentCount >= HOURLY_SEND_LIMIT) {
      return res.status(429).json({
        success: false,
        error: 'Too many OTP requests for this number — try again after an hour'
      });
    }

    const code = generateOtp();
    const codeHash = hashCode(code, phone);
    const expiresAt = new Date(now + OtpVerification.OTP_TTL_MINUTES * 60 * 1000);

    await OtpVerification.create({
      phone,
      codeHash,
      expiresAt,
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || ''
    });

    const smsResult = await sendOtpSms({ phone, code });

    if (!smsResult.success) {
      console.error('[otp] SMS send failed for', phone, ':', smsResult.error);
      return res.status(502).json({
        success: false,
        error: 'Failed to send OTP — please try again'
      });
    }

    return res.json({
      success: true,
      message: 'OTP sent',
      ttlMinutes: OtpVerification.OTP_TTL_MINUTES,
      // In dev mode we surface the code to make manual testing painless.
      // The smsService only returns provider:'console' in non-production.
      ...(smsResult.provider === 'console' ? { devCode: code } : {})
    });
  } catch (err) {
    console.error('[otp] sendOtp error:', err);
    return res.status(500).json({ success: false, error: 'Failed to send OTP' });
  }
};

// POST /api/customer-app/auth/otp/verify
exports.verifyOtp = async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || '').trim();
    const name = req.body?.name?.trim();
    const referralCode = req.body?.referralCode;

    if (!phone || !isValidIndianMobile(phone)) {
      return res.status(400).json({ success: false, error: 'Invalid phone number' });
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ success: false, error: 'Invalid OTP format' });
    }

    // Find the latest unconsumed, non-expired OTP for this phone
    const otp = await OtpVerification.findOne({
      phone,
      consumed: false,
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    if (!otp) {
      return res.status(400).json({
        success: false,
        error: 'OTP expired or not found — request a new one'
      });
    }

    if (otp.attempts >= OtpVerification.MAX_VERIFY_ATTEMPTS) {
      // Invalidate this OTP so the user has to request a new one
      otp.consumed = true;
      otp.consumedAt = new Date();
      await otp.save();
      return res.status(429).json({
        success: false,
        error: 'Too many failed attempts — request a new OTP'
      });
    }

    const expectedHash = hashCode(code, phone);
    if (expectedHash !== otp.codeHash) {
      otp.attempts += 1;
      await otp.save();
      return res.status(400).json({
        success: false,
        error: 'Incorrect OTP',
        attemptsRemaining: Math.max(0, OtpVerification.MAX_VERIFY_ATTEMPTS - otp.attempts)
      });
    }

    // Success — burn the OTP
    otp.consumed = true;
    otp.consumedAt = new Date();
    await otp.save();

    // Find-or-create platform-level customer (tenancy left undefined).
    // If a tenant-scoped customer with the same phone already exists, prefer
    // it (sorted by tenancy:1 puts the null/undefined tenancy first when present).
    let user = await User.findOne({ phone, role: 'customer' })
      .sort({ tenancy: 1 })
      .select('+password');

    let isNewUser = false;
    if (!user) {
      const safeEmail = `${phone}@customer.laundrylobby.app`;
      const randomPassword = crypto.randomBytes(24).toString('hex');
      user = await User.create({
        phone,
        email: safeEmail,
        name: name || `Customer ${phone.slice(-4)}`,
        password: randomPassword,
        role: 'customer',
        phoneVerified: true,
        tenancy: undefined
      });
      isNewUser = true;
    } else if (!user.phoneVerified || (name && (!user.name || user.name.startsWith('Customer ')))) {
      const updates = { phoneVerified: true };
      if (name && (!user.name || user.name.startsWith('Customer '))) updates.name = name;
      await User.updateOne({ _id: user._id }, { $set: updates });
      Object.assign(user, updates);
    }

    // Apply a referral code for brand-new users (best-effort, credits wallets).
    if (isNewUser && referralCode) {
      try {
        await applyReferralOnSignup(user._id, referralCode);
      } catch (e) {
        console.error('[otp] applyReferralOnSignup failed:', e?.message);
      }
    }

    const token = generateAccessToken(
      user._id.toString(),
      user.email,
      'customer',
      null,
      user.tenancy ? user.tenancy.toString() : null
    );

    return res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        tenancy: user.tenancy || null,
        phoneVerified: user.phoneVerified
      }
    });
  } catch (err) {
    console.error('[otp] verifyOtp error:', err);
    return res.status(500).json({ success: false, error: 'Failed to verify OTP' });
  }
};
