const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const sseService = require('../services/sseService');
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuth');

/**
 * @route GET /api/superadmin/notifications/stream
 * @desc SSE endpoint for real-time notifications (SuperAdmin)
 * @access SuperAdmin
 */
router.get('/stream', authenticateSuperAdmin, (req, res) => {
  const superAdminId = req.admin._id.toString();

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Add connection
  sseService.addConnection(superAdminId, 'superadmin', res);

  // Handle client disconnect
  req.on('close', () => {
    sseService.removeConnection(superAdminId, 'superadmin', res);
  });
});

/**
 * @route GET /api/superadmin/notifications
 * @desc Get superadmin notifications with pagination
 * @access SuperAdmin
 */
router.get('/', authenticateSuperAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    
    const result = await Notification.getForUser(req.admin._id, {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === 'true'
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to get notifications' });
  }
});

/**
 * @route GET /api/superadmin/notifications/unread-count
 * @desc Get unread notification count
 * @access SuperAdmin
 */
router.get('/unread-count', authenticateSuperAdmin, async (req, res) => {
  try {
    const count = await Notification.getUnreadCount(req.admin._id, 'superadmin');
    res.json({ success: true, data: { unreadCount: count } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get unread count' });
  }
});

/**
 * @route PUT /api/superadmin/notifications/read
 * @desc Mark notifications as read
 * @access SuperAdmin
 */
router.put('/read', authenticateSuperAdmin, async (req, res) => {
  try {
    const { notificationIds } = req.body;
    await Notification.markManyAsRead(req.admin._id, notificationIds);
    res.json({ success: true, message: 'Notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark as read' });
  }
});

/**
 * @route PUT /api/superadmin/notifications/read-all
 * @desc Mark all notifications as read
 * @access SuperAdmin
 */
router.put('/read-all', authenticateSuperAdmin, async (req, res) => {
  try {
    await Notification.markManyAsRead(req.admin._id);
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to mark all as read' });
  }
});

module.exports = router;
