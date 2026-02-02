/**
 * Socket.IO Notifications API Routes
 * Test and management endpoints for the Socket.IO notification system
 */

const express = require('express');
const router = express.Router();
const socketIOServer = require('../services/socketIOServer');
const notificationServiceIntegration = require('../services/notificationServiceIntegration');
const { protect } = require('../middlewares/auth');

/**
 * Test notification endpoint
 * POST /api/socketio-notifications/test
 */
router.post('/test', protect, async (req, res) => {
  try {
    const { title, message, priority = 'P3', eventType = 'test_notification' } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: 'Title and message are required'
      });
    }

    const testNotification = {
      userId: req.user.id,
      tenantId: req.user.tenantId,
      eventType,
      title,
      message,
      priority,
      category: 'test',
      metadata: {
        isTest: true,
        requestedBy: req.user.email,
        timestamp: new Date()
      }
    };

    const result = await notificationServiceIntegration.createNotification(testNotification);

    res.json({
      success: true,
      message: 'Test notification sent',
      result
    });

  } catch (error) {
    console.error('❌ Error sending test notification:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Send notification to specific user
 * POST /api/socketio-notifications/send-to-user
 */
router.post('/send-to-user', protect, async (req, res) => {
  try {
    const { 
      userId, 
      title, 
      message, 
      priority = 'P3', 
      eventType = 'admin_message',
      category = 'admin'
    } = req.body;
    
    if (!userId || !title || !message) {
      return res.status(400).json({
        success: false,
        error: 'userId, title, and message are required'
      });
    }

    const notification = {
      userId,
      tenantId: req.user.tenantId,
      eventType,
      title,
      message,
      priority,
      category,
      metadata: {
        sentBy: req.user.email,
        sentByRole: req.user.role,
        timestamp: new Date()
      }
    };

    const result = await notificationServiceIntegration.createNotification(notification);

    res.json({
      success: true,
      message: 'Notification sent to user',
      result
    });

  } catch (error) {
    console.error('❌ Error sending notification to user:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Send notification to all tenant users
 * POST /api/socketio-notifications/send-to-tenant
 */
router.post('/send-to-tenant', protect, async (req, res) => {
  try {
    const { 
      title, 
      message, 
      priority = 'P3', 
      eventType = 'tenant_announcement',
      category = 'announcement'
    } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({
        success: false,
        error: 'Title and message are required'
      });
    }

    // Send to tenant via Socket.IO
    const emitResult = await notificationServiceIntegration.emitToTenant(
      req.user.tenantId,
      'tenant_notification',
      {
        title,
        message,
        priority,
        eventType,
        category,
        sentBy: req.user.email,
        timestamp: new Date()
      }
    );

    res.json({
      success: true,
      message: 'Notification sent to tenant',
      emitted: emitResult
    });

  } catch (error) {
    console.error('❌ Error sending notification to tenant:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get Socket.IO system statistics
 * GET /api/socketio-notifications/stats
 */
router.get('/stats', protect, async (req, res) => {
  try {
    const stats = await notificationServiceIntegration.getStatistics();
    
    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('❌ Error getting Socket.IO stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Health check endpoint
 * GET /api/socketio-notifications/health
 */
router.get('/health', async (req, res) => {
  try {
    const health = await notificationServiceIntegration.healthCheck();
    
    res.json({
      success: true,
      health
    });

  } catch (error) {
    console.error('❌ Error checking Socket.IO health:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Switch notification system
 * POST /api/socketio-notifications/switch-system
 */
router.post('/switch-system', protect, async (req, res) => {
  try {
    // Only allow superadmin to switch systems
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        error: 'Only superadmin can switch notification systems'
      });
    }

    const { useSocketIO } = req.body;
    
    if (typeof useSocketIO !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'useSocketIO must be a boolean'
      });
    }

    notificationServiceIntegration.setUseSocketIO(useSocketIO);

    res.json({
      success: true,
      message: `Notification system switched to ${useSocketIO ? 'Socket.IO' : 'Legacy'}`,
      currentSystem: useSocketIO ? 'socketIO' : 'legacy'
    });

  } catch (error) {
    console.error('❌ Error switching notification system:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Test all priority levels
 * POST /api/socketio-notifications/test-priorities
 */
router.post('/test-priorities', protect, async (req, res) => {
  try {
    const priorities = ['P0', 'P1', 'P2', 'P3', 'P4'];
    const results = [];

    for (const priority of priorities) {
      const testNotification = {
        userId: req.user.id,
        tenantId: req.user.tenantId,
        eventType: `test_${priority.toLowerCase()}`,
        title: `${priority} Test Notification`,
        message: `This is a test notification with ${priority} priority level.`,
        priority,
        category: 'test',
        metadata: {
          isTest: true,
          priorityTest: true,
          requestedBy: req.user.email,
          timestamp: new Date()
        }
      };

      const result = await notificationServiceIntegration.createNotification(testNotification);
      results.push({ priority, result });

      // Add delay between notifications to see them clearly
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    res.json({
      success: true,
      message: 'All priority test notifications sent',
      results
    });

  } catch (error) {
    console.error('❌ Error sending priority test notifications:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;