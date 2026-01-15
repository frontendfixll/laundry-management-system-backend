const Role = require('../../models/Role');

/**
 * Role Controller for Admin
 * Manages roles within a tenancy
 */
const roleController = {
  /**
   * Get all roles for tenancy
   */
  getRoles: async (req, res) => {
    try {
      const tenancyId = req.user.tenancy;
      
      if (!tenancyId) {
        return res.status(400).json({
          success: false,
          message: 'Tenancy not found'
        });
      }

      const roles = await Role.find({ tenancy: tenancyId, isActive: true })
        .sort({ isDefault: -1, name: 1 });

      res.json({
        success: true,
        data: { roles }
      });
    } catch (error) {
      console.error('Get roles error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch roles'
      });
    }
  },

  /**
   * Get single role by ID
   */
  getRole: async (req, res) => {
    try {
      const { id } = req.params;
      const tenancyId = req.user.tenancy;

      const role = await Role.findOne({ _id: id, tenancy: tenancyId });

      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      res.json({
        success: true,
        data: { role }
      });
    } catch (error) {
      console.error('Get role error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch role'
      });
    }
  },

  /**
   * Create new role
   */
  createRole: async (req, res) => {
    try {
      const tenancyId = req.user.tenancy;
      const { name, description, permissions, color } = req.body;

      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'Role name is required'
        });
      }

      // Generate slug
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      // Check if role with same slug exists
      const existing = await Role.findOne({ tenancy: tenancyId, slug });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'A role with this name already exists'
        });
      }

      const role = await Role.create({
        name,
        slug,
        description: description || '',
        tenancy: tenancyId,
        permissions: permissions || {},
        color: color || '#6366f1',
        isDefault: false,
        createdBy: req.user._id
      });

      res.status(201).json({
        success: true,
        message: 'Role created successfully',
        data: { role }
      });
    } catch (error) {
      console.error('Create role error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create role'
      });
    }
  },

  /**
   * Update role
   */
  updateRole: async (req, res) => {
    try {
      const { id } = req.params;
      const tenancyId = req.user.tenancy;
      const { name, description, permissions, color, isActive } = req.body;

      const role = await Role.findOne({ _id: id, tenancy: tenancyId });

      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      // Update fields
      if (name && !role.isDefault) {
        role.name = name;
        role.slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      }
      if (description !== undefined) role.description = description;
      if (permissions) role.permissions = permissions;
      if (color) role.color = color;
      if (typeof isActive === 'boolean' && !role.isDefault) role.isActive = isActive;

      await role.save();

      res.json({
        success: true,
        message: 'Role updated successfully',
        data: { role }
      });
    } catch (error) {
      console.error('Update role error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update role'
      });
    }
  },

  /**
   * Delete role
   */
  deleteRole: async (req, res) => {
    try {
      const { id } = req.params;
      const tenancyId = req.user.tenancy;

      const role = await Role.findOne({ _id: id, tenancy: tenancyId });

      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found'
        });
      }

      if (role.isDefault) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete default roles'
        });
      }

      // Check if any users have this role
      const User = require('../../models/User');
      const usersWithRole = await User.countDocuments({ role: id, tenancy: tenancyId });
      
      if (usersWithRole > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete role. ${usersWithRole} user(s) are assigned to this role.`
        });
      }

      await Role.deleteOne({ _id: id });

      res.json({
        success: true,
        message: 'Role deleted successfully'
      });
    } catch (error) {
      console.error('Delete role error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete role'
      });
    }
  },

  /**
   * Get available modules and actions for permission setup
   */
  getPermissionModules: async (req, res) => {
    try {
      const modules = [
        { key: 'orders', name: 'Orders', description: 'Order management' },
        { key: 'customers', name: 'Customers', description: 'Customer management' },
        { key: 'inventory', name: 'Inventory', description: 'Inventory management' },
        { key: 'services', name: 'Services', description: 'Service management' },
        { key: 'branches', name: 'Branches', description: 'Branch management' },
        { key: 'staff', name: 'Staff', description: 'Staff management' },
        { key: 'coupons', name: 'Coupons', description: 'Coupon management' },
        { key: 'campaigns', name: 'Campaigns', description: 'Campaign management' },
        { key: 'banners', name: 'Banners', description: 'Banner management' },
        { key: 'loyalty', name: 'Loyalty', description: 'Loyalty program' },
        { key: 'referrals', name: 'Referrals', description: 'Referral program' },
        { key: 'wallet', name: 'Wallet', description: 'Wallet management' },
        { key: 'logistics', name: 'Logistics', description: 'Delivery management' },
        { key: 'tickets', name: 'Support Tickets', description: 'Support ticket management' },
        { key: 'payments', name: 'Payments', description: 'Payment management' },
        { key: 'refunds', name: 'Refunds', description: 'Refund management' },
        { key: 'performance', name: 'Analytics', description: 'View analytics & reports' },
        { key: 'settings', name: 'Settings', description: 'System settings' },
        { key: 'branding', name: 'Branding', description: 'Branding settings' }
      ];

      const actions = [
        { key: 'view', name: 'View', description: 'Can view data' },
        { key: 'create', name: 'Create', description: 'Can create new records' },
        { key: 'edit', name: 'Edit', description: 'Can edit existing records' },
        { key: 'delete', name: 'Delete', description: 'Can delete records' }
      ];

      res.json({
        success: true,
        data: { modules, actions }
      });
    } catch (error) {
      console.error('Get permission modules error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch permission modules'
      });
    }
  },

  /**
   * Initialize default roles for tenancy (called when tenancy is created)
   */
  initializeDefaultRoles: async (req, res) => {
    try {
      const tenancyId = req.user.tenancy;

      // Check if roles already exist
      const existingRoles = await Role.countDocuments({ tenancy: tenancyId });
      if (existingRoles > 0) {
        return res.status(400).json({
          success: false,
          message: 'Roles already initialized for this tenancy'
        });
      }

      const roles = await Role.createDefaultRoles(tenancyId, req.user._id);

      res.status(201).json({
        success: true,
        message: 'Default roles created successfully',
        data: { roles }
      });
    } catch (error) {
      console.error('Initialize roles error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initialize roles'
      });
    }
  },

  /**
   * Get users with their assigned roles
   */
  getUsersWithRoles: async (req, res) => {
    try {
      const tenancyId = req.user.tenancy;
      const User = require('../../models/User');

      const users = await User.find({ 
        tenancy: tenancyId,
        role: { $in: ['admin', 'branch_admin', 'staff'] }
      })
        .select('name email phone role roleId isActive assignedBranch createdAt')
        .populate('roleId', 'name color slug')
        .populate('assignedBranch', 'name')
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: { users }
      });
    } catch (error) {
      console.error('Get users with roles error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch users'
      });
    }
  },

  /**
   * Assign role to user
   */
  assignRoleToUser: async (req, res) => {
    try {
      const { userId } = req.params;
      const { roleId } = req.body;
      const tenancyId = req.user.tenancy;
      const User = require('../../models/User');

      // Find user
      const user = await User.findOne({ _id: userId, tenancy: tenancyId });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Validate role if provided
      if (roleId) {
        const role = await Role.findOne({ _id: roleId, tenancy: tenancyId });
        if (!role) {
          return res.status(404).json({
            success: false,
            message: 'Role not found'
          });
        }

        // Copy permissions from role to user
        user.roleId = roleId;
        user.permissions = {
          orders: { 
            view: role.permissions.orders?.view || false,
            create: role.permissions.orders?.create || false,
            update: role.permissions.orders?.edit || false,
            delete: role.permissions.orders?.delete || false
          },
          customers: {
            view: role.permissions.customers?.view || false,
            create: role.permissions.customers?.create || false,
            update: role.permissions.customers?.edit || false,
            delete: role.permissions.customers?.delete || false
          },
          inventory: {
            view: role.permissions.inventory?.view || false,
            create: role.permissions.inventory?.create || false,
            update: role.permissions.inventory?.edit || false,
            delete: role.permissions.inventory?.delete || false
          },
          services: {
            view: role.permissions.services?.view || false,
            create: role.permissions.services?.create || false,
            update: role.permissions.services?.edit || false,
            delete: role.permissions.services?.delete || false
          },
          logistics: {
            view: role.permissions.logistics?.view || false,
            create: role.permissions.logistics?.create || false,
            update: role.permissions.logistics?.edit || false,
            delete: role.permissions.logistics?.delete || false
          },
          tickets: {
            view: role.permissions.tickets?.view || false,
            create: role.permissions.tickets?.create || false,
            update: role.permissions.tickets?.edit || false,
            delete: role.permissions.tickets?.delete || false
          },
          performance: {
            view: role.permissions.performance?.view || false,
            create: role.permissions.performance?.create || false,
            update: role.permissions.performance?.edit || false,
            delete: role.permissions.performance?.delete || false
          },
          settings: {
            view: role.permissions.settings?.view || false,
            create: role.permissions.settings?.create || false,
            update: role.permissions.settings?.edit || false,
            delete: role.permissions.settings?.delete || false
          },
          coupons: {
            view: role.permissions.coupons?.view || false,
            create: role.permissions.coupons?.create || false,
            update: role.permissions.coupons?.edit || false,
            delete: role.permissions.coupons?.delete || false
          },
          staff: {
            view: role.permissions.staff?.view || false,
            create: role.permissions.staff?.create || false,
            update: role.permissions.staff?.edit || false,
            delete: role.permissions.staff?.delete || false
          },
          branches: {
            view: role.permissions.branches?.view || false,
            create: role.permissions.branches?.create || false,
            update: role.permissions.branches?.edit || false,
            delete: role.permissions.branches?.delete || false
          }
        };
      } else {
        // Remove role assignment
        user.roleId = null;
      }

      await user.save();

      // Return updated user with populated role
      const updatedUser = await User.findById(userId)
        .select('name email phone role roleId isActive assignedBranch')
        .populate('roleId', 'name color slug')
        .populate('assignedBranch', 'name');

      res.json({
        success: true,
        message: 'Role assigned successfully',
        data: { user: updatedUser }
      });
    } catch (error) {
      console.error('Assign role error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to assign role'
      });
    }
  }
};

module.exports = roleController;
