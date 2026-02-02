/**
 * DeepNoti SSE Routes
 * Server-Sent Events endpoints for real-time notifications
 * Uses simple in-memory event bus - no Redis required
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const sseService = require('../services/sseService');
const eventBus = require('../services/simpleEventBus');
const deepNotiEngine = require('../services/deepNotiEngine');

const router = express.Router();

/**
 * SSE Authentication Middleware
 * Validates JWT token for SSE connection
 */
const sseAuth = async (req, res, next) => {
  try {
    // Get token from Authorization header or query parameter
    let token = req.headers.authorization?.split(' ')[1] || req.query.token;
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Authentication token required for SSE connection' 
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Extract user information
    req.userId = decoded.userId || decoded.id || decoded._id;
    req.userRole = decoded.role;
    req.tenancyId = decoded.tenancy || decoded.tenancyId;
    
    if (!req.userId) {
      return res.status(401).json({ 
        error: 'Invalid token: missing user ID' 
      });
    }

    console.log('🔐 SSE authentication successful:', {
      userId: req.userId,
      role: req.userRole,
      tenancy: req.tenancyId
    });

    next();
  } catch (error) {
    console.error('❌ SSE authentication failed:', error.message);
    return res.status(401).json({ 
      error: 'Authentication failed: ' + error.message 
    });
  }
};

/**
 * GET /notifications/stream
 * Main SSE endpoint for real-time notifications
 */
router.get('/stream', sseAuth, (req, res) => {
  try {
    console.log('🔗 New SSE connection request:', {
      userId: req.userId,
      role: req.userRole,
      tenancy: req.tenancyId,
      userAgent: req.headers['user-agent']
    });

    // Create SSE connection
    const connectionId = sseService.createConnection(
      req, 
      res, 
      req.userId, 
      req.userRole, 
      req.tenancyId
    );

    if (!connectionId) {
      return res.status(500).json({ 
        error: 'Failed to establish SSE connection' 
      });
    }

    // Connection is now handled by SSE service
    // Response will be kept alive for real-time events

  } catch (error) {
    console.error('❌ Error establishing SSE connection:', error);
    res.status(500).json({ 
      error: 'Internal server error' 
    });
  }
});

/**
 * GET /status
 * Get DeepNoti system status
 */
router.get('/status', (req, res) => {
  try {
    const status = {
      deepNoti: deepNotiEngine.getStatus(),
      eventBus: eventBus.getStatus(),
      sse: sseService.getStatus(),
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('❌ Error getting status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get status'
    });
  }
});

/**
 * POST /test-permission-event
 * Test endpoint for directly publishing permission events (development only)
 */
router.post('/test-permission-event', sseAuth, async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'Test endpoint not available in production'
      });
    }

    console.log('🧪 Testing permission event publishing directly...');

    // Publish a test permission update event
    const testEventPublished = await eventBus.publishPermissionUpdate(
      req.userId,
      req.tenancyId || 'test-tenancy',
      { orders: { view: true, create: true } },
      'Test SuperAdmin'
    );

    console.log('📡 Test permission event published:', testEventPublished);

    res.json({
      success: true,
      message: 'Test permission event published',
      data: { 
        eventPublished: testEventPublished,
        userId: req.userId,
        tenancyId: req.tenancyId
      }
    });

  } catch (error) {
    console.error('❌ Error publishing test permission event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to publish test permission event'
    });
  }
});

/**
 * POST /test
 * Test endpoint for sending notifications (development only)
 */
router.post('/test', sseAuth, async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'Test endpoint not available in production'
      });
    }

    const { type = 'test', title = 'Test Notification', message = 'This is a test notification' } = req.body;

    // Send test notification via Event Bus
    await eventBus.publishNotification({
      _id: `test_${Date.now()}`,
      recipient: req.userId,
      recipientType: sseService.mapRoleToRecipientType(req.userRole),
      tenancy: req.tenancyId,
      type,
      title,
      message,
      icon: 'bell',
      severity: 'info',
      data: { test: true },
      createdAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Test notification sent',
      data: { type, title, message }
    });

  } catch (error) {
    console.error('❌ Error sending test notification:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test notification'
    });
  }
});

/**
 * POST /broadcast
 * Broadcast message to all connected users (admin only)
 */
router.post('/broadcast', sseAuth, async (req, res) => {
  try {
    // Check if user has admin privileges
    if (!['superadmin', 'admin'].includes(req.userRole)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient privileges for broadcast'
      });
    }

    const { message, type = 'system_announcement' } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required for broadcast'
      });
    }

    // Broadcast via Event Bus
    await eventBus.publishSystemEvent('system_announcement', {
      message,
      broadcastBy: req.userId,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Broadcast sent successfully',
      data: { message, type }
    });

  } catch (error) {
    console.error('❌ Error broadcasting message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to broadcast message'
    });
  }
});

/**
 * GET /connections
 * Get active SSE connections (admin only)
 */
router.get('/connections', sseAuth, (req, res) => {
  try {
    // Check if user has admin privileges
    if (!['superadmin', 'admin'].includes(req.userRole)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient privileges'
      });
    }

    const connections = sseService.getStatus();

    res.json({
      success: true,
      data: connections
    });

  } catch (error) {
    console.error('❌ Error getting connections:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get connections'
    });
  }
});

module.exports = router;