const CenterAdmin = require('../models/CenterAdmin')
const SuperAdmin = require('../models/SuperAdmin')
const AuditLog = require('../models/AuditLog')
const sessionService = require('../services/sessionService')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const { validationResult } = require('express-validator')
const { setSuperAdminAuthCookie, clearSuperAdminAuthCookie } = require('../utils/cookieConfig')
const { sendEmail } = require('../config/email')

class CenterAdminAuthController {
  // Login - Simplified version
  async login(req, res) {
    try {
      // Check MongoDB connection first
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState !== 1) {
        console.error('❌ MongoDB not connected, readyState:', mongoose.connection.readyState);
        return res.status(503).json({
          success: false,
          message: 'Database connection unavailable. Please try again.'
        });
      }

      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const { email, password, rememberMe } = req.body

      // Find admin by email - try SuperAdmin first, then CenterAdmin
      let admin = await SuperAdmin.findOne({ email })
        .populate('roles', 'name slug description color permissions')
        .maxTimeMS(5000) // 5 second timeout
      let adminType = 'superadmin'

      if (!admin) {
        admin = await CenterAdmin.findOne({ email })
          .populate('roles', 'name slug description color permissions')
          .maxTimeMS(5000) // 5 second timeout
        adminType = 'center_admin'
      }

      if (!admin) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        })
      }

      // Check if admin is active
      if (!admin.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated'
        })
      }

      // Check password
      const isValidPassword = await admin.comparePassword(password)
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        })
      }

      // Create session
      const sessionResult = await sessionService.createSession(admin, req)

      // Token expiry based on Remember Me
      // Remember Me: 30 days, Otherwise: 24 hours
      const tokenExpiry = rememberMe ? '30d' : '24h'

      // Generate JWT token with real session ID
      const token = jwt.sign(
        {
          adminId: admin._id,
          email: admin.email,
          role: admin.role,
          sessionId: sessionResult.sessionId,
          rememberMe: !!rememberMe
        },
        process.env.JWT_SECRET,
        { expiresIn: tokenExpiry }
      )

      // Set HTTP-only cookie with appropriate expiry
      const cookieMaxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : undefined // 30 days or session
      setSuperAdminAuthCookie(res, token, cookieMaxAge)

      // Update last login
      admin.lastLogin = new Date()
      admin.lastLoginIP = req.ip || req.connection.remoteAddress || '127.0.0.1'
      await admin.save()

      // Log successful login
      try {
        await AuditLog.logAction({
          userId: admin._id,
          userType: adminType,
          userEmail: admin.email,
          action: 'login',
          category: 'auth',
          description: `${adminType} login successful`,
          ipAddress: req.ip || '127.0.0.1',
          userAgent: req.get('User-Agent') || 'Unknown',
          status: 'success',
          riskLevel: 'low',
          metadata: {
            loginMethod: 'password',
            mfaUsed: false
          }
        })
      } catch (logError) {
        console.error('Failed to log login:', logError)
        // Don't fail login if logging fails
      }

      // Get effective permissions (combining role and user-specific permissions)
      const effectivePermissions = admin.getEffectivePermissions
        ? await admin.getEffectivePermissions()
        : admin.permissions;

      return res.json({
        success: true,
        token,
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          roles: admin.roles || [], // Add RBAC roles
          permissions: effectivePermissions,
          avatar: admin.avatar,
          mfaEnabled: admin.mfa ? admin.mfa.isEnabled : false
        },
        message: 'Login successful'
      })

    } catch (error) {
      console.error('Login error:', error)
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      })
    }
  }

  // Logout - Clear cookie
  async logout(req, res) {
    try {
      // Clear the auth cookie
      clearSuperAdminAuthCookie(res)

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

  // Get Profile
  async getProfile(req, res) {
    try {
      const admin = req.admin

      // Get effective permissions (combining role and user-specific permissions)
      const effectivePermissions = admin.getEffectivePermissions
        ? await admin.getEffectivePermissions()
        : admin.permissions;

      return res.json({
        success: true,
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          roles: admin.roles || [], // Add RBAC roles
          permissions: effectivePermissions,
          avatar: admin.avatar,
          mfaEnabled: admin.mfa ? admin.mfa.isEnabled : false,
          lastLogin: admin.lastLogin,
          createdAt: admin.createdAt
        }
      })
    } catch (error) {
      console.error('Get profile error:', error)
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      })
    }
  }

  // Verify MFA - Placeholder for future
  async verifyMFA(req, res) {
    return res.status(501).json({
      success: false,
      message: 'MFA not implemented in simplified version'
    })
  }

  // Logout All - Placeholder for future
  async logoutAll(req, res) {
    return res.json({
      success: true,
      message: 'Logged out from all devices'
    })
  }

  // Enable MFA - Placeholder for future
  async enableMFA(req, res) {
    return res.status(501).json({
      success: false,
      message: 'MFA not implemented in simplified version'
    })
  }

  // Disable MFA - Placeholder for future
  async disableMFA(req, res) {
    return res.status(501).json({
      success: false,
      message: 'MFA not implemented in simplified version'
    })
  }

  // Forgot Password - Send reset email
  async forgotPassword(req, res) {
    try {
      const { email } = req.body

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        })
      }

      // Find admin - try SuperAdmin first, then CenterAdmin
      let admin = await SuperAdmin.findOne({ email: email.toLowerCase() })
      let adminModel = SuperAdmin

      if (!admin) {
        admin = await CenterAdmin.findOne({ email: email.toLowerCase() })
        adminModel = CenterAdmin
      }

      // Always return success for security (don't reveal if email exists)
      if (!admin) {
        return res.json({
          success: true,
          message: 'If an account exists with this email, a password reset link has been sent.'
        })
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex')
      const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex')

      // Save hashed token to database with 1 hour expiry
      admin.resetPasswordToken = resetTokenHash
      admin.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
      await admin.save()

      // Create reset URL
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
      const resetUrl = `${frontendUrl}/superadmin/auth/reset-password?token=${resetToken}`

      // Send email
      try {
        const emailResult = await sendEmail({
          from: process.env.EMAIL_USER,
          to: admin.email,
          subject: 'Password Reset Request - LaundryLobby Admin',
          html: `
            <div style="font-family: 'Roboto', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #7c3aed; font-family: 'Poppins', sans-serif;">LaundryLobby</h1>
              </div>
              
              <h2 style="color: #1f2937; font-family: 'Poppins', sans-serif;">Password Reset Request</h2>
              
              <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
                Hello ${admin.name},
              </p>
              
              <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
                We received a request to reset your password. Click the button below to set a new password:
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" 
                   style="background: linear-gradient(to right, #7c3aed, #ec4899); 
                          color: white; 
                          padding: 14px 32px; 
                          text-decoration: none; 
                          border-radius: 8px; 
                          font-weight: 600;
                          font-family: 'Poppins', sans-serif;
                          display: inline-block;">
                  Reset Password
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
                This link will expire in <strong>1 hour</strong>.
              </p>
              
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
                If you didn't request this password reset, please ignore this email or contact support if you have concerns.
              </p>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
              
              <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                This is an automated message from LaundryLobby. Please do not reply to this email.
              </p>
            </div>
          `
        })

        if (!emailResult.success) {
          throw new Error(emailResult.error || 'Failed to send email')
        }
      } catch (emailError) {
        console.error('Failed to send reset email:', emailError)
        // Clear the token if email fails
        admin.resetPasswordToken = undefined
        admin.resetPasswordExpires = undefined
        await admin.save()

        return res.status(500).json({
          success: false,
          message: 'Failed to send reset email. Please try again.'
        })
      }

      // Log the action
      try {
        await AuditLog.logAction({
          userId: admin._id,
          userType: admin.role,
          userEmail: admin.email,
          action: 'password_reset_requested',
          category: 'auth',
          description: 'Password reset email sent',
          ipAddress: req.ip || '127.0.0.1',
          userAgent: req.get('User-Agent') || 'Unknown',
          status: 'success',
          riskLevel: 'medium'
        })
      } catch (logError) {
        console.error('Failed to log action:', logError)
      }

      return res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.'
      })

    } catch (error) {
      console.error('Forgot password error:', error)
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      })
    }
  }

  // Reset Password - Set new password with token
  async resetPassword(req, res) {
    try {
      const { token, password } = req.body

      if (!token || !password) {
        return res.status(400).json({
          success: false,
          message: 'Token and password are required'
        })
      }

      // Validate password strength
      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters'
        })
      }

      if (!/[A-Z]/.test(password)) {
        return res.status(400).json({
          success: false,
          message: 'Password must contain at least one uppercase letter'
        })
      }

      if (!/[0-9]/.test(password)) {
        return res.status(400).json({
          success: false,
          message: 'Password must contain at least one number'
        })
      }

      // Hash the token to compare with stored hash
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

      // Find admin with valid token - try SuperAdmin first
      let admin = await SuperAdmin.findOne({
        resetPasswordToken: tokenHash,
        resetPasswordExpires: { $gt: Date.now() }
      })

      if (!admin) {
        admin = await CenterAdmin.findOne({
          resetPasswordToken: tokenHash,
          resetPasswordExpires: { $gt: Date.now() }
        })
      }

      if (!admin) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset token'
        })
      }

      // Update password (will be hashed by pre-save middleware)
      admin.password = password
      admin.resetPasswordToken = undefined
      admin.resetPasswordExpires = undefined

      // Clear all sessions for security
      if (admin.sessions) {
        admin.sessions = []
      }

      await admin.save()

      // Log the action
      try {
        await AuditLog.logAction({
          userId: admin._id,
          userType: admin.role,
          userEmail: admin.email,
          action: 'password_reset_completed',
          category: 'auth',
          description: 'Password reset successful',
          ipAddress: req.ip || '127.0.0.1',
          userAgent: req.get('User-Agent') || 'Unknown',
          status: 'success',
          riskLevel: 'high'
        })
      } catch (logError) {
        console.error('Failed to log action:', logError)
      }

      return res.json({
        success: true,
        message: 'Password reset successful. Please login with your new password.'
      })

    } catch (error) {
      console.error('Reset password error:', error)
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      })
    }
  }

  // Refresh Session - Extend session on activity
  async refreshSession(req, res) {
    try {
      const admin = req.admin

      // Update last activity
      admin.lastActivity = new Date()
      await admin.save()

      return res.json({
        success: true,
        message: 'Session refreshed'
      })
    } catch (error) {
      console.error('Refresh session error:', error)
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      })
    }
  }
}

module.exports = new CenterAdminAuthController()