const express = require('express')
const router = express.Router()
const { authenticateSuperAdmin } = require('../../middlewares/superAdminAuthSimple')
const { body, param } = require('express-validator')
const SuperAdmin = require('../../models/SuperAdmin')
const SuperAdminRole = require('../../models/SuperAdminRole')
const AuditLog = require('../../models/AuditLog')
const { validationResult } = require('express-validator')
const bcrypt = require('bcryptjs')
const sseService = require('../../services/sseService')

// Validation rules
const validateUserCreation = [
  body('name')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('roleId')
    .isMongoId()
    .withMessage('Valid role ID is required'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
]

// All routes require SuperAdmin authentication
router.use(authenticateSuperAdmin)

// Create new platform user
router.post('/', validateUserCreation, async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      })
    }

    const { name, email, password, roleId, isActive = true, customPermissions } = req.body

    // Check if email already exists
    const existingUser = await SuperAdmin.findOne({ email })
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      })
    }

    // Verify role exists and is not Super Admin
    const role = await SuperAdminRole.findById(roleId)
    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role selected'
      })
    }

    // Prevent creation of new Super Admin users
    if (role.slug === 'super-admin') {
      return res.status(403).json({
        success: false,
        message: 'Cannot create new Super Admin users'
      })
    }

    // Create new user
    const newUser = new SuperAdmin({
      name: name.trim(),
      email: email.toLowerCase(),
      password, // Will be hashed by pre-save middleware
      roles: [roleId], // Assign the selected role
      isActive,
      // Set legacy role field for backward compatibility
      role: 'superadmin',
      customPermissions: customPermissions || {}
    })

    await newUser.save()

    // Log the user creation
    await AuditLog.logAction({
      userId: req.admin._id,
      userType: 'superadmin',
      userEmail: req.admin.email,
      action: 'create_platform_user',
      category: 'user_management',
      description: `Created new platform user: ${name} (${email}) with role: ${role.name}`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.sessionId,
      resourceType: 'superadmin_user',
      resourceId: newUser._id.toString(),
      status: 'success',
      riskLevel: 'medium',
      metadata: {
        userName: name,
        userEmail: email,
        assignedRole: role.name,
        roleId: roleId,
        isActive
      }
    })

    // Return user data without password
    const userResponse = {
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      roles: newUser.roles,
      isActive: newUser.isActive,
      createdAt: newUser.createdAt,
      assignedRole: {
        _id: role._id,
        name: role.name,
        slug: role.slug,
        description: role.description,
        color: role.color
      }
    }

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { user: userResponse }
    })

  } catch (error) {
    console.error('Create user error:', error)

    // Log failed attempt
    if (req.admin) {
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'superadmin',
        userEmail: req.admin.email,
        action: 'create_platform_user',
        category: 'user_management',
        description: `Failed to create platform user: ${req.body.email}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        status: 'failure',
        riskLevel: 'medium',
        metadata: {
          error: error.message,
          requestData: { ...req.body, password: '[REDACTED]' }
        }
      })
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create user'
    })
  }
})

// Get all platform users
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      role: roleFilter,
      isActive
    } = req.query

    // Build query
    const query = {}

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ]
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true'
    }

    // Execute query with pagination
    const users = await SuperAdmin.find(query)
      .populate('roles', 'name slug description color')
      .select('-password -sessions -resetPasswordToken')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean()

    const total = await SuperAdmin.countDocuments(query)

    // Filter by role if specified
    let filteredUsers = users
    if (roleFilter) {
      filteredUsers = users.filter(user =>
        user.roles.some(role => role.slug === roleFilter)
      )
    }

    return res.json({
      success: true,
      data: {
        users: filteredUsers,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      }
    })

  } catch (error) {
    console.error('Get users error:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    })
  }
})

// Get single user
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params

    const user = await SuperAdmin.findById(userId)
      .populate('roles', 'name slug description color permissions')
      .select('-password -sessions -resetPasswordToken')

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    return res.json({
      success: true,
      data: { user }
    })

  } catch (error) {
    console.error('Get user error:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch user details'
    })
  }
})

// Update user
router.put('/:userId', [
  param('userId').isMongoId().withMessage('Valid user ID is required'),
  body('name').optional().isLength({ min: 2, max: 100 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('roleId').optional().isMongoId(),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      })
    }

    const { userId } = req.params
    const { name, email, roleId, isActive, customPermissions } = req.body

    const user = await SuperAdmin.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    // Prevent modification of Super Admin users
    const currentRoles = await SuperAdminRole.find({ _id: { $in: user.roles } })
    const isSuperAdmin = currentRoles.some(role => role.slug === 'super-admin')

    if (isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Cannot modify Super Admin users'
      })
    }

    // Store original data for audit
    const originalData = {
      name: user.name,
      email: user.email,
      roles: user.roles,
      isActive: user.isActive
    }

    // Update fields
    if (name) user.name = name.trim()
    if (email) {
      // Check if new email already exists
      const existingUser = await SuperAdmin.findOne({
        email: email.toLowerCase(),
        _id: { $ne: userId }
      })
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        })
      }
      user.email = email.toLowerCase()
    }
    if (roleId) {
      // Verify new role exists and is not Super Admin
      const newRole = await SuperAdminRole.findById(roleId)
      if (!newRole) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role selected'
        })
      }
      if (newRole.slug === 'super-admin') {
        return res.status(403).json({
          success: false,
          message: 'Cannot assign Super Admin role'
        })
      }
      user.roles = [roleId]
    }
    if (isActive !== undefined) user.isActive = isActive
    if (customPermissions) user.customPermissions = customPermissions

    await user.save()

    // Trigger real-time permission update via SSE
    try {
      await sseService.sendToUser(userId, {
        type: 'permissions_updated',
        timestamp: new Date().toISOString(),
        userId: userId,
        newPermissions: customPermissions
      });
      console.log(`📡 Sent permissions_updated event to user ${userId}`);
    } catch (sseError) {
      console.error('Failed to send SSE update:', sseError);
      // Don't fail the request if SSE fails
    }

    // Log the update
    await AuditLog.logAction({
      userId: req.admin._id,
      userType: 'superadmin',
      userEmail: req.admin.email,
      action: 'update_platform_user',
      category: 'user_management',
      description: `Updated platform user: ${user.name} (${user.email})`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.sessionId,
      resourceType: 'superadmin_user',
      resourceId: user._id.toString(),
      status: 'success',
      riskLevel: 'medium',
      changes: {
        before: originalData,
        after: {
          name: user.name,
          email: user.email,
          roles: user.roles,
          isActive: user.isActive
        }
      }
    })

    // Return updated user
    const updatedUser = await SuperAdmin.findById(userId)
      .populate('roles', 'name slug description color')
      .select('-password -sessions -resetPasswordToken')

    return res.json({
      success: true,
      message: 'User updated successfully',
      data: { user: updatedUser }
    })

  } catch (error) {
    console.error('Update user error:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to update user'
    })
  }
})

// Delete user
router.delete('/:userId', async (req, res) => {
  try {
    const { userId } = req.params

    const user = await SuperAdmin.findById(userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    // Prevent deletion of Super Admin users
    const currentRoles = await SuperAdminRole.find({ _id: { $in: user.roles } })
    const isSuperAdmin = currentRoles.some(role => role.slug === 'super-admin')

    if (isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete Super Admin users'
      })
    }

    await SuperAdmin.findByIdAndDelete(userId)

    // Log the deletion
    await AuditLog.logAction({
      userId: req.admin._id,
      userType: 'superadmin',
      userEmail: req.admin.email,
      action: 'delete_platform_user',
      category: 'user_management',
      description: `Deleted platform user: ${user.name} (${user.email})`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      sessionId: req.sessionId,
      resourceType: 'superadmin_user',
      resourceId: user._id.toString(),
      status: 'success',
      riskLevel: 'high',
      metadata: {
        deletedUser: {
          name: user.name,
          email: user.email,
          roles: user.roles
        }
      }
    })

    return res.json({
      success: true,
      message: 'User deleted successfully'
    })

  } catch (error) {
    console.error('Delete user error:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    })
  }
})

module.exports = router