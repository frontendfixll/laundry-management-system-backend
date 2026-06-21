// Referral program for marketplace customers (platform-level). Rewards land in
// the customer wallet, so this composes with customerWalletController.

const CustomerReferral = require('../../models/CustomerReferral');
const { creditWallet } = require('./customerWalletController');

const SIGNUP_BONUS = 50; // credited to the new (referred) user
const REFERRER_REWARD = 50; // credited to the inviter

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `LL${s}`;
}

async function getOrCreateReferral(userId) {
  let rec = await CustomerReferral.findOne({ user: userId });
  if (rec) return rec;
  // Generate a unique code (retry on the rare collision).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    const exists = await CustomerReferral.findOne({ code });
    if (!exists) {
      rec = await CustomerReferral.create({ user: userId, code });
      return rec;
    }
  }
  throw new Error('Could not generate referral code');
}

// Called from the OTP verify flow for brand-new users that passed a code.
async function applyReferralOnSignup(userId, referredByCode) {
  if (!referredByCode || typeof referredByCode !== 'string') return null;
  const code = referredByCode.trim().toUpperCase();
  if (!code) return null;

  const inviter = await CustomerReferral.findOne({ code });
  if (!inviter || String(inviter.user) === String(userId)) return null; // invalid / self-referral

  const rec = await getOrCreateReferral(userId);
  if (rec.referredByCode || rec.rewardGranted) return null; // already referred once
  rec.referredByCode = code;
  rec.rewardGranted = true;
  await rec.save();

  await creditWallet(userId, SIGNUP_BONUS, 'signup_bonus', { description: `Welcome bonus (referred by ${code})` });
  await creditWallet(inviter.user, REFERRER_REWARD, 'referral', { description: 'Friend joined with your code' });
  return { signupBonus: SIGNUP_BONUS };
}

// GET /api/customer-app/referral
exports.getReferral = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const rec = await getOrCreateReferral(userId);
    const referredCount = await CustomerReferral.countDocuments({ referredByCode: rec.code });

    return res.json({
      success: true,
      referral: {
        code: rec.code,
        referredCount,
        rewardPerReferral: REFERRER_REWARD,
        signupBonus: SIGNUP_BONUS,
        shareMessage: `Get ₹${SIGNUP_BONUS} off your first LaundryLobby order! Use my code ${rec.code} when you sign up.`,
      },
    });
  } catch (err) {
    console.error('[marketplace] getReferral error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load referral' });
  }
};

exports.applyReferralOnSignup = applyReferralOnSignup;
exports.getOrCreateReferral = getOrCreateReferral;
