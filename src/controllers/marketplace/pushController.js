// Customer-app push token registration.
// Tokens are obtained client-side via expo-notifications and stored on
// User.pushTokens[]. We dedupe by token string so re-registering the same
// device just refreshes lastUsedAt — important because Expo tokens are
// stable across app launches.

const { Expo } = require('expo-server-sdk');
const User = require('../../models/User');

const VALID_PLATFORMS = ['ios', 'android', 'web'];

// POST /api/customer-app/push/register
// Body: { token, platform }
exports.registerToken = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const token = req.body?.token;
    const platform = req.body?.platform;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'token required' });
    }
    if (!Expo.isExpoPushToken(token)) {
      return res.status(400).json({ success: false, error: 'Not a valid Expo push token' });
    }
    if (platform && !VALID_PLATFORMS.includes(platform)) {
      return res.status(400).json({
        success: false,
        error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}`
      });
    }

    // Idempotent: upsert the token. If it already exists for this user, just
    // bump lastUsedAt; else push a new entry.
    const existing = await User.findOne({ _id: userId, 'pushTokens.token': token }).select('_id').lean();

    if (existing) {
      await User.updateOne(
        { _id: userId, 'pushTokens.token': token },
        { $set: { 'pushTokens.$.lastUsedAt': new Date(), 'pushTokens.$.platform': platform || undefined } }
      );
    } else {
      // Defensive: same token might be tied to a previous account — strip it
      // from any other user so push delivery routes correctly.
      await User.updateMany(
        { _id: { $ne: userId }, 'pushTokens.token': token },
        { $pull: { pushTokens: { token } } }
      );

      await User.updateOne(
        { _id: userId },
        {
          $push: {
            pushTokens: {
              token,
              platform: platform || undefined,
              registeredAt: new Date(),
              lastUsedAt: new Date()
            }
          }
        }
      );
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[push] registerToken error:', err);
    return res.status(500).json({ success: false, error: 'Failed to register token' });
  }
};

// POST /api/customer-app/push/unregister
// Body: { token }
exports.unregisterToken = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });

    const token = req.body?.token;
    if (!token) return res.status(400).json({ success: false, error: 'token required' });

    await User.updateOne(
      { _id: userId },
      { $pull: { pushTokens: { token } } }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('[push] unregisterToken error:', err);
    return res.status(500).json({ success: false, error: 'Failed to unregister token' });
  }
};
