/**
 * SSE (Server-Sent Events) Service for Real-time Notifications
 * Manages client connections and broadcasts notifications
 */

class SSEService {
  constructor() {
    // Store active connections: Map<recipientId, Set<response>>
    this.connections = new Map();
  }

  /**
   * Add a new SSE connection
   */
  addConnection(recipientId, recipientType, res) {
    const key = `${recipientType}:${recipientId}`;
    
    if (!this.connections.has(key)) {
      this.connections.set(key, new Set());
    }
    
    this.connections.get(key).add(res);
    
    console.log(`SSE: Client connected - ${key} (Total: ${this.connections.get(key).size})`);
    
    // Send initial connection success
    this.sendToClient(res, { type: 'connected', message: 'SSE connection established' });
  }

  /**
   * Remove a connection
   */
  removeConnection(recipientId, recipientType, res) {
    const key = `${recipientType}:${recipientId}`;
    
    if (this.connections.has(key)) {
      this.connections.get(key).delete(res);
      
      // Clean up empty sets
      if (this.connections.get(key).size === 0) {
        this.connections.delete(key);
      }
      
      console.log(`SSE: Client disconnected - ${key}`);
    }
  }

  /**
   * Send data to a specific client
   */
  sendToClient(res, data) {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error('SSE: Error sending to client:', error.message);
    }
  }

  /**
   * Send notification to a specific recipient
   */
  sendToRecipient(recipientId, recipientType, notification) {
    const key = `${recipientType}:${recipientId}`;
    
    if (this.connections.has(key)) {
      const clients = this.connections.get(key);
      
      clients.forEach(res => {
        this.sendToClient(res, {
          type: 'notification',
          notification
        });
      });
      
      console.log(`SSE: Sent notification to ${clients.size} client(s) - ${key}`);
      return true;
    }
    
    return false;
  }

  /**
   * Send to all admins of a tenancy
   */
  sendToTenancyAdmins(tenancyId, notification) {
    let sent = 0;
    
    this.connections.forEach((clients, key) => {
      if (key.startsWith('admin:') || key.startsWith('branch_admin:')) {
        clients.forEach(res => {
          this.sendToClient(res, { type: 'notification', notification });
          sent++;
        });
      }
    });
    
    return sent;
  }

  /**
   * Send to all superadmins
   */
  sendToAllSuperAdmins(notification) {
    let sent = 0;
    
    this.connections.forEach((clients, key) => {
      if (key.startsWith('superadmin:')) {
        clients.forEach(res => {
          this.sendToClient(res, { type: 'notification', notification });
          sent++;
        });
      }
    });
    
    console.log(`SSE: Sent to ${sent} superadmin client(s)`);
    return sent;
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(notification) {
    let sent = 0;
    
    this.connections.forEach((clients) => {
      clients.forEach(res => {
        this.sendToClient(res, { type: 'notification', notification });
        sent++;
      });
    });
    
    return sent;
  }

  /**
   * Send heartbeat to keep connections alive
   */
  sendHeartbeat() {
    this.connections.forEach((clients) => {
      clients.forEach(res => {
        this.sendToClient(res, { type: 'heartbeat', timestamp: Date.now() });
      });
    });
  }

  /**
   * Get connection stats
   */
  getStats() {
    let totalConnections = 0;
    const byType = {};
    
    this.connections.forEach((clients, key) => {
      const [type] = key.split(':');
      totalConnections += clients.size;
      byType[type] = (byType[type] || 0) + clients.size;
    });
    
    return { totalConnections, byType, uniqueRecipients: this.connections.size };
  }
}

// Singleton instance
const sseService = new SSEService();

// Heartbeat every 30 seconds to keep connections alive
setInterval(() => {
  sseService.sendHeartbeat();
}, 30000);

module.exports = sseService;
