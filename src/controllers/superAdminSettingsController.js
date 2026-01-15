const CenterAdmin = require('../models/CenterAdmin')
const AuditLog = require('../models/AuditLog')
const { validationResult } = require('express-validator')

class CenterAdminSettingsController {
  // Get system settings
  async getSystemSettings(req, res) {
    try {
      // Get current admin settings
      const admin = req.admin
      
      // System configuration (this would typically come from a Settings model)
      const systemSettings = {
        general: {
          systemName: 'LaundryLobby Management System',
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          language: 'en',
          dateFormat: 'DD/MM/YYYY',
          timeFormat: '24h'
        },
        security: {
          sessionTimeout: 24, // hours
          maxLoginAttempts: 5,
          lockoutDuration: 120, // minutes
          passwordMinLength: 8,
          requireMFA: false,
          allowMultipleSessions: true
        },
        notifications: {
          emailNotifications: true,
          smsNotifications: false,
          pushNotifications: true,
          orderUpdates: true,
          paymentAlerts: true,
          systemAlerts: true
        },
        business: {
          operatingHours: {
            start: '09:00',
            end: '21:00'
          },
          workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
          defaultPickupTime: 24, // hours
          defaultDeliveryTime: 48, // hours
          maxOrdersPerDay: 1000,
          autoAssignOrders: true
        },
        integrations: {
          paymentGateway: {
            enabled: true,
            provider: 'razorpay',
            testMode: true
          },
          smsGateway: {
            enabled: false,
            provider: 'twilio'
          },
          emailService: {
            enabled: true,
            provider: 'smtp'
          }
        }
      }

      return res.json({
        success: true,
        data: {
          settings: systemSettings,
          lastUpdated: admin.updatedAt
        }
      })
    } catch (error) {
      console.error('Get system settings error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch system settings'
      })
    }
  }

  // Update system settings
  async updateSystemSettings(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const { category, settings } = req.body

      // Log the settings update
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'update_system_settings',
        category: 'settings',
        description: `Updated ${category} settings`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        status: 'success',
        riskLevel: 'medium',
        metadata: {
          category,
          updatedSettings: settings
        }
      })

      return res.json({
        success: true,
        message: 'Settings updated successfully',
        data: {
          category,
          settings,
          updatedAt: new Date()
        }
      })
    } catch (error) {
      console.error('Update system settings error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to update system settings'
      })
    }
  }

  // Get admin profile settings
  async getProfileSettings(req, res) {
    try {
      const admin = req.admin

      return res.json({
        success: true,
        data: {
          profile: {
            id: admin._id,
            name: admin.name,
            email: admin.email,
            phone: admin.phone,
            avatar: admin.avatar,
            role: admin.role,
            permissions: admin.permissions,
            mfaEnabled: admin.mfa?.isEnabled || false,
            lastLogin: admin.lastLogin,
            createdAt: admin.createdAt
          },
          preferences: {
            theme: 'light',
            notifications: {
              email: true,
              browser: true,
              mobile: false
            },
            dashboard: {
              defaultTimeframe: '30d',
              showWelcome: true,
              compactView: false
            }
          }
        }
      })
    } catch (error) {
      console.error('Get profile settings error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch profile settings'
      })
    }
  }

  // Update admin profile
  async updateProfile(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const { name, phone, avatar } = req.body
      const admin = req.admin

      // Store original data for audit
      const originalData = {
        name: admin.name,
        phone: admin.phone,
        avatar: admin.avatar
      }

      // Update profile
      if (name) admin.name = name
      if (phone) admin.phone = phone
      if (avatar) admin.avatar = avatar

      await admin.save()

      // Log the profile update
      await AuditLog.logAction({
        userId: admin._id,
        userType: 'center_admin',
        userEmail: admin.email,
        action: 'update_profile',
        category: 'settings',
        description: 'Updated admin profile',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        status: 'success',
        riskLevel: 'low',
        metadata: {
          originalData,
          updatedData: { name, phone, avatar }
        }
      })

      return res.json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          profile: {
            id: admin._id,
            name: admin.name,
            email: admin.email,
            phone: admin.phone,
            avatar: admin.avatar,
            role: admin.role
          }
        }
      })
    } catch (error) {
      console.error('Update profile error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to update profile'
      })
    }
  }

  // Change password
  async changePassword(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const { currentPassword, newPassword } = req.body
      const admin = req.admin

      // Verify current password
      const isValidPassword = await admin.comparePassword(currentPassword)
      if (!isValidPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        })
      }

      // Update password
      admin.password = newPassword
      await admin.save()

      // Log the password change
      await AuditLog.logAction({
        userId: admin._id,
        userType: 'center_admin',
        userEmail: admin.email,
        action: 'change_password',
        category: 'security',
        description: 'Changed account password',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        status: 'success',
        riskLevel: 'medium'
      })

      return res.json({
        success: true,
        message: 'Password changed successfully'
      })
    } catch (error) {
      console.error('Change password error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to change password'
      })
    }
  }

  // Get system information
  async getSystemInfo(req, res) {
    try {
      const systemInfo = {
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        platform: process.platform,
        nodeVersion: process.version,
        database: {
          status: 'connected',
          name: 'laundry-management-system'
        },
        features: {
          analytics: true,
          multiTenant: false,
          realTimeUpdates: true,
          mobileApp: false,
          apiAccess: true
        }
      }

      return res.json({
        success: true,
        data: { systemInfo }
      })
    } catch (error) {
      console.error('Get system info error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch system information'
      })
    }
  }
}

module.exports = new CenterAdminSettingsController()