// Expo Push Notifications wrapper.
// Free tier of Expo's push service handles delivery to APNs (iOS) and FCM
// (Android) — no Firebase/APNs setup required for development.
//
// Tokens look like "ExponentPushToken[xxxxxxxx]" and are stored on
// User.pushTokens[]. Invalid/expired tokens are auto-pruned when Expo
// returns a DeviceNotRegistered error.

const { Expo } = require('expo-server-sdk');
const User = require('../models/User');

const expo = new Expo({ useFcmV1: true });

/**
 * Send a push notification to all of a user's registered devices.
 * @param {string|ObjectId} userId
 * @param {{ title: string, body: string, data?: object, sound?: 'default' | null, badge?: number }} payload
 * @returns {Promise<{ sent: number, removed: number }>}
 */
async function sendPushToUser(userId, { title, body, data, sound = 'default', badge }) {
  if (!userId || !title || !body) return { sent: 0, removed: 0 };

  const user = await User.findById(userId).select('pushTokens').lean();
  const tokens = (user?.pushTokens ?? []).map(t => t.token).filter(Boolean);
  if (tokens.length === 0) return { sent: 0, removed: 0 };

  // Filter out malformed tokens before sending
  const valid = tokens.filter(t => Expo.isExpoPushToken(t));
  const invalid = tokens.filter(t => !Expo.isExpoPushToken(t));

  const messages = valid.map(to => ({
    to,
    title,
    body,
    data: data || {},
    sound,
    badge,
    priority: 'high',
    channelId: 'default' // Android: maps to our setup channel
  }));

  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];
  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    } catch (err) {
      console.error('[expoPush] chunk send failed:', err.message);
    }
  }

  // Find tokens that the device unregistered (uninstalled, etc.) so we can
  // prune them. Expo returns these inline in the ticket response.
  const tokensToRemove = new Set(invalid);
  tickets.forEach((ticket, idx) => {
    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      tokensToRemove.add(messages[idx].to);
    }
  });

  if (tokensToRemove.size > 0) {
    await User.updateOne(
      { _id: userId },
      { $pull: { pushTokens: { token: { $in: [...tokensToRemove] } } } }
    );
  }

  return { sent: tickets.length, removed: tokensToRemove.size };
}

module.exports = { sendPushToUser };
