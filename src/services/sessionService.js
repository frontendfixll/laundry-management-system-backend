const crypto = require('crypto')
const geoip = require('geoip-lite')
const AuditLog = require('../models/AuditLog')

class SessionService {
  constructor() {
    this.suspiciousIPs = new Set()
    this.ipAttempts = new Map() // Track login attempts per IP
  }

  // Generate session ID
  generateSessionId() {
    return crypto.randomBytes(32).toString('hex')
  }

  // Get location from IP
  getLocationFromIP(ip) {
    try {
      // Skip localhost and private IPs
      if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        return { country: 'Local', city: 'Local' }
      }

      const geo = geoip.lookup(ip)
      if (geo) {
        return {
          country: geo.country,
          city: geo.city,
          coordinates: {
            lat: geo.ll[0],
            lng: geo.ll[1]
          }
        }
      }
    } catch (error) {
      console.error('Error getting location:', error)
    }
    
    return { country: 'Unknown', city: 'Unknown' }
  }

  // Check if IP is suspicious
  isSuspiciousIP(ip, admin) {
    // Check if IP is in suspicious list
    if (this.suspiciousIPs.has(ip)) {
      return true
    }

    // Check if IP has too many failed attempts
    const attempts = this.ipAttempts.get(ip) || { count: 0, lastAttempt: 0 }
    if (attempts.count >= 5 && Date.now() - attempts.lastAttempt < 60 * 60 * 1000) { // 1 hour
      return true
    }

    // Check if IP is different from last known good IP
    if (admin.lastLoginIP && admin.lastLoginIP !== ip) {
      const lastLocation = this.getLocationFromIP(admin.lastLoginIP)
      const currentLocation = this.getLocationFromIP(ip)
      
      // Flag if country is different
      if (lastLocation.country !== currentLocation.country && 
          lastLocation.country !== 'Unknown' && 
          currentLocation.country !== 'Unknown') {
        return true
      }
    }

    return false
  }

  // Record failed login attempt
  recordFailedAttempt(ip) {
    const attempts = this.ipAttempts.get(ip) || { count: 0, lastAttempt: 0 }
    attempts.count++
    attempts.lastAttempt = Date.now()
    this.ipAttempts.set(ip, attempts)

    // Add to suspicious IPs if too many attempts
    if (attempts.count >= 5) {
      this.suspiciousIPs.add(ip)
    }
  }

  // Clear failed attempts for IP
  clearFailedAttempts(ip) {
    this.ipAttempts.delete(ip)
    this.suspiciousIPs.delete(ip)
  }

  // Create session
  async createSession(admin, req) {
    try {
      const sessionId = this.generateSessionId()
      const ipAddress = req.ip || req.connection.remoteAddress || '127.0.0.1'
      const userAgent = req.get('User-Agent') || 'Unknown'
      const location = this.getLocationFromIP(ipAddress)

      // Check for suspicious activity (simplified)
      const isSuspicious = false // Simplified for now
      
      // Add session to admin
      await admin.addSession({
        sessionId,
        ipAddress,
        userAgent,
        location: `${location.city}, ${location.country}`
      })

      // Update last login info
      admin.lastLogin = new Date()
      admin.lastLoginIP = ipAddress
      await admin.save()

      // Clear failed attempts for this IP
      this.clearFailedAttempts(ipAddress)

      // Log successful login
      await AuditLog.logAction({
        who: admin.email,
        whoId: admin._id,
        role: AuditLog.mapUserTypeToRole(admin.role) || 'Tenant Admin',
        action: 'LOGIN',
        entity: 'User',
        entityId: admin._id.toString(),
        tenantId: admin.tenancyId || null,
        tenantName: admin.tenancyId ? 'Tenant' : 'Platform',
        ipAddress,
        userAgent,
        outcome: 'success',
        severity: isSuspicious ? 'medium' : 'low',
        details: {
          sessionId,
          location,
          isSuspicious,
          userType: 'center_admin'
        },
        sessionId,
        complianceFlags: ['GDPR']
      })

      return {
        sessionId,
        location,
        isSuspicious
      }
    } catch (error) {
      console.error('Failed to create session:', error)
      throw new Error('Failed to create session')
    }
  }

  // Validate session
  async validateSession(admin, sessionId, req) {
    try {
      const session = admin.sessions.find(s => s.sessionId === sessionId && s.isActive)
      
      if (!session) {
        return { valid: false, reason: 'Session not found' }
      }

      if (session.expiresAt < new Date()) {
        // Remove expired session
        await admin.removeSession(sessionId)
        return { valid: false, reason: 'Session expired' }
      }

      // Update last activity
      session.lastActivity = new Date()
      await admin.save()

      // Check for IP changes (optional security check)
      const currentIP = req.ip || req.connection.remoteAddress || '127.0.0.1'
      if (session.ipAddress !== currentIP) {
        // Log IP change
        await AuditLog.logAction({
          who: admin.email,
          whoId: admin._id,
          role: AuditLog.mapUserTypeToRole(admin.role) || 'Tenant Admin',
          action: 'SUSPICIOUS_ACTIVITY',
          entity: 'User',
          entityId: admin._id.toString(),
          tenantId: admin.tenancyId || null,
          tenantName: admin.tenancyId ? 'Tenant' : 'Platform',
          ipAddress: currentIP,
          userAgent: req.get('User-Agent') || 'Unknown',
          outcome: 'warning',
          severity: 'medium',
          details: {
            description: 'IP address changed during session',
            originalIP: session.ipAddress,
            newIP: currentIP,
            sessionId
          },
          sessionId,
          complianceFlags: ['GDPR']
        })
      }

      return { valid: true, session }
    } catch (error) {
      console.error('Failed to validate session:', error)
      return { valid: false, reason: 'Validation error' }
    }
  }

  // Terminate session
  async terminateSession(admin, sessionId, reason = 'logout') {
    try {
      const session = admin.sessions.find(s => s.sessionId === sessionId)
      
      if (session) {
        await admin.removeSession(sessionId)
        
        // Log session termination
        await AuditLog.logAction({
          who: admin.email,
          whoId: admin._id,
          role: AuditLog.mapUserTypeToRole(admin.role) || 'Tenant Admin',
          action: 'LOGOUT',
          entity: 'User',
          entityId: admin._id.toString(),
          tenantId: admin.tenancyId || null,
          tenantName: admin.tenancyId ? 'Tenant' : 'Platform',
          ipAddress: session.ipAddress,
          userAgent: 'Unknown',
          outcome: 'success',
          severity: 'low',
          details: {
            description: `Session terminated: ${reason}`,
            reason,
            sessionId
          },
          sessionId,
          complianceFlags: ['GDPR']
        })
      }

      return { success: true }
    } catch (error) {
      console.error('Failed to terminate session:', error)
      throw new Error('Failed to terminate session')
    }
  }

  // Terminate all sessions
  async terminateAllSessions(admin, keepCurrentSession = null) {
    try {
      const sessionsToTerminate = admin.sessions.filter(s => 
        keepCurrentSession ? s.sessionId !== keepCurrentSession : true
      )

      for (const session of sessionsToTerminate) {
        await this.terminateSession(admin, session.sessionId, 'force_logout')
      }

      return { success: true, terminatedCount: sessionsToTerminate.length }
    } catch (error) {
      console.error('Failed to terminate all sessions:', error)
      throw new Error('Failed to terminate sessions')
    }
  }

  // Clean expired sessions (run periodically)
  async cleanExpiredSessions() {
    try {
      const CenterAdmin = require('../models/CenterAdmin')
      const admins = await CenterAdmin.find({ 'sessions.0': { $exists: true } })

      for (const admin of admins) {
        await admin.cleanExpiredSessions()
      }

      console.log('Cleaned expired sessions for all admins')
    } catch (error) {
      console.error('Failed to clean expired sessions:', error)
    }
  }

  // Get active sessions for admin
  getActiveSessions(admin) {
    return admin.sessions
      .filter(s => s.isActive && s.expiresAt > new Date())
      .map(s => ({
        sessionId: s.sessionId,
        ipAddress: s.ipAddress,
        location: s.location,
        userAgent: s.userAgent,
        lastActivity: s.lastActivity,
        createdAt: s.createdAt
      }))
  }
}

module.exports = new SessionService()