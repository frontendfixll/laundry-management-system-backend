/**
 * DeepNoti SSE Service
 * Server-Sent Events service for one-way real-time notifications
 * Replaces WebSocket with true one-way communication
 */

const jwt = require('jsonwebtoken');
const { RECIPIENT_TYPES } = require('../config/constants');

class SSEService {
  constructor() {
    this.connections = new Map(); // Map<userId, Set<connectionId>>
    this.connectionMetadata = new Map(); // Map<connectionId, metadata>
    this.connectionCounter = 0;
  }

  /**
   * Create SSE connection for authenticated user
   */
  createConnection(req, res, userId, userRole, tenancyId) {
    try {
      // Generate unique connection ID
      const connectionId = `sse_${++this.connectionCounter}_${Date.now()}`;
      
      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': this.getAllowedOrigin(req),
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'X-Accel-Buffering': 'no' // Disable Nginx buffering
      });

      // Store connection
      if (!this.connections.has(userId)) {
        this.connections.set(userId, new Set());
      }
      this.connections.get(userId).add(connectionId);

      // Store metadata
      this.connectionMetadata.set(connectionId, {
        userId,
        userRole,
        tenancyId,
        recipientType: this.mapRoleToRecipientType(userRole),
        connectedAt: new Date(),
        lastPing: new Date(),
        req,
        res
      });

      // Send connection established event
      this.sendToConnection(connectionId, {
        type: 'connected',
        message: 'DeepNoti SSE connection established',
        userId,
        connectionId,
        timestamp: new Date().toISOString()
      });

      // Setup heartbeat
      const heartbeatInterval = setInterval(() => {
        if (this.connectionMetadata.has(connectionId)) {
          this.sendHeartbeat(connectionId);
        } else {
          clearInterval(heartbeatInterval);
        }
      }, 30000); // 30 seconds

      // Handle connection close
      req.on('close', () => {
        this.closeConnection(connectionId, heartbeatInterval);
      });

      req.on('error', (error) => {
        console.error(`❌ SSE connection error for ${connectionId}:`, error);
        this.closeConnection(connectionId, heartbeatInterval);
      });

      console.log(`🔗 SSE connection established: ${connectionId} | User: ${userId} | Role: ${userRole}`);

      // Send any pending notifications
      this.sendPendingNotifications(userId);

      return connectionId;

    } catch (error) {
      console.error('❌ Error creating SSE connection:', error);
      res.status(500).json({ error: 'Failed to establish SSE connection' });
      return null;
    }
  }

  /**
   * Send event to specific connection
   */
  sendToConnection(connectionId, data) {
    try {
      const metadata = this.connectionMetadata.get(connectionId);
      if (!metadata) {
        console.warn(`⚠️ Connection ${connectionId} not found`);
        return false;
      }

      const { res } = metadata;
      
      // Format SSE data
      const eventData = {
        id: `evt_${Date.now()}`,
        timestamp: new Date().toISOString(),
        ...data
      };

      // Send SSE formatted message
      res.write(`id: ${eventData.id}\n`);
      res.write(`event: ${data.type || 'message'}\n`);
      res.write(`data: ${JSON.stringify(eventData)}\n\n`);

      // Update last ping
      metadata.lastPing = new Date();

      console.log(`📤 SSE event sent to ${connectionId}:`, data.type);
      return true;

    } catch (error) {
      console.error(`❌ Error sending to connection ${connectionId}:`, error);
      this.closeConnection(connectionId);
      return false;
    }
  }

  /**
   * Send event to specific user (all their connections)
   */
  async sendToUser(userId, data) {
    const userConnections = this.connections.get(userId);
    if (!userConnections || userConnections.size === 0) {
      console.log(`📭 No active SSE connections for user: ${userId}`);
      return 0;
    }

    let sentCount = 0;
    for (const connectionId of userConnections) {
      if (this.sendToConnection(connectionId, data)) {
        sentCount++;
      }
    }

    console.log(`📤 SSE event sent to user ${userId} (${sentCount}/${userConnections.size} connections)`);
    return sentCount;
  }

  /**
   * Send event to all users of a specific type
   */
  async sendToRecipientType(recipientType, data) {
    let sentCount = 0;
    
    for (const [connectionId, metadata] of this.connectionMetadata) {
      if (metadata.recipientType === recipientType) {
        if (this.sendToConnection(connectionId, data)) {
          sentCount++;
        }
      }
    }

    console.log(`📤 SSE event sent to ${recipientType} recipients (${sentCount} connections)`);
    return sentCount;
  }

  /**
   * Send event to all users in a tenancy
   */
  async sendToTenancy(tenancyId, data) {
    let sentCount = 0;
    
    for (const [connectionId, metadata] of this.connectionMetadata) {
      if (metadata.tenancyId && metadata.tenancyId.toString() === tenancyId.toString()) {
        if (this.sendToConnection(connectionId, data)) {
          sentCount++;
        }
      }
    }

    console.log(`📤 SSE event sent to tenancy ${tenancyId} (${sentCount} connections)`);
    return sentCount;
  }

  /**
   * Broadcast event to all connected users
   */
  async broadcast(data) {
    let sentCount = 0;
    
    for (const connectionId of this.connectionMetadata.keys()) {
      if (this.sendToConnection(connectionId, data)) {
        sentCount++;
      }
    }

    console.log(`📤 SSE event broadcasted to all connections (${sentCount} total)`);
    return sentCount;
  }

  /**
   * Send heartbeat to keep connection alive
   */
  sendHeartbeat(connectionId) {
    this.sendToConnection(connectionId, {
      type: 'heartbeat',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Close specific connection
   */
  closeConnection(connectionId, heartbeatInterval = null) {
    try {
      const metadata = this.connectionMetadata.get(connectionId);
      if (metadata) {
        const { userId, res } = metadata;
        
        // Remove from user connections
        const userConnections = this.connections.get(userId);
        if (userConnections) {
          userConnections.delete(connectionId);
          if (userConnections.size === 0) {
            this.connections.delete(userId);
          }
        }
        
        // Remove metadata
        this.connectionMetadata.delete(connectionId);
        
        // Close response stream
        try {
          res.end();
        } catch (error) {
          // Connection might already be closed
        }
        
        // Clear heartbeat
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
        }
        
        console.log(`🔌 SSE connection closed: ${connectionId} | User: ${userId}`);
      }
    } catch (error) {
      console.error(`❌ Error closing connection ${connectionId}:`, error);
    }
  }

  /**
   * Check if user has active connections
   */
  hasActiveConnection(userId) {
    const userConnections = this.connections.get(userId);
    return userConnections && userConnections.size > 0;
  }

  /**
   * Get user connection count
   */
  getUserConnectionCount(userId) {
    const userConnections = this.connections.get(userId);
    return userConnections ? userConnections.size : 0;
  }

  /**
   * Send pending notifications to user
   */
  async sendPendingNotifications(userId) {
    try {
      // Get recent unread notifications from database
      const Notification = require('../models/Notification');
      const notifications = await Notification.find({
        recipient: userId,
        isRead: false,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

      if (notifications.length > 0) {
        // Send each notification
        for (const notification of notifications) {
          await this.sendToUser(userId, {
            type: 'notification',
            notification: {
              id: notification._id,
              title: notification.title,
              message: notification.message,
              icon: notification.icon,
              severity: notification.severity,
              data: notification.data,
              createdAt: notification.createdAt
            },
            isPending: true
          });
        }

        console.log(`📬 Sent ${notifications.length} pending notifications to user: ${userId}`);
      }
    } catch (error) {
      console.error('❌ Error sending pending notifications:', error);
    }
  }

  /**
   * Get allowed origin for CORS
   */
  getAllowedOrigin(req) {
    const origin = req.headers.origin;
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004',
      'http://localhost:3005', // Frontend
      'http://localhost:3006',
      'http://localhost:3007',
      'https://laundrylobby.vercel.app',
      'https://laundrylobby-superadmin.vercel.app',
      'https://laundrylobby.com'
    ];

    // Always allow the requesting origin for development
    if (process.env.NODE_ENV === 'development' && origin) {
      console.log('🌐 SSE CORS: Allowing development origin:', origin);
      return origin;
    }

    // Check if origin is explicitly allowed
    if (allowedOrigins.includes(origin)) {
      console.log('✅ SSE CORS: Origin allowed (explicit):', origin);
      return origin;
    }

    // Check subdomain patterns
    if (origin && (
      /^https:\/\/[\w-]+\.laundrylobby\.com$/.test(origin) ||
      /^https:\/\/.*\.vercel\.app$/.test(origin) ||
      /^http:\/\/localhost:\d+$/.test(origin) // Allow any localhost port
    )) {
      console.log('✅ SSE CORS: Origin allowed (pattern):', origin);
      return origin;
    }

    console.log('⚠️ SSE CORS: Using fallback origin for:', origin);
    return origin || allowedOrigins[0]; // Return requesting origin or fallback
  }

  /**
   * Map user role to recipient type
   */
  mapRoleToRecipientType(role) {
    const roleMap = {
      'customer': RECIPIENT_TYPES.CUSTOMER,
      'admin': RECIPIENT_TYPES.ADMIN,
      'branch_admin': RECIPIENT_TYPES.BRANCH_ADMIN,
      'superadmin': RECIPIENT_TYPES.SUPERADMIN,
      'staff': RECIPIENT_TYPES.STAFF,
      'sales_admin': RECIPIENT_TYPES.SUPERADMIN
    };
    
    return roleMap[role] || RECIPIENT_TYPES.CUSTOMER;
  }

  /**
   * Cleanup stale connections
   */
  cleanupStaleConnections() {
    const now = new Date();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    for (const [connectionId, metadata] of this.connectionMetadata) {
      if (now - metadata.lastPing > staleThreshold) {
        console.log(`🧹 Cleaning up stale connection: ${connectionId}`);
        this.closeConnection(connectionId);
      }
    }
  }

  /**
   * Get service statistics
   */
  getStatus() {
    const totalConnections = this.connectionMetadata.size;
    const uniqueUsers = this.connections.size;
    
    const byType = {};
    this.connectionMetadata.forEach((metadata) => {
      byType[metadata.recipientType] = (byType[metadata.recipientType] || 0) + 1;
    });
    
    return {
      totalConnections,
      uniqueUsers,
      byType,
      connectionIds: Array.from(this.connectionMetadata.keys())
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    try {
      // Close all connections
      for (const connectionId of this.connectionMetadata.keys()) {
        this.closeConnection(connectionId);
      }
      
      console.log('✅ SSE Service shutdown complete');
    } catch (error) {
      console.error('❌ Error during SSE Service shutdown:', error);
    }
  }
}

// Singleton instance
const sseService = new SSEService();

// Cleanup stale connections every 2 minutes
setInterval(() => {
  sseService.cleanupStaleConnections();
}, 2 * 60 * 1000);

module.exports = sseService;