const CenterAdmin = require('../models/CenterAdmin')
const AuditLog = require('../models/AuditLog')
const jwt = require('jsonwebtoken')
const mfaService = require('../services/mfaService')
const sessionService = require('../services/sessionService')
const { validationResult } = require('express-validator')

class CenterAdminAuthController {
  // Login - Step 1: Email & Password
  async login(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const { email, password } = req.body
      const ipAddress = req.ip || req.connection.remoteAddress || '127.0.0.1'

      // Find admin
      const admin = await CenterAdmin.findOne({ email: email.toLowerCase() })
      if (!admin) {
        sessionService.recordFailedAttempt(ipAddress)
        
        await AuditLog.logAction({
          userId: null,
          userType: 'center_admin',
          userEmail: email,
          action: 'failed_login',
          category: 'auth',
          description: 'Login attempt with invalid email',
          ipAddress,
          userAgent: req.get('User-Agent'),
          status: 'failure',
          riskLevel: 'medium',
          errorMessage: 'Invalid credentials'
        })

        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        })
      }

      // Check if account is locked
      if (admin.isLocked) {
        await AuditLog.logAction({
          userId: admin._id,
          userType: 'center_admin',
          userEmail: admin.email,
          action: 'failed_login',
          category: 'auth',
          description: 'Login attempt on locked account',
          ipAddress,
          userAgent: req.get('User-Agent'),
          status: 'failure',
          riskLevel: 'high',
          errorMessage: 'Account locked'
        })

        return res.status(423).json({
          success: false,
          message: 'Account is temporarily locked due to multiple failed login attempts'
        })
      }

      // Check if account is active
      if (!admin.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated'
        })
      }

      // Verify password
      const isValidPassword = await admin.comparePassword(password)
      if (!isValidPassword) {
        await admin.incLoginAttempts()
        sessionService.recordFailedAttempt(ipAddress)

        await AuditLog.logAction({
          userId: admin._id,
          userType: 'center_admin',
          userEmail: admin.email,
          action: 'failed_login',
          category: 'auth',
          description: 'Login attempt with invalid password',
          ipAddress,
          userAgent: req.get('User-Agent'),
          status: 'failure',
          riskLevel: 'medium',
          errorMessage: 'Invalid credentials'
        })

        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        })
      }

      // Reset login attempts on successful password verification
      await admin.resetLoginAttempts()

      // Check if MFA is enabled
      if (admin.mfa && admin.mfa.isEnabled) {
        // Send OTP for MFA
        const otpResult = await mfaService.sendOTP(admin.email, 'login')
        
        if (!otpResult.success) {
          return res.status(500).json({
            success: false,
            message: 'Failed to send verification code'
          })
        }

        // Generate temporary token for MFA verification
        const mfaToken = jwt.sign(
          { 
            adminId: admin._id,
            email: admin.email,
            step: 'mfa_pending'
          },
          process.env.JWT_SECRET,
          { expiresIn: '10m' }
        )

        return res.json({
          success: true,
          requiresMFA: true,
          mfaToken,
          message: 'Verification code sent to your email'
        })
      }

      // No MFA required - complete login
      const loginResult = await this.completeLogin(admin, req)
      return res.json(loginResult)

    } catch (error) {
      console.error('Login error:', error)
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      })
    }
  }

  // Login - Step 2: MFA Verification
  async verifyMFA(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const { mfaToken, otp, backupCode } = req.body

      // Verify MFA token
      let decoded
      try {
        decoded = jwt.verify(mfaToken, process.env.JWT_SECRET)
      } catch (error) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired MFA token'
        })
      }

      if (decoded.step !== 'mfa_pending') {
        return res.status(401).json({
          success: false,
          message: 'Invalid MFA token'
        })
      }

      // Find admin
      const admin = await CenterAdmin.findById(decoded.adminId)
      if (!admin) {
        return res.status(401).json({
          success: false,
          message: 'Admin not found'
        })
      }

      let verificationResult

      if (otp) {
        // Verify OTP
        verificationResult = mfaService.verifyOTP(admin.email, otp, 'login')
      } else if (backupCode) {
        // Verify backup code
        verificationResult = await mfaService.verifyBackupCode(admin, backupCode)
      } else {
        return res.status(400).json({
          success: false,
          message: 'OTP or backup code is required'
        })
      }

      if (!verificationResult.success) {
        const ipAddress = req.ip || req.connection.remoteAddress || '127.0.0.1'
        
        await AuditLog.logAction({
          userId: admin._id,
          userType: 'center_admin',
          userEmail: admin.email,
          action: 'failed_mfa',
          category: 'auth',
          description: 'Failed MFA verification',
          ipAddress,
          userAgent: req.get('User-Agent'),
          status: 'failure',
          riskLevel: 'high',
          errorMessage: verificationResult.message
        })

        return res.status(401).json(verificationResult)
      }

      // Update MFA last used
      admin.mfa.lastUsed = new Date()
      await admin.save()

      // Complete login
      const loginResult = await this.completeLogin(admin, req)
      return res.json(loginResult)

    } catch (error) {
      console.error('MFA verification error:', error)
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      })
    }
  }

  // Complete login process
  async completeLogin(admin, req) {
    try {
      // Create session
      const sessionResult = await sessionService.createSession(admin, req)

      // Generate JWT token
      const token = jwt.sign(
        {
          adminId: admin._id,
          email: admin.email,
          role: admin.role,
          sessionId: sessionResult.sessionId
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      )

      return {
        success: true,
        token,
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          permissions: admin.permissions,
          avatar: admin.avatar,
          mfaEnabled: admin.mfa ? admin.mfa.isEnabled : false
        },
        session: {
          sessionId: sessionResult.sessionId,
          location: sessionResult.location,
          isSuspicious: sessionResult.isSuspicious
        },
        message: 'Login successful'
      }
    } catch (error) {
      console.error('Complete login error:', error)
      throw error
    }
  }

  // Logout
  async logout(req, res) {
    try {
      const admin = req.admin
      const sessionId = req.sessionId

      if (sessionId) {
        await sessionService.terminateSession(admin, sessionId, 'logout')
      }

      return res.json({
        success: true,
        message: 'Logged out successfully'
      })
    } catch (error) {
      console.error('Logout error:', error)
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      })
    }
  }

  // Logout from all devices
  async logoutAll(req, res) {
    try {
      const admin = req.admin
      const currentSessionId = req.sessionId

      const result = await sessionService.terminateAllSessions(admin, currentSessionId)

      return res.json({
        success: true,
        message: `Logged out from ${result.terminatedCount} devices`,
        terminatedSessions: result.terminatedCount
      })
    } catch (error) {
      console.error('Logout all error:', error)
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      })
    }
  }

  // Get current admin profile
  async getProfile(req, res) {
    try {
      const admin = req.admin
      const activeSessions = sessionService.getActiveSessions(admin)

      return res.json({
        success: true,
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          permissions: admin.permissions,
          phone: admin.phone,
          avatar: admin.avatar,
          mfaEnabled: admin.mfa.isEnabled,
          lastLogin: admin.lastLogin,
          createdAt: admin.createdAt
        },
        sessions: activeSessions
      })
    } catch (error) {
      console.error('Get profile error:', error)
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      })
    }
  }

  // Enable MFA
  async enableMFA(req, res) {
    try {
      const admin = req.admin

      if (admin.mfa.isEnabled) {
        return res.status(400).json({
          success: false,
          message: 'MFA is already enabled'
        })
      }

      const result = await mfaService.enableMFA(admin)

      await AuditLog.logAction({
        userId: admin._id,
        userType: 'center_admin',
        userEmail: admin.email,
        action: 'enable_mfa',
        category: 'auth',
        description: 'MFA enabled',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        status: 'success',
        riskLevel: 'low'
      })

      return res.json({
        success: true,
        backupCodes: result.backupCodes,
        message: 'MFA enabled successfully. Please save your backup codes.'
      })
    } catch (error) {
      console.error('Enable MFA error:', error)
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      })
    }
  }

  // Disable MFA
  async disableMFA(req, res) {
    try {
      const admin = req.admin
      const { password } = req.body

      // Verify password before disabling MFA
      const isValidPassword = await admin.comparePassword(password)
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid password'
        })
      }

      if (!admin.mfa.isEnabled) {
        return res.status(400).json({
          success: false,
          message: 'MFA is not enabled'
        })
      }

      await mfaService.disableMFA(admin)

      await AuditLog.logAction({
        userId: admin._id,
        userType: 'center_admin',
        userEmail: admin.email,
        action: 'disable_mfa',
        category: 'auth',
        description: 'MFA disabled',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        status: 'success',
        riskLevel: 'medium'
      })

      return res.json({
        success: true,
        message: 'MFA disabled successfully'
      })
    } catch (error) {
      console.error('Disable MFA error:', error)
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      })
    }
  }
}

module.exports = new CenterAdminAuthController()