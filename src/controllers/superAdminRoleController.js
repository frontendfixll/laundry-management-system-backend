const Role = require('../models/Role')
const User = require('../models/User')
const AuditLog = require('../models/AuditLog')
const { validationResult } = require('express-validator')

class CenterAdminRoleController {
  // Get all roles with filters
  async getRoles(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        category,
        level,
        isActive = true
      } = req.query

      // Build query
      const query = { isActive }
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { displayName: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ]
      }
      
      if (category) {
        query.category = category
      }
      
      if (level) {
        query.level = parseInt(level)
      }

      // Execute query with pagination
      const roles = await Role.find(query)
        .populate('createdBy', 'name email')
        .populate('lastModifiedBy', 'name email')
        .populate('parentRole', 'name displayName')
        .sort({ level: 1, createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean()

      const total = await Role.countDocuments(query)

      // Get user count for each role
      const rolesWithStats = await Promise.all(
        roles.map(async (role) => {
          const userCount = await User.countDocuments({ role: role.name })
          return {
            ...role,
            userCount,
            permissionCount: role.permissions?.length || 0
          }
        })
      )

      return res.json({
        success: true,
        data: {
          roles: rolesWithStats,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
            limit: parseInt(limit)
          }
        }
      })
    } catch (error) {
      console.error('Get roles error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch roles'
      })
    }
  }

  // Get single role details
  async getRole(req, res) {
    try {
      const { roleId } = req.params

      const role = await Role.findById(roleId)
        .populate('createdBy', 'name email')
        .populate('lastModifiedBy', 'name email')
        .populate('parentRole', 'name displayName level')
        .populate('childRoles', 'name displayName level')

      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        })
      }

      // Get users with this role
      const users = await User.find({ role: role.name })
        .select('name email branchId isActive')
        .populate('branchId', 'name code')
        .lean()

      return res.json({
        success: true,
        data: {
          role,
          users,
          userCount: users.length
        }
      })
    } catch (error) {
      console.error('Get role error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch role details'
      })
    }
  }

  // Create new role
  async createRole(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const roleData = {
        ...req.body,
        createdBy: req.admin._id
      }

      // Check if role name is unique
      const existingRole = await Role.findOne({ name: roleData.name })
      if (existingRole) {
        return res.status(400).json({
          success: false,
          message: 'Role name already exists'
        })
      }

      const role = new Role(roleData)
      await role.save()

      // Update parent role's child roles if specified
      if (roleData.parentRole) {
        await Role.findByIdAndUpdate(
          roleData.parentRole,
          { $push: { childRoles: role._id } }
        )
      }

      // Log the creation
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'create_role',
        category: 'users',
        description: `Created new role: ${role.displayName} (${role.name})`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'role',
        resourceId: role._id.toString(),
        status: 'success',
        riskLevel: 'medium',
        metadata: {
          roleName: role.name,
          roleLevel: role.level,
          category: role.category,
          permissionCount: role.permissions.length
        }
      })

      return res.status(201).json({
        success: true,
        message: 'Role created successfully',
        data: { role }
      })
    } catch (error) {
      console.error('Create role error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to create role'
      })
    }
  }

  // Update role
  async updateRole(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const { roleId } = req.params
      const updateData = req.body

      const role = await Role.findById(roleId)
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        })
      }

      // Check if it's a system role and prevent critical changes
      if (role.isSystemRole && (updateData.name || updateData.level)) {
        return res.status(400).json({
          success: false,
          message: 'Cannot modify name or level of system roles'
        })
      }

      // Store original data for audit
      const originalData = role.toObject()

      // Update role
      Object.assign(role, updateData)
      role.lastModifiedBy = req.admin._id
      await role.save()

      // Log the update
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'update_role',
        category: 'users',
        description: `Updated role: ${role.displayName} (${role.name})`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'role',
        resourceId: role._id.toString(),
        status: 'success',
        riskLevel: 'high',
        changes: {
          before: originalData,
          after: role.toObject()
        }
      })

      return res.json({
        success: true,
        message: 'Role updated successfully',
        data: { role }
      })
    } catch (error) {
      console.error('Update role error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to update role'
      })
    }
  }

  // Delete role
  async deleteRole(req, res) {
    try {
      const { roleId } = req.params

      const role = await Role.findById(roleId)
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        })
      }

      // Check if it's a system role
      if (role.isSystemRole) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete system roles'
        })
      }

      // Check if role is in use
      const userCount = await User.countDocuments({ role: role.name })
      if (userCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete role. ${userCount} users are assigned to this role`
        })
      }

      // Remove from parent role's child roles
      if (role.parentRole) {
        await Role.findByIdAndUpdate(
          role.parentRole,
          { $pull: { childRoles: role._id } }
        )
      }

      // Update child roles to remove parent reference
      await Role.updateMany(
        { parentRole: role._id },
        { $unset: { parentRole: 1 } }
      )

      await Role.findByIdAndDelete(roleId)

      // Log the deletion
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'delete_role',
        category: 'users',
        description: `Deleted role: ${role.displayName} (${role.name})`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'role',
        resourceId: role._id.toString(),
        status: 'success',
        riskLevel: 'high',
        metadata: {
          roleName: role.name,
          roleLevel: role.level,
          userCount
        }
      })

      return res.json({
        success: true,
        message: 'Role deleted successfully'
      })
    } catch (error) {
      console.error('Delete role error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to delete role'
      })
    }
  }

  // Add permission to role
  async addPermission(req, res) {
    try {
      const { roleId } = req.params
      const { module, actions, restrictions } = req.body

      const role = await Role.findById(roleId)
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        })
      }

      await role.addPermission(module, actions, restrictions)

      // Log the permission addition
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'add_role_permission',
        category: 'users',
        description: `Added ${module} permissions to role: ${role.displayName}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'role',
        resourceId: role._id.toString(),
        status: 'success',
        riskLevel: 'medium',
        metadata: {
          roleName: role.name,
          module,
          actions,
          restrictions
        }
      })

      return res.json({
        success: true,
        message: 'Permission added successfully',
        data: { role }
      })
    } catch (error) {
      console.error('Add permission error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to add permission'
      })
    }
  }

  // Remove permission from role
  async removePermission(req, res) {
    try {
      const { roleId } = req.params
      const { module, action } = req.body

      const role = await Role.findById(roleId)
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        })
      }

      await role.removePermission(module, action)

      // Log the permission removal
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'remove_role_permission',
        category: 'users',
        description: `Removed ${module} permissions from role: ${role.displayName}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'role',
        resourceId: role._id.toString(),
        status: 'success',
        riskLevel: 'medium',
        metadata: {
          roleName: role.name,
          module,
          action
        }
      })

      return res.json({
        success: true,
        message: 'Permission removed successfully',
        data: { role }
      })
    } catch (error) {
      console.error('Remove permission error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to remove permission'
      })
    }
  }

  // Assign role to user
  async assignRole(req, res) {
    try {
      const { userId, roleId } = req.body

      const user = await User.findById(userId)
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        })
      }

      const role = await Role.findById(roleId)
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        })
      }

      const previousRole = user.role

      // Update user role
      user.role = role.name
      await user.save()

      // Update role stats
      if (previousRole) {
        await Role.findOneAndUpdate(
          { name: previousRole },
          { $inc: { 'stats.userCount': -1 } }
        )
      }
      
      role.stats.userCount += 1
      role.stats.lastUsed = new Date()
      await role.save()

      // Log the role assignment
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'assign_role',
        category: 'users',
        description: `Assigned role ${role.displayName} to user ${user.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'user',
        resourceId: user._id.toString(),
        status: 'success',
        riskLevel: 'medium',
        metadata: {
          userName: user.name,
          userEmail: user.email,
          newRole: role.name,
          previousRole
        }
      })

      return res.json({
        success: true,
        message: 'Role assigned successfully',
        data: { user, role }
      })
    } catch (error) {
      console.error('Assign role error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to assign role'
      })
    }
  }

  // Initialize default roles
  async initializeDefaultRoles(req, res) {
    try {
      const createdRoles = await Role.createDefaultRoles(req.admin._id)

      // Log the initialization
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'initialize_default_roles',
        category: 'system',
        description: `Initialized ${createdRoles.length} default roles`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        status: 'success',
        riskLevel: 'low',
        metadata: {
          rolesCreated: createdRoles.map(r => r.name)
        }
      })

      return res.json({
        success: true,
        message: `${createdRoles.length} default roles initialized successfully`,
        data: { roles: createdRoles }
      })
    } catch (error) {
      console.error('Initialize roles error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to initialize default roles'
      })
    }
  }

  // Get role hierarchy
  async getRoleHierarchy(req, res) {
    try {
      const roles = await Role.find({ isActive: true })
        .select('name displayName level parentRole childRoles category')
        .populate('parentRole', 'name displayName level')
        .populate('childRoles', 'name displayName level')
        .sort({ level: 1 })
        .lean()

      // Build hierarchy tree
      const roleMap = new Map()
      const rootRoles = []

      // Create role map
      roles.forEach(role => {
        roleMap.set(role._id.toString(), { ...role, children: [] })
      })

      // Build tree structure
      roles.forEach(role => {
        if (role.parentRole) {
          const parent = roleMap.get(role.parentRole._id.toString())
          if (parent) {
            parent.children.push(roleMap.get(role._id.toString()))
          }
        } else {
          rootRoles.push(roleMap.get(role._id.toString()))
        }
      })

      return res.json({
        success: true,
        data: {
          hierarchy: rootRoles,
          totalRoles: roles.length
        }
      })
    } catch (error) {
      console.error('Get role hierarchy error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch role hierarchy'
      })
    }
  }
}

module.exports = new CenterAdminRoleController()