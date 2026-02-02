const mongoose = require('mongoose');
const { TENANT_ROLES } = require('../config/roleDefinitions');

/**
 * Permission schema for each module
 * Each module can have view, create, edit, delete permissions
 */
const modulePermissionSchema = new mongoose.Schema({
  view: { type: Boolean, default: false },
  create: { type: Boolean, default: false },
  edit: { type: Boolean, default: false },
  delete: { type: Boolean, default: false }
}, { _id: false });

/**
 * Role Schema
 * Defines roles with granular permissions for each module
 * Enhanced based on droles.md specification
 */
const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },

  // Tenancy this role belongs to
  tenancy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: true,
    index: true
  },

  // Enhanced permissions based on droles.md
  permissions: {
    // Business Profile
    business_profile: { type: modulePermissionSchema, default: () => ({}) },

    // Services & Pricing
    services_pricing: { type: modulePermissionSchema, default: () => ({}) },

    // Orders
    orders_view: { type: modulePermissionSchema, default: () => ({}) },
    orders_update_status: { type: modulePermissionSchema, default: () => ({}) },

    // Staff Management
    assign_staff: { type: modulePermissionSchema, default: () => ({}) },
    staff_management: { type: modulePermissionSchema, default: () => ({}) },

    // Customer Management
    customer_management: { type: modulePermissionSchema, default: () => ({}) },

    // Tenant Coupons
    tenant_coupons: { type: modulePermissionSchema, default: () => ({}) },

    // Payments & Earnings
    payments_earnings: { type: modulePermissionSchema, default: () => ({}) },
    refund_requests: { type: modulePermissionSchema, default: () => ({}) },

    // Reports & Analytics
    reports_analytics: { type: modulePermissionSchema, default: () => ({}) },

    // Tenant Settings
    tenant_settings: { type: modulePermissionSchema, default: () => ({}) },

    // Legacy permissions (for backward compatibility)
    orders: { type: modulePermissionSchema, default: () => ({}) },
    customers: { type: modulePermissionSchema, default: () => ({}) },
    inventory: { type: modulePermissionSchema, default: () => ({}) },
    services: { type: modulePermissionSchema, default: () => ({}) },
    branches: { type: modulePermissionSchema, default: () => ({}) },
    staff: { type: modulePermissionSchema, default: () => ({}) },
    coupons: { type: modulePermissionSchema, default: () => ({}) },
    campaigns: { type: modulePermissionSchema, default: () => ({}) },
    banners: { type: modulePermissionSchema, default: () => ({}) },
    loyalty: { type: modulePermissionSchema, default: () => ({}) },
    referrals: { type: modulePermissionSchema, default: () => ({}) },
    wallet: { type: modulePermissionSchema, default: () => ({}) },
    logistics: { type: modulePermissionSchema, default: () => ({}) },
    tickets: { type: modulePermissionSchema, default: () => ({}) },
    payments: { type: modulePermissionSchema, default: () => ({}) },
    refunds: { type: modulePermissionSchema, default: () => ({}) },
    performance: { type: modulePermissionSchema, default: () => ({}) },
    settings: { type: modulePermissionSchema, default: () => ({}) },
    branding: { type: modulePermissionSchema, default: () => ({}) }
  },

  // Is this a system default role (cannot be deleted)
  isDefault: {
    type: Boolean,
    default: false
  },

  // Is role active
  isActive: {
    type: Boolean,
    default: true
  },

  // Color for UI display
  color: {
    type: String,
    default: '#6366f1' // indigo
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Compound index for unique role name per tenancy
roleSchema.index({ tenancy: 1, slug: 1 }, { unique: true });

/**
 * Check if role has specific permission
 */
roleSchema.methods.hasPermission = function (module, action) {
  if (!this.permissions[module]) return false;
  return this.permissions[module][action] === true;
};

/**
 * Get all enabled permissions as flat array
 */
roleSchema.methods.getEnabledPermissions = function () {
  const enabled = [];
  Object.entries(this.permissions).forEach(([module, perms]) => {
    Object.entries(perms).forEach(([action, value]) => {
      if (value === true) {
        enabled.push(`${module}.${action}`);
      }
    });
  });
  return enabled;
};

/**
 * Static method to get default roles for a new tenancy
 * Based on droles.md specification
 */
roleSchema.statics.getDefaultRoles = function (tenancyId, createdBy) {
  const defaultRoles = [];

  // Convert TENANT_ROLES to the format expected by the model
  Object.values(TENANT_ROLES).forEach(roleData => {
    // Convert permissions format from {view: true, create: true, ...} to {view: true, create: true, edit: true, delete: true}
    const convertedPermissions = {};

    Object.entries(roleData.permissions).forEach(([module, perms]) => {
      convertedPermissions[module] = {
        view: perms.view || false,
        create: perms.create || false,
        edit: perms.update || false, // Map 'update' to 'edit' for compatibility
        delete: perms.delete || false
      };
    });

    defaultRoles.push({
      name: roleData.name,
      slug: roleData.slug,
      description: roleData.description,
      tenancy: tenancyId,
      isDefault: roleData.isDefault,
      color: roleData.color,
      createdBy,
      permissions: convertedPermissions
    });
  });

  return defaultRoles;
};

/**
 * Create default roles for a tenancy
 */
roleSchema.statics.createDefaultRoles = async function (tenancyId, createdBy) {
  try {
    const defaultRoles = this.getDefaultRoles(tenancyId, createdBy);
    const createdRoles = [];

    for (const roleData of defaultRoles) {
      // Check if role already exists for this tenancy
      const existing = await this.findOne({
        tenancy: tenancyId,
        slug: roleData.slug
      });

      if (!existing) {
        const role = await this.create(roleData);
        createdRoles.push(role);
        console.log(`✅ Created tenant role: ${roleData.name} for tenancy ${tenancyId}`);
      } else {
        console.log(`⚠️ Tenant role already exists: ${roleData.name} for tenancy ${tenancyId}`);
      }
    }

    return createdRoles;
  } catch (error) {
    console.error('Error creating default tenant roles:', error);
    throw error;
  }
};

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
