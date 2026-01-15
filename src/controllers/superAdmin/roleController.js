const SuperAdminRole = require('../../models/SuperAdminRole');
const SuperAdmin = require('../../models/SuperAdmin');
const AuditLog = require('../../models/AuditLog');

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
        .select('name email isActive lastLogin')
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
      
      // Create role
      const role = new SuperAdminRole({
        name,
        slug,
        description,
        permissions,
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
      
      const role = await SuperAdminRole.findById(id);
      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }
      
      // Prevent deactivation of default roles
      if (role.isDefault && isActive === false) {
        return res.status(400).json({
          success: false,
          message: 'Cannot deactivate default role'
        });
      }
      
      // Store old data for audit
      const oldData = role.toObject();
      
      // Update fields
      if (name) {
        role.name = name;
        role.slug = name.toLowerCase().replace(/\s+/g, '-');
      }
      if (description !== undefined) role.description = description;
      if (permissions) role.permissions = permissions;
      if (color) role.color = color;
      if (isActive !== undefined) role.isActive = isActive;
      role.lastModifiedBy = req.user._id;
      
      await role.save();
      
      // Audit log
      await AuditLog.logAction({
        userId: req.user._id,
        userType: 'superadmin',
        userEmail: req.user.email,
        action: 'update_superadmin_role',
        category: 'rbac',
        description: `Updated SuperAdmin role: ${role.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        resourceType: 'superadmin_role',
        resourceId: role._id.toString(),
        status: 'success',
        riskLevel: 'high',
        changes: { before: oldData, after: role.toObject() }
      });
      
      return res.json({
        success: true,
        message: 'Role updated successfully',
        data: { role }
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
   * Assign roles to SuperAdmin
   * POST /api/superadmin/rbac/assign
   */
  async assignRoles(req, res) {
    try {
      const { superadminId, roleIds } = req.body;
      
      const superadmin = await SuperAdmin.findById(superadminId);
      if (!superadmin) {
        return res.status(404).json({
          success: false,
          message: 'SuperAdmin not found'
        });
      }
      
      // Validate all roles exist and are active
      const roles = await SuperAdminRole.find({ 
        _id: { $in: roleIds },
        isActive: true 
      });
      
      if (roles.length !== roleIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more roles not found or inactive'
        });
      }
      
      // Store old roles for audit
      const oldRoles = superadmin.roles;
      
      // Update roles
      superadmin.roles = roleIds;
      await superadmin.save();
      
      // TODO: Invalidate user sessions to force re-authentication with new permissions
      // This would require session management implementation
      
      // Audit log
      await AuditLog.logAction({
        userId: req.user._id,
        userType: 'superadmin',
        userEmail: req.user.email,
        action: 'assign_superadmin_roles',
        category: 'rbac',
        description: `Assigned roles to SuperAdmin: ${superadmin.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        resourceType: 'superadmin',
        resourceId: superadmin._id.toString(),
        status: 'success',
        riskLevel: 'high',
        metadata: {
          superadminName: superadmin.name,
          superadminEmail: superadmin.email,
          oldRoles: oldRoles.map(r => r.toString()),
          newRoles: roleIds,
          roleNames: roles.map(r => r.name)
        }
      });
      
      return res.json({
        success: true,
        message: 'Roles assigned successfully',
        data: { superadmin, roles }
      });
    } catch (error) {
      console.error('Assign roles error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to assign roles'
      });
    }
  }
}

module.exports = new SuperAdminRoleController();
