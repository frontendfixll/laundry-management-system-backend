// Customer-app authentication — for the mobile marketplace app.
// Flow:
//   1. Client app uses Firebase Phone Auth → user enters OTP → Firebase returns ID token
//   2. Client POSTs the ID token to /api/customer-app/auth/firebase
//   3. We verify with Firebase Admin, find-or-create a platform-level User
//      (role: 'customer', tenancy: null) and issue our own JWT
//
// Existing tenant-scoped customers (with tenancy set) are linked by phone match
// so a customer who originally signed up inside a tenant can use the marketplace
// app with the same identity.

const User = require('../../models/User');
const { verifyIdToken } = require('../../services/firebaseAdminService');
const { generateAccessToken } = require('../../utils/jwt');

function normalizePhone(raw) {
  if (!raw) return null;
  // Strip everything except digits
  const digits = String(raw).replace(/\D/g, '');
  // Strip leading 91 country code if it's a 12-digit Indian number
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits.length === 10 ? digits : digits;
}

// POST /api/customer-app/auth/firebase
// Body: { idToken: string, name?: string, email?: string }
//   - idToken: Firebase ID token (post-OTP)
//   - name, email: optional, only used on first signup
exports.firebaseLogin = async (req, res) => {
  try {
    const { idToken, name, email } = req.body || {};
    if (!idToken) {
      return res.status(400).json({ success: false, error: 'idToken required' });
    }

    let decoded;
    try {
      decoded = await verifyIdToken(idToken);
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Invalid Firebase token', detail: err.message });
    }

    const phone = normalizePhone(decoded.phone_number);
    if (!phone || phone.length !== 10) {
      return res.status(400).json({
        success: false,
        error: 'Firebase token has no Indian 10-digit phone number'
      });
    }

    // Find existing user by phone (could be tenant-scoped customer or platform customer)
    // Prefer platform-level (no tenancy) customer if duplicates exist
    let user = await User.findOne({ phone, role: 'customer' })
      .sort({ tenancy: 1 }) // null tenancy sorts first
      .select('+password');

    if (!user) {
      // Brand-new platform customer — create with no tenancy
      const safeEmail = email && /^\S+@\S+\.\S+$/.test(email)
        ? email.toLowerCase()
        : `${phone}@customer.laundrylobby.app`; // synthetic email; we don't use it for login

      // Random password — user authenticates via Firebase, never via password on this flow
      const crypto = require('crypto');
      const randomPassword = crypto.randomBytes(24).toString('hex');

      user = await User.create({
        phone,
        email: safeEmail,
        name: name?.trim() || `Customer ${phone.slice(-4)}`,
        password: randomPassword,
        role: 'customer',
        phoneVerified: true,
        tenancy: undefined // platform-level customer, not tied to any tenant
      });
    } else {
      // Existing user — mark phone verified, update name on first login if missing
      const updates = {};
      if (!user.phoneVerified) updates.phoneVerified = true;
      if ((!user.name || user.name.startsWith('Customer ')) && name) updates.name = name.trim();
      if (Object.keys(updates).length) {
        await User.updateOne({ _id: user._id }, { $set: updates });
        Object.assign(user, updates);
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
    console.error('[customer-app auth] firebaseLogin error:', err);
    return res.status(500).json({ success: false, error: 'Authentication failed' });
  }
};

// GET /api/customer-app/auth/me
// Requires the standard `protect` middleware mounted at the route level.
exports.me = async (req, res) => {
  try {
    const user = await User.findById(req.user._id || req.user.userId)
      .select('name phone email role tenancy addresses preferences loyaltyPoints rewardPoints wallet phoneVerified createdAt')
      .lean();
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    return res.json({ success: true, user });
  } catch (err) {
    console.error('[customer-app auth] me error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
};
