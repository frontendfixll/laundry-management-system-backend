const EventEmitter = require('events');

class SSEService extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map(); // userId -> Set of response objects
    this.heartbeatInterval = 30000; // 30 seconds
    this.startHeartbeat();
  }

  /**
   * Add SSE connection for a user
   */
  addConnection(userId, recipientType, res) {
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    
    this.connections.get(userId).add(res);
    
    console.log(`SSE connection added for user ${userId} (${recipientType}). Total connections: ${this.getTotalConnections()}`);
    
    // Send initial connection confirmation
    this.sendToConnection(res, {
      type: 'connection',
      message: 'Connected to notification stream',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Remove SSE connection for a user
   */
  removeConnection(userId, recipientType, res) {
    if (this.connections.has(userId)) {
      this.connections.get(userId).delete(res);
      
      // Clean up empty sets
      if (this.connections.get(userId).size === 0) {
        this.connections.delete(userId);
      }
    }
    
    console.log(`SSE connection removed for user ${userId} (${recipientType}). Total connections: ${this.getTotalConnections()}`);
  }

  /**
   * Send notification to specific user
   */
  sendToUser(userId, notification) {
    if (!this.connections.has(userId)) {
      console.log(`No SSE connections for user ${userId}`);
      return false;
    }

    const userConnections = this.connections.get(userId);
    let sentCount = 0;
    const deadConnections = new Set();

    for (const res of userConnections) {
      try {
        if (this.sendToConnection(res, notification)) {
          sentCount++;
        } else {
          deadConnections.add(res);
        }
      } catch (error) {
        console.error(`Error sending to connection for user ${userId}:`, error);
        deadConnections.add(res);
      }
    }

    // Clean up dead connections
    deadConnections.forEach(res => {
      userConnections.delete(res);
    });

    if (userConnections.size === 0) {
      this.connections.delete(userId);
    }

    console.log(`Sent notification to ${sentCount} connections for user ${userId}`);
    return sentCount > 0;
  }

  /**
   * Send data to a specific connection
   */
  sendToConnection(res, data) {
    try {
      if (res.destroyed || res.finished) {
        return false;
      }

      const sseData = `data: ${JSON.stringify(data)}\n\n`;
      res.write(sseData);
      return true;
    } catch (error) {
      console.error('Error writing to SSE connection:', error);
      return false;
    }
  }

  /**
   * Broadcast to all connections
   */
  broadcast(notification) {
    let totalSent = 0;
    
    for (const [userId, connections] of this.connections) {
      if (this.sendToUser(userId, notification)) {
        totalSent++;
      }
    }
    
    return totalSent;
  }

  /**
   * Send heartbeat to all connections to keep them alive
   */
  startHeartbeat() {
    setInterval(() => {
      const heartbeat = {
        type: 'heartbeat',
        timestamp: new Date().toISOString()
      };
      
      let activeConnections = 0;
      const deadUsers = [];
      
      for (const [userId, connections] of this.connections) {
        const deadConnections = new Set();
        
        for (const res of connections) {
          try {
            if (res.destroyed || res.finished) {
              deadConnections.add(res);
            } else {
              this.sendToConnection(res, heartbeat);
              activeConnections++;
            }
          } catch (error) {
            deadConnections.add(res);
          }
        }
        
        // Clean up dead connections
        deadConnections.forEach(res => connections.delete(res));
        
        if (connections.size === 0) {
          deadUsers.push(userId);
        }
      }
      
      // Clean up users with no connections
      deadUsers.forEach(userId => this.connections.delete(userId));
      
      if (activeConnections > 0) {
        console.log(`Heartbeat sent to ${activeConnections} active SSE connections`);
      }
    }, this.heartbeatInterval);
  }

  /**
   * Get total number of active connections
   */
  getTotalConnections() {
    let total = 0;
    for (const connections of this.connections.values()) {
      total += connections.size;
    }
    return total;
  }

  /**
   * Get connection stats
   */
  getStats() {
    const stats = {
      totalUsers: this.connections.size,
      totalConnections: this.getTotalConnections(),
      userConnections: {}
    };
    
    for (const [userId, connections] of this.connections) {
      stats.userConnections[userId] = connections.size;
    }
    
    return stats;
  }

  /**
   * Close all connections
   */
  closeAllConnections() {
    for (const [userId, connections] of this.connections) {
      for (const res of connections) {
        try {
          res.end();
        } catch (error) {
          console.error(`Error closing connection for user ${userId}:`, error);
        }
      }
    }
    this.connections.clear();
  }
}

// Create singleton instance
const sseService = new SSEService();

module.exports = sseService;