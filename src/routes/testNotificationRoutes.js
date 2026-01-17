const express = require('express');
const router = express.Router();
const NotificationService = require('../services/notificationService');

/**
 * @route POST /api/test-notification
 * @desc Send a test notification (development only)
 * @access Public (for testing)
 */
router.post('/test-notification', async (req, res) => {
  try {
    const { userId, tenancyId, type, title, message, severity } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const notification = await NotificationService.createNotification({
      recipientId: userId,
      recipientModel: 'User',
      recipientType: 'admin',
      tenancy: tenancyId || null,
      type: type || 'system_alert',
      title: title || 'Test Notification',
      message: message || 'This is a test notification',
      severity: severity || 'info',
      data: { link: '/dashboard' }
    });

    res.json({
      success: true,
      message: 'Test notification sent',
      notification
    });
  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test notification',
      error: error.message
    });
  }
});

module.exports = router;
