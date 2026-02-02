const SuperAdminRole = require('../models/SuperAdminRole')
const SuperAdmin = require('../models/SuperAdmin')
const AuditLog = require('../models/AuditLog')
const { validationResult } = require('express-validator')

class SuperAdminRoleController {
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
      const roles = await SuperAdminRole.find(query)
        .populate('createdBy', 'name email')
        .populate('lastModifiedBy', 'name email')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean()

      const total = await SuperAdminRole.countDocuments(query)

      // Get user count for each role
      const rolesWithStats = await Promise.all(
        roles.map(async (role) => {
          const userCount = await SuperAdmin.countDocuments({ roles: role._id })
          return {
            ...role,
            userCount,
            permissionCount: role.permissions ? Object.keys(role.permissions).length : 0
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

      const role = await SuperAdminRole.findById(roleId)
        .populate('createdBy', 'name email')
        .populate('lastModifiedBy', 'name email')

      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        })
      }

      // Get users with this role
      const users = await SuperAdmin.find({ roles: role._id })
        .select('name email isActive')
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
        createdBy: req.superAdmin._id
      }

      // Generate slug from name
      roleData.slug = roleData.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')

      // Check if role name is unique
      const existingRole = await SuperAdminRole.findOne({ slug: roleData.slug })
      if (existingRole) {
        return res.status(400).json({
          success: false,
          message: 'Role name already exists'
        })
      }

      const role = new SuperAdminRole(roleData)
      await role.save()

      // Log the creation
      await AuditLog.logAction({
        userId: req.superAdmin._id,
        userType: 'superadmin',
        userEmail: req.superAdmin.email,
        action: 'create_platform_role',
        category: 'rbac',
        description: `Created new platform role: ${role.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'superadmin_role',
        resourceId: role._id.toString(),
        status: 'success',
        riskLevel: 'medium',
        metadata: {
          roleName: role.name,
          roleSlug: role.slug,
          permissionCount: role.permissions ? Object.keys(role.permissions).length : 0
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

      const role = await SuperAdminRole.findById(roleId)
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        })
      }

      // Check if it's a system role and prevent critical changes
      if (role.isDefault && (updateData.name || updateData.slug)) {
        return res.status(400).json({
          success: false,
          message: 'Cannot modify name or slug of default roles'
        })
      }

      // Store original data for audit
      const originalData = role.toObject()

      // Update role
      Object.assign(role, updateData)
      role.lastModifiedBy = req.superAdmin._id
      await role.save()

      // Log the update
      await AuditLog.logAction({
        userId: req.superAdmin._id,
        userType: 'superadmin',
        userEmail: req.superAdmin.email,
        action: 'update_platform_role',
        category: 'rbac',
        description: `Updated platform role: ${role.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'superadmin_role',
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

      const role = await SuperAdminRole.findById(roleId)
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        })
      }

      // Check if it's a default role
      if (role.isDefault) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete default roles'
        })
      }

      // Check if role is in use
      const userCount = await SuperAdmin.countDocuments({ roles: role._id })
      if (userCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete role. ${userCount} users are assigned to this role`
        })
      }

      await SuperAdminRole.findByIdAndDelete(roleId)

      // Log the deletion
      await AuditLog.logAction({
        userId: req.superAdmin._id,
        userType: 'superadmin',
        userEmail: req.superAdmin.email,
        action: 'delete_platform_role',
        category: 'rbac',
        description: `Deleted platform role: ${role.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'superadmin_role',
        resourceId: role._id.toString(),
        status: 'success',
        riskLevel: 'high',
        metadata: {
          roleName: role.name,
          roleSlug: role.slug,
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

      const role = await SuperAdminRole.findById(roleId)
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        })
      }

      // Add permission to role
      if (!role.permissions[module]) {
        role.permissions[module] = {}
      }
      
      Object.assign(role.permissions[module], actions)
      role.markModified('permissions')
      await role.save()

      // Log the permission addition
      await AuditLog.logAction({
        userId: req.superAdmin._id,
        userType: 'superadmin',
        userEmail: req.superAdmin.email,
        action: 'add_platform_role_permission',
        category: 'rbac',
        description: `Added ${module} permissions to platform role: ${role.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'superadmin_role',
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

      const role = await SuperAdminRole.findById(roleId)
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        })
      }

      // Remove permission from role
      if (role.permissions[module] && role.permissions[module][action]) {
        role.permissions[module][action] = false
        role.markModified('permissions')
        await role.save()
      }

      // Log the permission removal
      await AuditLog.logAction({
        userId: req.superAdmin._id,
        userType: 'superadmin',
        userEmail: req.superAdmin.email,
        action: 'remove_platform_role_permission',
        category: 'rbac',
        description: `Removed ${module} permissions from platform role: ${role.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'superadmin_role',
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

      const user = await SuperAdmin.findById(userId)
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'SuperAdmin user not found'
        })
      }

      const role = await SuperAdminRole.findById(roleId)
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        })
      }

      const previousRoles = user.roles || []

      // Add role to user's roles array if not already present
      if (!user.roles.includes(role._id)) {
        user.roles.push(role._id)
        await user.save()
      }

      // Log the role assignment
      await AuditLog.logAction({
        userId: req.superAdmin._id,
        userType: 'superadmin',
        userEmail: req.superAdmin.email,
        action: 'assign_platform_role',
        category: 'rbac',
        description: `Assigned platform role ${role.name} to SuperAdmin ${user.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'superadmin',
        resourceId: user._id.toString(),
        status: 'success',
        riskLevel: 'medium',
        metadata: {
          userName: user.name,
          userEmail: user.email,
          newRole: role.slug,
          previousRoles
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
      const createdRoles = await SuperAdminRole.createDefaultRoles()

      // Log the initialization
      await AuditLog.logAction({
        userId: req.superAdmin._id,
        userType: 'superadmin',
        userEmail: req.superAdmin.email,
        action: 'initialize_default_platform_roles',
        category: 'system',
        description: `Initialized ${createdRoles.length} default platform roles`,
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
      const roles = await SuperAdminRole.find({ isActive: true })
        .select('name slug description isDefault color')
        .sort({ createdAt: -1 })
        .lean()

      return res.json({
        success: true,
        data: {
          hierarchy: roles, // For platform roles, we don't have hierarchy
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

module.exports = new SuperAdminRoleController()