/**
 * SocketIOConnectionManager - Connection management with authentication
 * Part of the Socket.IO Notification Engine Implementation
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { NotificationAuditLogger } = require('./NotificationAuditLogger');
const { NotificationSecurityGuard } = require('./NotificationSecurityGuard');

class SocketIOConnectionManager {
  constructor(httpServer) {
    this.httpServer = httpServer;
    this.io = null;
    this.connections = new Map(); // socketId -> connection info
    this.userSockets = new Map(); // userId -> Set of socketIds
    this.tenantSockets = new Map(); // tenantId -> Set of socketIds
    this.auditLogger = new NotificationAuditLogger();
    this.securityGuard = new NotificationSecurityGuard();

    // Connection statistics
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      authenticationFailures: 0,
      reconnections: 0,
      disconnections: 0
    };

    // Configuration
    this.config = {
      cors: {
        origin: process.env.SOCKETIO_CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      maxHttpBufferSize: 1e6, // 1MB
      allowEIO3: true
    };
  }

  /**
   * Initialize Socket.IO server
   */
  async initialize() {
    try {
      console.log('🔄 Initializing SocketIOConnectionManager...');

      // Create Socket.IO server
      this.io = new Server(this.httpServer, this.config);

      // Set up authentication middleware
      this.setupAuthenticationMiddleware();

      // Set up connection handlers
      this.setupConnectionHandlers();

      // Set up error handlers
      this.setupErrorHandlers();

      // Start connection monitoring
      this.startConnectionMonitoring();

      console.log('✅ SocketIOConnectionManager initialized successfully');

      await this.auditLogger.log({
        action: 'socketio_server_started',
        metadata: {
          cors: this.config.cors,
          transports: this.config.transports
        }
      });

      return true;

    } catch (error) {
      console.error('❌ Failed to initialize SocketIOConnectionManager:', error);
      throw error;
    }
  }

  /**
   * Set up authentication middleware
   */
  setupAuthenticationMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token = this.extractToken(socket);

        if (!token) {
          throw new Error('No authentication token provided');
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Validate token structure - handle both regular users and SuperAdmin
        const userId = decoded.userId || decoded.adminId;
        if (!userId) {
          throw new Error('Invalid token structure: missing userId or adminId');
        }

        const userRole = decoded.role;

        // Use tenancyId if tenantId is not present (backward compatibility)
        const tenantId = decoded.tenantId || decoded.tenancyId;

        // Security validation
        const securityCheck = await this.securityGuard.validateNotificationSecurity(
          { userId: userId, tenantId: tenantId },
          {
            requestingUserId: userId,
            requestingTenantId: tenantId,
            requestingUserRole: userRole,
            ipAddress: socket.handshake.address
          }
        );

        if (!securityCheck.passed) {
          throw new Error(`Security validation failed: ${securityCheck.violations.join(', ')}`);
        }

        // Attach user info to socket (Normalize to strings)
        socket.userId = String(userId);
        socket.tenantId = decoded.tenantId || decoded.tenancyId ? String(decoded.tenantId || decoded.tenancyId) : null;
        // SuperAdmin: always join role:superadmin so they receive platform notifications
        socket.userRole = decoded.adminId ? 'superadmin' : (decoded.role || userRole || null);
        socket.userEmail = decoded.email;
        socket.authenticatedAt = new Date();

        await this.auditLogger.log({
          action: 'socket_authentication_success',
          userId: socket.userId,
          tenantId: socket.tenantId,
          metadata: {
            socketId: socket.id,
            userRole: decoded.role,
            ipAddress: socket.handshake.address,
            userAgent: socket.handshake.headers['user-agent']
          }
        });

        console.log(`📡 Socket Auth OK: ${socket.userId} (${decoded.role})`);
        next();

      } catch (error) {
        console.error('❌ Socket authentication failed:', error.message);

        this.stats.authenticationFailures++;

        await this.auditLogger.log({
          action: 'socket_authentication_failed',
          error: error.message,
          metadata: {
            socketId: socket.id,
            ipAddress: socket.handshake.address,
            userAgent: socket.handshake.headers['user-agent']
          }
        });

        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Set up connection handlers
   */
  setupConnectionHandlers() {
    this.io.on('connection', async (socket) => {
      try {
        await this.handleConnection(socket);

        // Set up socket event handlers
        this.setupSocketEventHandlers(socket);

      } catch (error) {
        console.error('❌ Error handling connection:', error);
        socket.disconnect(true);
      }
    });
  }

  /**
   * Handle new connection
   */
  async handleConnection(socket) {
    const connectionInfo = {
      socketId: socket.id,
      userId: socket.userId,
      tenantId: socket.tenantId,
      userRole: socket.userRole,
      userEmail: socket.userEmail,
      connectedAt: new Date(),
      ipAddress: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent'],
      lastActivity: new Date()
    };

    // Store connection info
    this.connections.set(socket.id, connectionInfo);

    const sUserId = String(socket.userId);
    const sTenantId = socket.tenantId ? String(socket.tenantId) : null;

    // Add to user sockets map
    if (!this.userSockets.has(sUserId)) {
      this.userSockets.set(sUserId, new Set());
    }
    this.userSockets.get(sUserId).add(socket.id);

    // Add to tenant sockets map (only if tenantId exists)
    if (sTenantId) {
      if (!this.tenantSockets.has(sTenantId)) {
        this.tenantSockets.set(sTenantId, new Set());
      }
      this.tenantSockets.get(sTenantId).add(socket.id);

      // Join tenant room
      await socket.join(`tenant:${sTenantId}`);
    }

    // Update statistics
    this.stats.totalConnections++;
    this.stats.activeConnections++;

    // Join user room
    await socket.join(`user:${sUserId}`);

    // Join role-based rooms
    if (socket.userRole) {
      await socket.join(`role:${socket.userRole}`);

      // Also join tenant-specific role room for precision targeting
      if (sTenantId) {
        await socket.join(`tenant:${sTenantId}:role:${socket.userRole}`);
      }

      console.log(`🏠 Socket joined rooms: user:${sUserId}, role:${socket.userRole}${sTenantId ? `, tenant:${sTenantId}` : ''}`);
    }

    console.log(`🔌 New connection: ${socket.userEmail} (${socket.id})`);

    await this.auditLogger.log({
      action: 'socket_connected',
      userId: socket.userId,
      tenantId: socket.tenantId,
      metadata: connectionInfo
    });

    // Send connection confirmation
    socket.emit('connection_confirmed', {
      socketId: socket.id,
      userId: socket.userId,
      tenantId: socket.tenantId,
      connectedAt: connectionInfo.connectedAt
    });
  }

  /**
   * Set up socket event handlers
   */
  setupSocketEventHandlers(socket) {
    // Handle disconnection
    socket.on('disconnect', async (reason) => {
      await this.handleDisconnection(socket, reason);
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong');
      this.updateLastActivity(socket.id);
    });

    // Handle notification acknowledgment
    socket.on('notification_ack', async (data) => {
      await this.handleNotificationAck(socket, data);
    });

    // Handle subscription to notification channels
    socket.on('subscribe_channel', async (data) => {
      await this.handleChannelSubscription(socket, data);
    });

    // Handle unsubscription from notification channels
    socket.on('unsubscribe_channel', async (data) => {
      await this.handleChannelUnsubscription(socket, data);
    });

    // Handle user status updates
    socket.on('user_status', async (data) => {
      await this.handleUserStatusUpdate(socket, data);
    });

    // Handle error events
    socket.on('error', async (error) => {
      await this.handleSocketError(socket, error);
    });
  }

  /**
   * Handle disconnection
   */
  async handleDisconnection(socket, reason) {
    try {
      const connectionInfo = this.connections.get(socket.id);

      if (connectionInfo) {
        const sUserId = String(socket.userId);
        const sTenantId = socket.tenantId ? String(socket.tenantId) : null;

        // Remove from connections map
        this.connections.delete(socket.id);

        // Remove from user sockets map
        if (this.userSockets.has(sUserId)) {
          this.userSockets.get(sUserId).delete(socket.id);
          if (this.userSockets.get(sUserId).size === 0) {
            this.userSockets.delete(sUserId);
          }
        }

        // Remove from tenant sockets map (only if tenantId exists)
        if (sTenantId && this.tenantSockets.has(sTenantId)) {
          this.tenantSockets.get(sTenantId).delete(socket.id);
          if (this.tenantSockets.get(sTenantId).size === 0) {
            this.tenantSockets.delete(sTenantId);
          }
        }

        // Update statistics
        this.stats.activeConnections--;
        this.stats.disconnections++;

        const sessionDuration = Date.now() - connectionInfo.connectedAt.getTime();

        console.log(`🔌 Disconnected: ${socket.userEmail} (${socket.id}) - ${reason}`);

        await this.auditLogger.log({
          action: 'socket_disconnected',
          userId: socket.userId,
          tenantId: socket.tenantId,
          metadata: {
            socketId: socket.id,
            reason,
            sessionDuration,
            ...connectionInfo
          }
        });
      }

    } catch (error) {
      console.error('❌ Error handling disconnection:', error);
    }
  }

  /**
   * Handle notification acknowledgment
   */
  async handleNotificationAck(socket, data) {
    try {
      const { notificationId, acknowledged } = data;

      await this.auditLogger.log({
        action: 'notification_acknowledged',
        notificationId,
        userId: socket.userId,
        tenantId: socket.tenantId,
        metadata: {
          socketId: socket.id,
          acknowledged,
          acknowledgedAt: new Date()
        }
      });

      // Emit acknowledgment confirmation
      socket.emit('ack_confirmed', { notificationId, acknowledged });

    } catch (error) {
      console.error('❌ Error handling notification ack:', error);
      socket.emit('ack_error', { error: error.message });
    }
  }

  /**
   * Handle channel subscription
   */
  async handleChannelSubscription(socket, data) {
    try {
      const { channel } = data;

      // Validate channel access
      if (!this.validateChannelAccess(socket, channel)) {
        throw new Error('Access denied to channel');
      }

      await socket.join(channel);

      await this.auditLogger.log({
        action: 'channel_subscribed',
        userId: socket.userId,
        tenantId: socket.tenantId,
        metadata: {
          socketId: socket.id,
          channel
        }
      });

      socket.emit('subscription_confirmed', { channel });

    } catch (error) {
      console.error('❌ Error handling channel subscription:', error);
      socket.emit('subscription_error', { error: error.message });
    }
  }

  /**
   * Handle channel unsubscription
   */
  async handleChannelUnsubscription(socket, data) {
    try {
      const { channel } = data;

      await socket.leave(channel);

      await this.auditLogger.log({
        action: 'channel_unsubscribed',
        userId: socket.userId,
        tenantId: socket.tenantId,
        metadata: {
          socketId: socket.id,
          channel
        }
      });

      socket.emit('unsubscription_confirmed', { channel });

    } catch (error) {
      console.error('❌ Error handling channel unsubscription:', error);
      socket.emit('unsubscription_error', { error: error.message });
    }
  }

  /**
   * Handle user status updates
   */
  async handleUserStatusUpdate(socket, data) {
    try {
      const { status } = data; // online, away, busy, offline

      // Update connection info
      const connectionInfo = this.connections.get(socket.id);
      if (connectionInfo) {
        connectionInfo.userStatus = status;
        connectionInfo.lastActivity = new Date();
      }

      // Broadcast status to tenant
      socket.to(`tenant:${socket.tenantId}`).emit('user_status_changed', {
        userId: socket.userId,
        status,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('❌ Error handling user status update:', error);
    }
  }

  /**
   * Handle socket errors
   */
  async handleSocketError(socket, error) {
    console.error('❌ Socket error:', error);

    await this.auditLogger.log({
      action: 'socket_error',
      userId: socket.userId,
      tenantId: socket.tenantId,
      error: error.message,
      metadata: {
        socketId: socket.id
      }
    });
  }

  /**
   * Set up error handlers
   */
  setupErrorHandlers() {
    this.io.engine.on('connection_error', (error) => {
      console.error('❌ Connection error:', error);
    });
  }

  /**
   * Start connection monitoring
   */
  startConnectionMonitoring() {
    // Monitor connection health every 30 seconds
    setInterval(() => {
      this.monitorConnections();
    }, 30000);

    // Clean up stale connections every 5 minutes
    setInterval(() => {
      this.cleanupStaleConnections();
    }, 5 * 60 * 1000);
  }

  /**
   * Monitor connection health
   */
  monitorConnections() {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    let staleConnections = 0;

    for (const [socketId, connectionInfo] of this.connections.entries()) {
      if (now - connectionInfo.lastActivity.getTime() > staleThreshold) {
        staleConnections++;
      }
    }

    console.log(`📊 Connection Health: ${this.stats.activeConnections} active, ${staleConnections} stale`);
  }

  /**
   * Clean up stale connections
   */
  cleanupStaleConnections() {
    const now = Date.now();
    const staleThreshold = 10 * 60 * 1000; // 10 minutes
    const socketsToDisconnect = [];

    for (const [socketId, connectionInfo] of this.connections.entries()) {
      if (now - connectionInfo.lastActivity.getTime() > staleThreshold) {
        socketsToDisconnect.push(socketId);
      }
    }

    for (const socketId of socketsToDisconnect) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        console.log(`🧹 Disconnecting stale connection: ${socketId}`);
        socket.disconnect(true);
      }
    }
  }

  /**
   * Utility methods
   */
  extractToken(socket) {
    // Try to get token from modern auth object first
    if (socket.handshake.auth && socket.handshake.auth.token) {
      return socket.handshake.auth.token;
    }

    // Try to get token from query parameters (legacy fallback)
    if (socket.handshake.query && socket.handshake.query.token) {
      return socket.handshake.query.token;
    }

    // Try to get token from headers
    const authHeader = socket.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  validateChannelAccess(socket, channel) {
    // Basic channel access validation
    if (channel.startsWith('user:') && !channel.includes(socket.userId)) {
      return false;
    }

    if (channel.startsWith('tenant:') && !channel.includes(socket.tenantId)) {
      return false;
    }

    if (channel.startsWith('role:') && !channel.includes(socket.userRole)) {
      return false;
    }

    return true;
  }

  updateLastActivity(socketId) {
    const connectionInfo = this.connections.get(socketId);
    if (connectionInfo) {
      connectionInfo.lastActivity = new Date();
    }
  }

  /**
   * Public methods for notification engine
   */

  // Emit to specific user
  emitToUser(userId, event, data) {
    const sUserId = String(userId);
    if (this.userSockets.has(sUserId)) {
      this.io.to(`user:${sUserId}`).emit(event, data);
      return true;
    }
    return false;
  }

  // Emit to specific tenant
  emitToTenant(tenantId, event, data) {
    const sTenantId = String(tenantId);
    if (this.tenantSockets.has(sTenantId)) {
      this.io.to(`tenant:${sTenantId}`).emit(event, data);
      return true;
    }
    return false;
  }

  // Emit to specific role
  emitToRole(role, event, data) {
    this.io.to(`role:${role}`).emit(event, data);
  }

  // Emit to specific role within a tenant
  emitToTenantRole(tenantId, role, event, data) {
    this.io.to(`tenant:${tenantId}:role:${role}`).emit(event, data);
  }

  // Emit to all connections
  emitToAll(event, data) {
    this.io.emit(event, data);
  }

  // Get connection statistics
  getStatistics() {
    return {
      ...this.stats,
      activeConnections: this.connections.size,
      userConnections: this.userSockets.size,
      tenantConnections: this.tenantSockets.size
    };
  }

  // Get user connection status
  isUserConnected(userId) {
    return this.userSockets.has(userId) && this.userSockets.get(userId).size > 0;
  }

  // Get tenant connection status
  isTenantConnected(tenantId) {
    return this.tenantSockets.has(tenantId) && this.tenantSockets.get(tenantId).size > 0;
  }

  // Disconnect user
  async disconnectUser(userId, reason = 'admin_disconnect') {
    if (this.userSockets.has(userId)) {
      const socketIds = Array.from(this.userSockets.get(userId));
      for (const socketId of socketIds) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect(true);
        }
      }

      await this.auditLogger.log({
        action: 'user_disconnected_admin',
        userId,
        metadata: { reason, socketCount: socketIds.length }
      });
    }
  }

  /**
   * Shutdown the connection manager
   */
  async shutdown() {
    console.log('🛑 Shutting down SocketIOConnectionManager...');

    // Disconnect all clients
    this.io.disconnectSockets(true);

    // Close the server
    this.io.close();

    // Clear all maps
    this.connections.clear();
    this.userSockets.clear();
    this.tenantSockets.clear();

    await this.auditLogger.log({
      action: 'socketio_server_shutdown',
      metadata: { finalStats: this.stats }
    });

    console.log('✅ SocketIOConnectionManager shutdown complete');
  }
}

module.exports = { SocketIOConnectionManager };