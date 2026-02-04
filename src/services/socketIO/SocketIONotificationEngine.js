/**
 * Socket.IO Notification Engine
 * Production-level notification system with priority levels, channels, and reminders
 * Replaces the SSE-based DeepNoti system
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../../utils/jwt');
const User = require('../../models/User');
const CenterAdmin = require('../../models/CenterAdmin'); // SuperAdmin uses CenterAdmin model
const NotificationPriorityClassifier = require('./NotificationPriorityClassifier');
const NotificationChannelSelector = require('./NotificationChannelSelector');
const NotificationReminderEngine = require('./NotificationReminderEngine');
const NotificationSecurityGuard = require('./NotificationSecurityGuard');
const NotificationRateLimiter = require('./NotificationRateLimiter');
const NotificationAuditLogger = require('./NotificationAuditLogger');

class SocketIONotificationEngine {
  constructor(httpServer) {
    this.httpServer = httpServer;
    this.io = null;
    this.connections = new Map(); // Map<userId, Set<socketId>>
    this.socketMetadata = new Map(); // Map<socketId, metadata>
    this.isInitialized = false;
    
    // Initialize sub-engines
    this.priorityClassifier = new NotificationPriorityClassifier();
    this.channelSelector = new NotificationChannelSelector();
    this.reminderEngine = new NotificationReminderEngine(this);
    this.securityGuard = new NotificationSecurityGuard();
    this.rateLimiter = new NotificationRateLimiter();
    this.auditLogger = new NotificationAuditLogger();
    
    console.log('🚀 Socket.IO Notification Engine initialized');
  }

  /**
   * Initialize Socket.IO server with authentication and middleware
   */
  async initialize() {
    try {
      // Create Socket.IO server
      this.io = new Server(this.httpServer, {
        cors: {
          origin: this.getAllowedOrigins(),
          methods: ['GET', 'POST'],
          credentials: true
        },
        transports: ['websocket', 'polling'],
        pingTimeout: 60000,
        pingInterval: 25000
      });

      // Setup authentication middleware
      this.io.use(async (socket, next) => {
        try {
          await this.authenticateSocket(socket, next);
        } catch (error) {
          console.error('❌ Socket authentication error:', error);
          next(new Error('Authentication failed'));
        }
      });

      // Setup connection handlers
      this.io.on('connection', (socket) => {
        this.handleConnection(socket);
      });

      // Initialize sub-engines
      await this.priorityClassifier.initialize();
      await this.channelSelector.initialize();
      await this.reminderEngine.initialize();
      await this.securityGuard.initialize();
      await this.rateLimiter.initialize();
      await this.auditLogger.initialize();

      this.isInitialized = true;
      console.log('✅ Socket.IO Notification Engine fully initialized');
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Socket.IO Notification Engine:', error);
      return false;
    }
  }

  /**
   * Authenticate socket connection using JWT token
   */
  async authenticateSocket(socket, next) {
    try {
      // Get token from handshake auth or query
      const token = socket.handshake.auth?.token || 
                   socket.handshake.query?.token ||
                   socket.request.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        throw new Error('No authentication token provided');
      }

      // Verify token
      const decoded = verifyToken(token);
      
      let user = null;
      let userType = 'user';
      
      // Check if it's a SuperAdmin token
      if (decoded.adminId && decoded.role === 'superadmin') {
        user = await CenterAdmin.findById(decoded.adminId).select('-password');
        userType = 'superadmin';
        
        if (!user || !user.isActive) {
          throw new Error('SuperAdmin not found or inactive');
        }
        
        // Attach SuperAdmin data to socket
        socket.userId = user._id.toString();
        socket.userType = userType;
        socket.userRole = decoded.role;
        socket.tenancyId = null; // SuperAdmin has no tenancy
        socket.userEmail = user.email;
        socket.userName = user.name;
        socket.permissions = user.permissions || {};
        socket.features = user.features || {};
        
      } else if (decoded.userId) {
        // Regular user token
        user = await User.findById(decoded.userId)
          .select('-password')
          .populate('roleId', 'name slug permissions isActive color');
          
        if (!user || !user.isActive) {
          throw new Error('User not found or inactive');
        }
        
        // Attach user data to socket
        socket.userId = user._id.toString();
        socket.userType = userType;
        socket.userRole = user.role;
        socket.tenancyId = user.tenancy?.toString() || null;
        socket.userEmail = user.email;
        socket.userName = user.name;
        socket.permissions = user.permissions || {};
        socket.features = user.features || {};
        
      } else {
        throw new Error('Invalid token format');
      }
      
      // Security validation
      const securityCheck = await this.securityGuard.validateConnection(socket, user);
      if (!securityCheck.allowed) {
        throw new Error(securityCheck.reason);
      }

      console.log(`🔐 Socket authenticated: ${user.email} (${userType}) - ${socket.id}`);
      next();
      
    } catch (error) {
      console.error('❌ Socket authentication failed:', error.message);
      next(new Error(`Authentication failed: ${error.message}`));
    }
  }

  /**
   * Handle new socket connection
   */
  handleConnection(socket) {
    try {
      const userId = socket.userId;
      const socketId = socket.id;
      
      // Store connection
      if (!this.connections.has(userId)) {
        this.connections.set(userId, new Set());
      }
      this.connections.get(userId).add(socketId);
      
      // Store socket metadata
      this.socketMetadata.set(socketId, {
        userId,
        userType: socket.userType,
        userRole: socket.userRole,
        tenancyId: socket.tenancyId,
        userEmail: socket.userEmail,
        userName: socket.userName,
        permissions: socket.permissions,
        features: socket.features,
        connectedAt: new Date(),
        lastActivity: new Date(),
        socket
      });

      console.log(`🔗 Socket connected: ${socket.userEmail} | Connections: ${this.connections.get(userId).size}`);

      // Send connection confirmation
      socket.emit('notification_engine_connected', {
        type: 'connection_established',
        message: 'Socket.IO Notification Engine connected',
        userId,
        socketId,
        timestamp: new Date().toISOString(),
        engine: 'socketio',
        version: '1.0.0'
      });

      // Setup event handlers
      this.setupSocketEventHandlers(socket);
      
      // Send pending notifications
      this.sendPendingNotifications(userId);
      
      // Log connection
      this.auditLogger.logConnection(userId, socketId, socket.userEmail, 'connected');
      
    } catch (error) {
      console.error('❌ Error handling socket connection:', error);
      socket.disconnect(true);
    }
  }

  /**
   * Setup event handlers for socket
   */
  setupSocketEventHandlers(socket) {
    // Handle disconnection
    socket.on('disconnect', (reason) => {
      this.handleDisconnection(socket, reason);
    });

    // Handle notification acknowledgement
    socket.on('acknowledge_notification', (data) => {
      this.handleNotificationAcknowledgement(socket, data);
    });

    // Handle notification read
    socket.on('mark_notification_read', (data) => {
      this.handleNotificationRead(socket, data);
    });

    // Handle heartbeat
    socket.on('heartbeat', () => {
      this.handleHeartbeat(socket);
    });

    // Handle permission refresh request
    socket.on('request_permission_refresh', () => {
      this.handlePermissionRefreshRequest(socket);
    });

    // Handle notification preferences update
    socket.on('update_notification_preferences', (data) => {
      this.handleNotificationPreferencesUpdate(socket, data);
    });
  }

  /**
   * Handle socket disconnection
   */
  handleDisconnection(socket, reason) {
    try {
      const userId = socket.userId;
      const socketId = socket.id;
      
      // Remove from connections
      if (this.connections.has(userId)) {
        this.connections.get(userId).delete(socketId);
        if (this.connections.get(userId).size === 0) {
          this.connections.delete(userId);
        }
      }
      
      // Remove metadata
      this.socketMetadata.delete(socketId);
      
      console.log(`🔌 Socket disconnected: ${socket.userEmail} | Reason: ${reason}`);
      
      // Log disconnection
      this.auditLogger.logConnection(userId, socketId, socket.userEmail, 'disconnected', { reason });
      
    } catch (error) {
      console.error('❌ Error handling socket disconnection:', error);
    }
  }

  /**
   * Send notification to specific user
   */
  async sendNotificationToUser(userId, notification) {
    try {
      // Security check
      const securityCheck = await this.securityGuard.validateNotification(notification);
      if (!securityCheck.allowed) {
        console.error('❌ Security check failed:', securityCheck.reason);
        return false;
      }

      // Rate limiting check
      const rateLimitCheck = await this.rateLimiter.checkRateLimit(userId, notification);
      if (!rateLimitCheck.allowed) {
        console.warn('⚠️ Rate limit exceeded:', rateLimitCheck.reason);
        return false;
      }

      // Classify priority
      const priority = await this.priorityClassifier.classifyNotification(notification);
      notification.priority = priority;

      // Select channels
      const channels = await this.channelSelector.selectChannels(notification, priority);
      notification.channels = channels;

      // Get user connections
      const userConnections = this.connections.get(userId);
      if (!userConnections || userConnections.size === 0) {
        console.log(`📭 No active connections for user: ${userId}`);
        
        // Store for later delivery if persistent
        if (priority === 'P0' || priority === 'P1') {
          await this.storeForLaterDelivery(userId, notification);
        }
        return false;
      }

      // Send to all user connections
      let sentCount = 0;
      for (const socketId of userConnections) {
        const metadata = this.socketMetadata.get(socketId);
        if (metadata && metadata.socket) {
          try {
            // Prepare notification payload
            const payload = {
              id: notification.id || `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'notification',
              priority,
              notification: {
                ...notification,
                timestamp: new Date().toISOString()
              },
              channels,
              requiresAck: priority === 'P0' || (priority === 'P1' && notification.requiresAck),
              metadata: {
                socketId,
                userId,
                tenancyId: metadata.tenancyId
              }
            };

            // Send notification
            metadata.socket.emit('notification', payload);
            sentCount++;
            
            // Update last activity
            metadata.lastActivity = new Date();
            
            console.log(`📤 Notification sent to ${metadata.userEmail} (${socketId})`);
            
          } catch (socketError) {
            console.error(`❌ Failed to send to socket ${socketId}:`, socketError);
            this.handleDisconnection(metadata.socket, 'send_error');
          }
        }
      }

      // Schedule reminders if needed
      if (this.shouldScheduleReminders(priority, notification)) {
        await this.reminderEngine.scheduleReminders(userId, notification);
      }

      // Log notification
      await this.auditLogger.logNotification(userId, notification, {
        priority,
        channels,
        sentCount,
        totalConnections: userConnections.size
      });

      console.log(`📤 Notification sent to user ${userId} (${sentCount}/${userConnections.size} connections)`);
      return sentCount > 0;
      
    } catch (error) {
      console.error('❌ Error sending notification to user:', error);
      return false;
    }
  }

  /**
   * Broadcast notification to all users of a specific type
   */
  async broadcastToUserType(userType, notification) {
    try {
      let sentCount = 0;
      
      for (const [socketId, metadata] of this.socketMetadata) {
        if (metadata.userType === userType) {
          const sent = await this.sendNotificationToUser(metadata.userId, notification);
          if (sent) sentCount++;
        }
      }
      
      console.log(`📤 Broadcast to ${userType} users: ${sentCount} notifications sent`);
      return sentCount;
      
    } catch (error) {
      console.error('❌ Error broadcasting to user type:', error);
      return 0;
    }
  }

  /**
   * Broadcast notification to all users in a tenancy
   */
  async broadcastToTenancy(tenancyId, notification) {
    try {
      let sentCount = 0;
      
      for (const [socketId, metadata] of this.socketMetadata) {
        if (metadata.tenancyId === tenancyId) {
          const sent = await this.sendNotificationToUser(metadata.userId, notification);
          if (sent) sentCount++;
        }
      }
      
      console.log(`📤 Broadcast to tenancy ${tenancyId}: ${sentCount} notifications sent`);
      return sentCount;
      
    } catch (error) {
      console.error('❌ Error broadcasting to tenancy:', error);
      return 0;
    }
  }

  /**
   * Handle notification acknowledgement
   */
  async handleNotificationAcknowledgement(socket, data) {
    try {
      const { notificationId, acknowledged } = data;
      
      console.log(`✅ Notification acknowledged by ${socket.userEmail}: ${notificationId}`);
      
      // Cancel pending reminders
      await this.reminderEngine.cancelReminders(notificationId);
      
      // Log acknowledgement
      await this.auditLogger.logAcknowledgement(socket.userId, notificationId, acknowledged);
      
      // Send confirmation
      socket.emit('acknowledgement_confirmed', {
        notificationId,
        acknowledged,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Error handling notification acknowledgement:', error);
    }
  }

  /**
   * Handle notification read
   */
  async handleNotificationRead(socket, data) {
    try {
      const { notificationIds } = data;
      
      console.log(`👁️ Notifications marked as read by ${socket.userEmail}: ${notificationIds.length}`);
      
      // Update notification status in database
      const Notification = require('../../models/Notification');
      await Notification.updateMany(
        { 
          _id: { $in: notificationIds },
          recipient: socket.userId 
        },
        { 
          isRead: true,
          readAt: new Date()
        }
      );
      
      // Send confirmation
      socket.emit('read_confirmed', {
        notificationIds,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Error handling notification read:', error);
    }
  }

  /**
   * Handle heartbeat
   */
  handleHeartbeat(socket) {
    const metadata = this.socketMetadata.get(socket.id);
    if (metadata) {
      metadata.lastActivity = new Date();
      socket.emit('heartbeat_ack', { timestamp: new Date().toISOString() });
    }
  }

  /**
   * Handle permission refresh request
   */
  async handlePermissionRefreshRequest(socket) {
    try {
      console.log(`🔄 Permission refresh requested by ${socket.userEmail}`);
      
      // Fetch latest user data
      let user;
      if (socket.userType === 'superadmin') {
        user = await SuperAdmin.findById(socket.userId).select('-password');
      } else {
        user = await User.findById(socket.userId)
          .select('-password')
          .populate('roleId', 'name slug permissions isActive color');
      }
      
      if (user) {
        // Update socket metadata
        const metadata = this.socketMetadata.get(socket.id);
        if (metadata) {
          metadata.permissions = user.permissions || {};
          metadata.features = user.features || {};
        }
        
        // Send updated permissions
        socket.emit('permissions_refreshed', {
          permissions: user.permissions || {},
          features: user.features || {},
          role: user.role,
          timestamp: new Date().toISOString()
        });
        
        console.log(`✅ Permissions refreshed for ${socket.userEmail}`);
      }
      
    } catch (error) {
      console.error('❌ Error handling permission refresh:', error);
    }
  }

  /**
   * Send pending notifications to user
   */
  async sendPendingNotifications(userId) {
    try {
      const Notification = require('../../models/Notification');
      
      // Get recent unread notifications
      const notifications = await Notification.find({
        recipient: userId,
        isRead: false,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
      })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

      if (notifications.length > 0) {
        for (const notification of notifications) {
          await this.sendNotificationToUser(userId, {
            id: notification._id,
            title: notification.title,
            message: notification.message,
            icon: notification.icon,
            severity: notification.severity,
            data: notification.data,
            createdAt: notification.createdAt,
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
   * Store notification for later delivery
   */
  async storeForLaterDelivery(userId, notification) {
    try {
      const Notification = require('../../models/Notification');
      
      const storedNotification = new Notification({
        recipient: userId,
        recipientType: notification.recipientType || 'admin',
        tenancy: notification.tenancy,
        type: notification.type || 'system_update',
        title: notification.title,
        message: notification.message,
        icon: notification.icon,
        severity: notification.severity,
        priority: notification.priority,
        data: notification.data,
        channels: { inApp: true },
        requiresAck: notification.priority === 'P0' || (notification.priority === 'P1' && notification.requiresAck)
      });

      await storedNotification.save();
      console.log(`💾 Notification stored for later delivery to user: ${userId}`);
      
    } catch (error) {
      console.error('❌ Error storing notification:', error);
    }
  }

  /**
   * Check if reminders should be scheduled
   */
  shouldScheduleReminders(priority, notification) {
    // P0 - No reminders, requires manual acknowledgment
    if (priority === 'P0') return false;
    
    // P1 - Yes, with escalation
    if (priority === 'P1') return true;
    
    // P2 - Conditional based on event type
    if (priority === 'P2') {
      const reminderEvents = ['order_delayed', 'pickup_scheduled', 'payment_pending'];
      return reminderEvents.includes(notification.type);
    }
    
    // P3, P4 - No reminders
    return false;
  }

  /**
   * Get allowed origins for CORS
   */
  getAllowedOrigins() {
    const origins = [
      'http://localhost:3000',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004',
      'http://localhost:3005',
      'http://localhost:3006',
      'http://localhost:3007',
      'https://laundrylobby.vercel.app',
      'https://laundrylobby-superadmin.vercel.app',
      'https://laundrylobby.com'
    ];

    // Allow all localhost ports in development
    if (process.env.NODE_ENV === 'development') {
      origins.push(/^http:\/\/localhost:\d+$/);
    }

    return origins;
  }

  /**
   * Get engine status and statistics
   */
  getStatus() {
    const totalConnections = this.socketMetadata.size;
    const uniqueUsers = this.connections.size;
    
    const byType = {};
    const byTenancy = {};
    
    this.socketMetadata.forEach((metadata) => {
      byType[metadata.userType] = (byType[metadata.userType] || 0) + 1;
      if (metadata.tenancyId) {
        byTenancy[metadata.tenancyId] = (byTenancy[metadata.tenancyId] || 0) + 1;
      }
    });
    
    return {
      initialized: this.isInitialized,
      engine: 'socketio',
      version: '1.0.0',
      totalConnections,
      uniqueUsers,
      byType,
      byTenancy,
      subEngines: {
        priorityClassifier: this.priorityClassifier.getStatus(),
        channelSelector: this.channelSelector.getStatus(),
        reminderEngine: this.reminderEngine.getStatus(),
        securityGuard: this.securityGuard.getStatus(),
        rateLimiter: this.rateLimiter.getStatus(),
        auditLogger: this.auditLogger.getStatus()
      }
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    try {
      console.log('🔄 Shutting down Socket.IO Notification Engine...');
      
      // Notify all connected clients
      this.io.emit('server_shutdown', {
        message: 'Server is shutting down',
        timestamp: new Date().toISOString()
      });
      
      // Close all connections
      this.io.close();
      
      // Shutdown sub-engines
      await this.reminderEngine.shutdown();
      await this.auditLogger.shutdown();
      
      console.log('✅ Socket.IO Notification Engine shutdown complete');
      
    } catch (error) {
      console.error('❌ Error during Socket.IO Notification Engine shutdown:', error);
    }
  }
}

module.exports = SocketIONotificationEngine;