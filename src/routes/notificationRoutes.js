const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const NotificationService = require('../services/notificationService');
const sseService = require('../services/sseService');
const { protect } = require('../middlewares/auth');

/**
 * @route GET /api/notifications/stream
 * @desc SSE endpoint for real-time notifications
 * @access Private
 */
router.get('/stream', protect, (req, res) => {
  const userId = req.user._id.toString();
  const userRole = req.user.role;
  
  // Map role to recipient type
  const recipientType = userRole === 'admin' ? 'admin' 
    : userRole === 'branch_admin' ? 'branch_admin'
    : 'customer';

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Add connection
  sseService.addConnection(userId, recipientType, res);

  // Handle client disconnect
  req.on('close', () => {
    sseService.removeConnection(userId, recipientType, res);
  });
});

/**
 * @route GET /api/notifications
 * @desc Get user notifications with pagination
 * @access Private
 */
router.get('/', protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    
    const result = await NotificationService.getUserNotifications(req.user._id, {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === 'true'
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to get notifications' });
  }
});

/**
 * @route GET /api/notifications/unread-count
 * @desc Get unread notification count
 * @access Private
 */
router.get('/unread-count', protect, async (req, res) => {
  try {
    const count = await NotificationService.getUnreadCount(req.user._id);
    res.json({ success: true, data: { unreadCount: count } });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ success: false, message: 'Failed to get unread count' });
  }
});

/**
 * @route GET /api/notifications/poll
 * @desc Poll for new notifications (serverless-friendly)
 * @access Private
 */
router.get('/poll', protect, async (req, res) => {
  try {
    const { since } = req.query;
    const userId = req.user._id;
    
    // Get notifications since timestamp
    const query = { recipient: userId };
    if (since) {
      query.createdAt = { $gt: new Date(since) };
    }
    
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    
    const unreadCount = await Notification.countDocuments({
      recipient: userId,
      isRead: false
    });
    
    res.json({
      success: true,
      data: {
        notifications,
        unreadCount,
        hasNew: notifications.length > 0,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Poll notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to poll notifications' });
  }
});

/**
 * @route PUT /api/notifications/mark-read
 * @desc Mark notifications as read
 * @access Private
 */
router.put('/mark-read', protect, async (req, res) => {
  try {
    const { notificationIds } = req.body;
    
    await NotificationService.markAsRead(req.user._id, notificationIds);
    
    res.json({ success: true, message: 'Notifications marked as read' });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark as read' });
  }
});

/**
 * @route PUT /api/notifications/read-all
 * @desc Mark all notifications as read
 * @access Private
 */
router.put('/read-all', protect, async (req, res) => {
  try {
    await NotificationService.markAllAsRead(req.user._id);
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark all as read' });
  }
});

/**
 * @route DELETE /api/notifications/:id
 * @desc Delete a notification
 * @access Private
 */
router.delete('/:id', protect, async (req, res) => {
  try {
    await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.user._id
    });
    
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete notification' });
  }
});

module.exports = router;
