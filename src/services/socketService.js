/**
 * Socket.IO Service for Real-time Notifications
 * Replaces SSE with WebSocket for better mobile support and bi-directional communication
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { RECIPIENT_TYPES } = require('../config/constants');

class SocketService {
  constructor() {
    this.io = null;
    // Store socket connections: Map<userId, Set<socketId>>
    this.userSockets = new Map();
    // Store socket metadata: Map<socketId, { userId, recipientType, tenancy }>
    this.socketMetadata = new Map();
  }

  /**
   * Initialize Socket.IO server
   */
  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true,
        methods: ['GET', 'POST']
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.userId || decoded.id || decoded._id;
        socket.userRole = decoded.role;
        socket.tenancy = decoded.tenancy || decoded.tenancyId;
        
        next();
      } catch (error) {
        console.error('Socket authentication error:', error.message);
        next(new Error('Authentication failed'));
      }
    });

    // Connection handler
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    console.log('✅ Socket.IO service initialized');
    return this.io;
  }

  /**
   * Handle new socket connection
   */
  handleConnection(socket) {
    const userId = socket.userId;
    const recipientType = this.mapRoleToRecipientType(socket.userRole);
    
    // Store socket connection
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId).add(socket.id);
    
    // Store metadata
    this.socketMetadata.set(socket.id, {
      userId,
      recipientType,
      tenancy: socket.tenancy,
      connectedAt: new Date()
    });

    console.log(`🔌 Socket connected: ${socket.id} | User: ${userId} | Type: ${recipientType}`);

    // Join user-specific room
    socket.join(`user:${userId}`);
    
    // Join recipient type room
    socket.join(`type:${recipientType}`);
    
    // Join tenancy room (if applicable)
    if (socket.tenancy) {
      socket.join(`tenant:${socket.tenancy}`);
      socket.join(`tenant:${socket.tenancy}:${recipientType}`);
    }

    // Send connection success
    socket.emit('connected', {
      message: 'WebSocket connected successfully',
      userId,
      recipientType,
      timestamp: new Date()
    });

    // Setup event handlers
    this.setupEventHandlers(socket);

    // Handle disconnect
    socket.on('disconnect', () => {
      this.handleDisconnect(socket);
    });
  }

  /**
   * Setup event handlers for socket
   */
  setupEventHandlers(socket) {
    const userId = socket.userId;

    // Mark notification as read
    socket.on('markNotificationRead', async ({ notificationId }) => {
      try {
        const Notification = require('../models/Notification');
        await Notification.findOneAndUpdate(
          { _id: notificationId, recipient: userId },
          { isRead: true, readAt: new Date() }
        );
        
        socket.emit('notificationMarkedRead', { notificationId });
      } catch (error) {
        socket.emit('error', { message: 'Failed to mark notification as read' });
      }
    });

    // Mark multiple notifications as read
    socket.on('markMultipleAsRead', async ({ notificationIds }) => {
      try {
        const Notification = require('../models/Notification');
        await Notification.updateMany(
          { _id: { $in: notificationIds }, recipient: userId },
          { isRead: true, readAt: new Date() }
        );
        
        socket.emit('notificationsMarkedRead', { notificationIds });
      } catch (error) {
        socket.emit('error', { message: 'Failed to mark notifications as read' });
      }
    });

    // Get unread count
    socket.on('getUnreadCount', async () => {
      try {
        const Notification = require('../models/Notification');
        const count = await Notification.getUnreadCount(userId);
        socket.emit('unreadCount', { count });
      } catch (error) {
        socket.emit('error', { message: 'Failed to get unread count' });
      }
    });

    // Join specific room (for order tracking, etc.)
    socket.on('joinRoom', ({ room }) => {
      socket.join(room);
      socket.emit('roomJoined', { room });
    });

    // Leave specific room
    socket.on('leaveRoom', ({ room }) => {
      socket.leave(room);
      socket.emit('roomLeft', { room });
    });

    // Notification viewed (for analytics)
    socket.on('notificationViewed', ({ notificationId }) => {
      // Broadcast to other admins that someone is viewing this
      socket.to(`tenant:${socket.tenancy}`).emit('notificationViewed', {
        notificationId,
        userId,
        userName: socket.userName || 'User'
      });
    });

    // Claim notification (collaborative feature)
    socket.on('claimNotification', ({ notificationId }) => {
      socket.to(`tenant:${socket.tenancy}`).emit('notificationClaimed', {
        notificationId,
        claimedBy: userId,
        claimedByName: socket.userName || 'User'
      });
    });
  }

  /**
   * Handle socket disconnect
   */
  handleDisconnect(socket) {
    const userId = socket.userId;
    
    // Remove from user sockets
    if (this.userSockets.has(userId)) {
      this.userSockets.get(userId).delete(socket.id);
      if (this.userSockets.get(userId).size === 0) {
        this.userSockets.delete(userId);
      }
    }
    
    // Remove metadata
    this.socketMetadata.delete(socket.id);
    
    console.log(`🔌 Socket disconnected: ${socket.id} | User: ${userId}`);
  }

  /**
   * Send notification to specific user
   */
  sendToUser(userId, notification) {
    const room = `user:${userId}`;
    this.io.to(room).emit('notification', notification);
    
    const socketCount = this.userSockets.get(userId)?.size || 0;
    console.log(`📤 Sent notification to user ${userId} (${socketCount} devices)`);
    
    return socketCount > 0;
  }

  /**
   * Send custom event to specific user
   */
  sendEventToUser(userId, eventName, data) {
    const room = `user:${userId}`;
    this.io.to(room).emit(eventName, data);
    
    const socketCount = this.userSockets.get(userId)?.size || 0;
    console.log(`📤 Sent ${eventName} event to user ${userId} (${socketCount} devices)`);
    
    return socketCount > 0;
  }

  /**
   * Send to all users of a specific type
   */
  sendToRecipientType(recipientType, notification) {
    const room = `type:${recipientType}`;
    this.io.to(room).emit('notification', notification);
    console.log(`📤 Sent notification to all ${recipientType}s`);
  }

  /**
   * Send to all users of a tenancy
   */
  sendToTenancy(tenancyId, notification) {
    const room = `tenant:${tenancyId}`;
    this.io.to(room).emit('notification', notification);
    console.log(`📤 Sent notification to tenancy ${tenancyId}`);
  }

  /**
   * Send to specific recipient type within a tenancy
   */
  sendToTenancyRecipients(tenancyId, recipientType, notification) {
    const room = `tenant:${tenancyId}:${recipientType}`;
    this.io.to(room).emit('notification', notification);
    console.log(`📤 Sent notification to ${recipientType}s in tenancy ${tenancyId}`);
  }

  /**
   * Send to specific room
   */
  sendToRoom(room, event, data) {
    this.io.to(room).emit(event, data);
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(event, data) {
    this.io.emit(event, data);
  }

  /**
   * Get connection statistics
   */
  getStats() {
    const totalConnections = this.socketMetadata.size;
    const uniqueUsers = this.userSockets.size;
    
    const byType = {};
    this.socketMetadata.forEach((metadata) => {
      byType[metadata.recipientType] = (byType[metadata.recipientType] || 0) + 1;
    });
    
    return {
      totalConnections,
      uniqueUsers,
      byType,
      rooms: Array.from(this.io.sockets.adapter.rooms.keys())
    };
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
      'sales_admin': RECIPIENT_TYPES.SUPERADMIN // Sales users treated as superadmin for notifications
    };
    
    return roleMap[role] || RECIPIENT_TYPES.CUSTOMER;
  }

  /**
   * Get IO instance
   */
  getIO() {
    return this.io;
  }
}

// Singleton instance
const socketService = new SocketService();

module.exports = socketService;
