const SuperAdminRole = require('../../models/SuperAdminRole');
const SuperAdmin = require('../../models/SuperAdmin');
const AuditLog = require('../../models/AuditLog');
const rbacNotificationService = require('../../services/rbacNotificationService');

class SuperAdminRoleController {
  /**
   * Get all roles with pagination and filters
   * GET /api/superadmin/rbac/roles
   */
  async getRoles(req, res) {
    try {
      const { page = 1, limit = 20, search, isActive } = req.query;

      // Build query
      const query = {};
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }
      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }

      // Execute query with pagination
      const roles = await SuperAdminRole.find(query)
        .populate('createdBy', 'name email')
        .populate('lastModifiedBy', 'name email')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await SuperAdminRole.countDocuments(query);

      // Get assignment count for each role
      const rolesWithStats = await Promise.all(
        roles.map(async (role) => {
          const assignmentCount = await SuperAdmin.countDocuments({
            roles: role._id
          });
          return {
            ...role.toObject(),
            assignmentCount,
            permissionCount: role.getEnabledPermissions().length
          };
        })
      );

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
      });
    } catch (error) {
      console.error('Get roles error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch roles'
      });
    }
  }

  /**
   * Get single role details
   * GET /api/superadmin/rbac/roles/:id
   */
  async getRole(req, res) {
    try {
      const { id } = req.params;

      const role = await SuperAdminRole.findById(id)
        .populate('createdBy', 'name email')
        .populate('lastModifiedBy', 'name email');

      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      // Get assigned superadmins
      const assignedAdmins = await SuperAdmin.find({ roles: role._id })
        .select('name email isActive lastLogin customPermissions')
        .lean();

      return res.json({
        success: true,
        data: {
          role,
          assignedAdmins,
          assignmentCount: assignedAdmins.length
        }
      });
    } catch (error) {
      console.error('Get role error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch role'
      });
    }
  }

  /**
   * Helper to convert permission objects to compact strings
   * @param {Object} permissions - The raw permissions object from request
   * @returns {Object} - Permissions with string values
   */
  convertPermissionsToString(permissions) {
    if (!permissions) return {};

    // Reverse Mapping for conversion
    const ACTION_TO_CODE = {
      'view': 'r',
      'create': 'c',
      'update': 'u',
      'delete': 'd',
      'export': 'e'
    };

    const converted = {};

    Object.entries(permissions).forEach(([module, perms]) => {
      // If already a string (compact format), use as is
      if (typeof perms === 'string') {
        converted[module] = perms;
      }
      // If object (legacy format), convert to string
      else if (typeof perms === 'object' && perms !== null) {
        let permString = '';
        Object.entries(perms).forEach(([action, value]) => {
          if (value === true && ACTION_TO_CODE[action]) {
            permString += ACTION_TO_CODE[action];
          }
        });
        converted[module] = permString;
      }
    });

    return converted;
  }

  /**
   * Create new role
   * POST /api/superadmin/rbac/roles
   */
  async createRole(req, res) {
    try {
      const { name, description, permissions, color } = req.body;

      // Generate slug from name
      const slug = name.toLowerCase().replace(/\s+/g, '-');

      // Check uniqueness
      const existing = await SuperAdminRole.findOne({ slug });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'Role with this name already exists'
        });
      }

      // Convert permissions to storage format
      const storagePermissions = this.convertPermissionsToString(permissions);

      // Create role
      const role = new SuperAdminRole({
        name,
        slug,
        description,
        permissions: storagePermissions,
        color: color || '#6366f1',
        createdBy: req.user._id
      });

      await role.save();

      // Audit log
      await AuditLog.logAction({
        userId: req.user._id,
        userType: 'superadmin',
        userEmail: req.user.email,
        action: 'create_superadmin_role',
        category: 'rbac',
        description: `Created SuperAdmin role: ${role.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        resourceType: 'superadmin_role',
        resourceId: role._id.toString(),
        status: 'success',
        riskLevel: 'high',
        metadata: {
          roleName: role.name,
          permissionCount: role.getEnabledPermissions().length
        }
      });

      return res.status(201).json({
        success: true,
        message: 'Role created successfully',
        data: { role }
      });
    } catch (error) {
      console.error('Create role error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create role'
      });
    }
  }

  /**
   * Update role
   * PUT /api/superadmin/rbac/roles/:id
   */
  async updateRole(req, res) {
    try {
      const { id } = req.params;
      const { name, description, permissions, color, isActive } = req.body;

      // 1. Fetch raw data to bypass schema validation errors on legacy objects
      const existingRole = await SuperAdminRole.findById(id).lean();
      if (!existingRole) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      // Prevent deactivation of default roles
      if (existingRole.isDefault && isActive === false) {
        return res.status(400).json({
          success: false,
          message: 'Cannot deactivate default role'
        });
      }

      // 2. Prepare Update Object
      const updateData = {};

      if (name) {
        updateData.name = name;
        updateData.slug = name.toLowerCase().replace(/\s+/g, '-');
      }
      if (description !== undefined) updateData.description = description;
      if (color) updateData.color = color;
      if (isActive !== undefined) updateData.isActive = isActive;
      updateData.lastModifiedBy = req.user._id;

      // 3. Handle Permissions - PREVENT UPDATES
      // Permissions should not be updated via role edit
      // They are managed per-user to prevent affecting all users
      if (permissions) {
        return res.status(400).json({
          success: false,
          message: 'Role permissions cannot be edited. Please edit individual user permissions instead.'
        });
      }

      // 4. Update using findByIdAndUpdate
      const updatedRole = await SuperAdminRole.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      // Audit log
      await AuditLog.logAction({
        userId: req.user._id,
        userType: 'superadmin',
        userEmail: req.user.email,
        action: 'update_superadmin_role',
        category: 'rbac',
        description: `Updated SuperAdmin role: ${updatedRole.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        resourceType: 'superadmin_role',
        resourceId: updatedRole._id.toString(),
        status: 'success',
        riskLevel: 'high',
        changes: { before: existingRole, after: updatedRole.toObject() }
      });

      // 5. Notify assigned users about role update
      try {
        const assignedAdmins = await SuperAdmin.find({ roles: id });
        const affectedUserIds = assignedAdmins.map(admin => admin._id.toString());

        if (affectedUserIds.length > 0) {
          await rbacNotificationService.notifyRoleChange({
            roleId: id,
            roleName: updatedRole.name,
            affectedUsers: affectedUserIds,
            changeType: 'updated',
            changes: { permissions: updatedRole.permissions },
            changedBy: req.user._id
          });
        }
      } catch (notifyError) {
        console.error('❌ Role update notification error:', notifyError);
      }

      return res.json({
        success: true,
        message: 'Role updated successfully',
        data: { role: updatedRole }
      });
    } catch (error) {
      console.error('Update role error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update role'
      });
    }
  }

  /**
   * Delete role
   * DELETE /api/superadmin/rbac/roles/:id
   */
  async deleteRole(req, res) {
    try {
      const { id } = req.params;

      const role = await SuperAdminRole.findById(id);
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      // Prevent deletion of default roles
      if (role.isDefault) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete default role'
        });
      }

      // Check if role is assigned to any SuperAdmins
      const assignmentCount = await SuperAdmin.countDocuments({ roles: role._id });
      if (assignmentCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete role. ${assignmentCount} SuperAdmins are assigned to this role`
        });
      }

      await SuperAdminRole.findByIdAndDelete(id);

      // Audit log
      await AuditLog.logAction({
        userId: req.user._id,
        userType: 'superadmin',
        userEmail: req.user.email,
        action: 'delete_superadmin_role',
        category: 'rbac',
        description: `Deleted SuperAdmin role: ${role.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        resourceType: 'superadmin_role',
        resourceId: role._id.toString(),
        status: 'success',
        riskLevel: 'critical',
        metadata: {
          roleName: role.name,
          assignmentCount
        }
      });

      return res.json({
        success: true,
        message: 'Role deleted successfully'
      });
    } catch (error) {
      console.error('Delete role error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete role'
      });
    }
  }

  /**
   * Get SuperAdmin users for role assignment
   * GET /api/superadmin/rbac/superadmins
   */
  async getSuperAdmins(req, res) {
    try {
      const { page = 1, limit = 20, search, isActive } = req.query;

      // Build query
      const query = {};
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }
      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }

      // Execute query with pagination
      const superadmins = await SuperAdmin.find(query)
        .select('name email role isActive lastLogin createdAt roles')
        .populate('roles', 'name slug color')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await SuperAdmin.countDocuments(query);

      return res.json({
        success: true,
        data: {
          users: superadmins, // Keep 'users' key for frontend compatibility
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
            limit: parseInt(limit)
          }
        }
      });
    } catch (error) {
      console.error('Get SuperAdmins error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch SuperAdmin users'
      });
    }
  }

  /**
   * Assign roles to SuperAdmin
   * POST /api/superadmin/rbac/assign
   */
  async assignRoles(req, res) {
    try {
      console.log('🎯 Role assignment started');
      console.log('Request body:', req.body);

      const { superadminId, roleIds } = req.body;

      console.log('Finding SuperAdmin:', superadminId);
      const superadmin = await SuperAdmin.findById(superadminId);
      if (!superadmin) {
        console.log('❌ SuperAdmin not found');
        return res.status(404).json({
          success: false,
          message: 'SuperAdmin not found'
        });
      }

      console.log('✅ SuperAdmin found:', superadmin.name);
      console.log('Finding roles:', roleIds);

      // Validate all roles exist and are active
      const roles = await SuperAdminRole.find({
        _id: { $in: roleIds },
        isActive: true
      });

      console.log('✅ Roles found:', roles.length, 'out of', roleIds.length);

      if (roles.length !== roleIds.length) {
        console.log('❌ Role count mismatch');
        return res.status(400).json({
          success: false,
          message: 'One or more roles not found or inactive'
        });
      }

      // Store old roles for audit
      const oldRoles = superadmin.roles;
      console.log('Old roles:', oldRoles);

      // Update roles
      superadmin.roles = roleIds;
      console.log('Saving SuperAdmin with new roles...');
      await superadmin.save();
      console.log('✅ SuperAdmin saved successfully');

      // Notify user about role assignment
      try {
        await rbacNotificationService.notifyPermissionChange({
          userId: superadmin._id,
          userEmail: superadmin.email,
          userName: superadmin.name,
          permissionChanges: {}, // Full refresh will be triggered
          roleChanges: roles.map(r => r.name),
          changeType: 'assigned',
          changedBy: req.user._id,
          reason: 'Roles updated by administrator'
        });
      } catch (notifyError) {
        console.error('❌ Role assignment notification error:', notifyError);
      }

      // Skip audit log for now to test
      console.log('⚠️ Skipping audit log for debugging');

      return res.json({
        success: true,
        message: 'Roles assigned successfully',
        data: { superadmin, roles }
      });
    } catch (error) {
      console.error('❌ Assign roles error:', error);
      console.error('Error stack:', error.stack);
      return res.status(500).json({
        success: false,
        message: 'Failed to assign roles',
        error: error.message // Add error details for debugging
      });
    }
  }
}

module.exports = new SuperAdminRoleController();
