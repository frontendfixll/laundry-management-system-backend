const User = require('../models/User')
const Branch = require('../models/Branch')
const AdminInvitation = require('../models/AdminInvitation')
const bcrypt = require('bcryptjs')
const { sendEmail, emailTemplates } = require('../config/email')

// Helper to check if at least one permission is assigned
const hasAtLeastOnePermission = (permissions) => {
  if (!permissions || typeof permissions !== 'object') return false
  
  for (const module of Object.values(permissions)) {
    if (typeof module === 'object' && module !== null) {
      for (const value of Object.values(module)) {
        if (value === true) return true
      }
    }
  }
  return false
}

// Helper to count permissions
const countPermissions = (permissions) => {
  let modules = 0
  let totalPermissions = 0
  
  if (!permissions || typeof permissions !== 'object') {
    return { modules: 0, totalPermissions: 0 }
  }
  
  for (const [moduleName, modulePerms] of Object.entries(permissions)) {
    if (typeof modulePerms === 'object' && modulePerms !== null) {
      let moduleHasPermission = false
      for (const value of Object.values(modulePerms)) {
        if (value === true) {
          totalPermissions++
          moduleHasPermission = true
        }
      }
      if (moduleHasPermission) modules++
    }
  }
  
  return { modules, totalPermissions }
}

const centerAdminAdminsController = {
  // Get all admins (only branch admins - not tenancy owners)
  getAllAdmins: async (req, res) => {
    try {
      // Only fetch admins who are assigned to a branch (branch admins)
      // Tenancy owners are managed in the Tenancies section
      const admins = await User.find({ 
        role: 'admin',
        assignedBranch: { $exists: true, $ne: null }  // Only branch admins
      })
      .select('-password')
      .populate('assignedBranch', 'name code')
      .sort({ createdAt: -1 })
      .lean()

      // Add permission summary to each admin
      const adminsWithSummary = admins.map(admin => ({
        ...admin,
        permissionSummary: countPermissions(admin.permissions)
      }))

      res.json({
        success: true,
        data: { admins: adminsWithSummary }
      })
    } catch (error) {
      console.error('Get admins error:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to fetch admins'
      })
    }
  },

  // Get admin by ID
  getAdminById: async (req, res) => {
    try {
      const { adminId } = req.params

      const admin = await User.findById(adminId)
        .select('-password')
        .populate('assignedBranch', 'name code')
        .lean()

      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        })
      }

      res.json({
        success: true,
        data: { 
          admin: {
            ...admin,
            permissionSummary: countPermissions(admin.permissions)
          }
        }
      })
    } catch (error) {
      console.error('Get admin by ID error:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to fetch admin'
      })
    }
  },

  // Create new admin (always creates 'admin' role with branch assignment)
  createAdmin: async (req, res) => {
    try {
      const { name, email, phone, password, permissions, assignedBranch } = req.body

      // Validate required fields
      if (!name || !email || !phone || !password) {
        return res.status(400).json({
          success: false,
          message: 'Name, email, phone, and password are required'
        })
      }

      // Check if email already exists
      const existingUser = await User.findOne({ email })
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already registered'
        })
      }

      // Validate permissions
      if (!hasAtLeastOnePermission(permissions)) {
        return res.status(400).json({
          success: false,
          message: 'At least one permission must be assigned'
        })
      }

      // Admin must be assigned to a branch
      if (!assignedBranch) {
        return res.status(400).json({
          success: false,
          message: 'Admin must be assigned to a branch'
        })
      }

      const branch = await Branch.findById(assignedBranch)
      if (!branch) {
        return res.status(400).json({
          success: false,
          message: 'Invalid branch ID'
        })
      }

      // Hash password
      const salt = await bcrypt.genSalt(10)
      const hashedPassword = await bcrypt.hash(password, salt)

      // Create admin (always 'admin' role)
      const admin = new User({
        name,
        email,
        phone,
        password: hashedPassword,
        role: 'admin',  // Always admin role
        permissions,
        assignedBranch,
        isActive: true,
        isEmailVerified: true  // Admin created by superadmin is auto-verified
      })

      await admin.save()

      // Return admin without password
      const adminResponse = admin.toObject()
      delete adminResponse.password

      res.status(201).json({
        success: true,
        message: 'Admin created successfully',
        data: { admin: adminResponse }
      })
    } catch (error) {
      console.error('Create admin error:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to create admin'
      })
    }
  },


  // Update admin permissions
  updatePermissions: async (req, res) => {
    try {
      const { adminId } = req.params
      const { permissions } = req.body

      // Validate permissions
      if (!hasAtLeastOnePermission(permissions)) {
        return res.status(400).json({
          success: false,
          message: 'At least one permission must be assigned'
        })
      }

      const admin = await User.findById(adminId)
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        })
      }

      // Update permissions
      admin.permissions = permissions
      await admin.save()

      // Notify admin about permission update via WebSocket
      const PermissionSyncService = require('../services/permissionSyncService');
      await PermissionSyncService.notifyPermissionUpdate(adminId, {
        permissions: admin.permissions,
        tenancy: admin.tenancy,
        recipientType: 'admin'
      });
      console.log('📢 Notified admin about permission update via WebSocket');

      res.json({
        success: true,
        message: 'Permissions updated successfully',
        data: { 
          admin: {
            _id: admin._id,
            permissions: admin.permissions,
            permissionSummary: countPermissions(admin.permissions)
          }
        }
      })
    } catch (error) {
      console.error('Update permissions error:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to update permissions'
      })
    }
  },

  // Deactivate admin
  deactivateAdmin: async (req, res) => {
    try {
      const { adminId } = req.params

      const admin = await User.findById(adminId)
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        })
      }

      admin.isActive = false
      await admin.save()

      res.json({
        success: true,
        message: 'Admin deactivated successfully'
      })
    } catch (error) {
      console.error('Deactivate admin error:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to deactivate admin'
      })
    }
  },

  // Reactivate admin
  reactivateAdmin: async (req, res) => {
    try {
      const { adminId } = req.params

      const admin = await User.findById(adminId)
      if (!admin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        })
      }

      admin.isActive = true
      await admin.save()

      res.json({
        success: true,
        message: 'Admin reactivated successfully'
      })
    } catch (error) {
      console.error('Reactivate admin error:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to reactivate admin'
      })
    }
  },

  // Invite Admin (invitation-based flow - always creates 'admin' role)
  inviteAdmin: async (req, res) => {
    try {
      const { email, permissions, assignedBranch } = req.body

      // Validate required fields
      if (!email || !permissions) {
        return res.status(400).json({
          success: false,
          message: 'Email and permissions are required'
        })
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        })
      }

      // Check if email already exists as admin
      const existingAdmin = await User.findOne({ 
        email: email.toLowerCase(),
        role: 'admin'
      })
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          message: 'This email is already registered as an admin'
        })
      }

      // Check if pending invitation exists
      const existingInvitation = await AdminInvitation.findOne({ 
        email: email.toLowerCase(), 
        status: 'pending' 
      })
      if (existingInvitation) {
        return res.status(400).json({
          success: false,
          message: 'Invitation already sent to this email'
        })
      }

      // Validate permissions
      if (!hasAtLeastOnePermission(permissions)) {
        return res.status(400).json({
          success: false,
          message: 'At least one permission must be assigned'
        })
      }

      // Admin must be assigned to a branch
      if (!assignedBranch) {
        return res.status(400).json({
          success: false,
          message: 'Admin must be assigned to a branch'
        })
      }

      const branch = await Branch.findById(assignedBranch)
      if (!branch) {
        return res.status(400).json({
          success: false,
          message: 'Invalid branch ID'
        })
      }

      // Generate invitation token
      const invitationToken = AdminInvitation.generateToken()

      // Create invitation (expires in 48 hours) - always 'admin' role
      const invitation = new AdminInvitation({
        email: email.toLowerCase(),
        role: 'admin',  // Always admin role
        permissions,
        assignedBranch,
        invitationToken,
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours
        invitedBy: req.admin._id,
        invitedByModel: 'SuperAdmin'
      })

      await invitation.save()

      // Send invitation email
      const inviterName = req.admin.name || 'LaundryLobby Admin'
      const emailOptions = emailTemplates.adminInvitation(invitation, inviterName)
      const emailResult = await sendEmail(emailOptions)

      if (!emailResult.success) {
        // Delete invitation if email fails
        await AdminInvitation.findByIdAndDelete(invitation._id)
        return res.status(500).json({
          success: false,
          message: 'Failed to send invitation email'
        })
      }

      res.status(201).json({
        success: true,
        message: 'Invitation sent successfully',
        data: {
          invitation: {
            id: invitation._id,
            email: invitation.email,
            role: invitation.role,
            status: invitation.status,
            expiresAt: invitation.expiresAt
          }
        }
      })
    } catch (error) {
      console.error('Invite admin error:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to send invitation'
      })
    }
  },

  // Get all invitations
  getInvitations: async (req, res) => {
    try {
      // Mark expired invitations
      await AdminInvitation.markExpired()

      const invitations = await AdminInvitation.find()
        .populate('assignedBranch', 'name code')
        .sort({ createdAt: -1 })

      res.json({
        success: true,
        data: { invitations }
      })
    } catch (error) {
      console.error('Get invitations error:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to fetch invitations'
      })
    }
  },

  // Resend invitation
  resendInvitation: async (req, res) => {
    try {
      const { invitationId } = req.params

      const invitation = await AdminInvitation.findById(invitationId)
      if (!invitation) {
        return res.status(404).json({
          success: false,
          message: 'Invitation not found'
        })
      }

      if (invitation.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Can only resend pending invitations'
        })
      }

      // Generate new token and extend expiry
      invitation.invitationToken = AdminInvitation.generateToken()
      invitation.expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)
      await invitation.save()

      // Resend email
      const inviterName = req.admin.name || 'LaundryLobby Admin'
      const emailOptions = emailTemplates.adminInvitation(invitation, inviterName)
      const emailResult = await sendEmail(emailOptions)

      if (!emailResult.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to resend invitation email'
        })
      }

      res.json({
        success: true,
        message: 'Invitation resent successfully'
      })
    } catch (error) {
      console.error('Resend invitation error:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to resend invitation'
      })
    }
  },

  // Cancel invitation
  cancelInvitation: async (req, res) => {
    try {
      const { invitationId } = req.params

      const invitation = await AdminInvitation.findById(invitationId)
      if (!invitation) {
        return res.status(404).json({
          success: false,
          message: 'Invitation not found'
        })
      }

      if (invitation.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Can only cancel pending invitations'
        })
      }

      await AdminInvitation.findByIdAndDelete(invitationId)

      res.json({
        success: true,
        message: 'Invitation cancelled successfully'
      })
    } catch (error) {
      console.error('Cancel invitation error:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to cancel invitation'
      })
    }
  }
}

module.exports = centerAdminAdminsController
