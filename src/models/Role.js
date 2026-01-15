const mongoose = require('mongoose');

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
  
  // Permissions for each module
  permissions: {
    // Core modules
    orders: { type: modulePermissionSchema, default: () => ({}) },
    customers: { type: modulePermissionSchema, default: () => ({}) },
    inventory: { type: modulePermissionSchema, default: () => ({}) },
    services: { type: modulePermissionSchema, default: () => ({}) },
    
    // Branch management
    branches: { type: modulePermissionSchema, default: () => ({}) },
    staff: { type: modulePermissionSchema, default: () => ({}) },
    
    // Marketing & Programs
    coupons: { type: modulePermissionSchema, default: () => ({}) },
    campaigns: { type: modulePermissionSchema, default: () => ({}) },
    banners: { type: modulePermissionSchema, default: () => ({}) },
    loyalty: { type: modulePermissionSchema, default: () => ({}) },
    referrals: { type: modulePermissionSchema, default: () => ({}) },
    wallet: { type: modulePermissionSchema, default: () => ({}) },
    
    // Operations
    logistics: { type: modulePermissionSchema, default: () => ({}) },
    tickets: { type: modulePermissionSchema, default: () => ({}) },
    
    // Finance & Reports
    payments: { type: modulePermissionSchema, default: () => ({}) },
    refunds: { type: modulePermissionSchema, default: () => ({}) },
    performance: { type: modulePermissionSchema, default: () => ({}) },
    
    // Settings
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
roleSchema.methods.hasPermission = function(module, action) {
  if (!this.permissions[module]) return false;
  return this.permissions[module][action] === true;
};

/**
 * Get all enabled permissions as flat array
 */
roleSchema.methods.getEnabledPermissions = function() {
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
 */
roleSchema.statics.getDefaultRoles = function(tenancyId, createdBy) {
  return [
    {
      name: 'Admin',
      slug: 'admin',
      description: 'Full access to all features',
      tenancy: tenancyId,
      isDefault: true,
      color: '#dc2626', // red
      createdBy,
      permissions: {
        orders: { view: true, create: true, edit: true, delete: true },
        customers: { view: true, create: true, edit: true, delete: true },
        inventory: { view: true, create: true, edit: true, delete: true },
        services: { view: true, create: true, edit: true, delete: true },
        branches: { view: true, create: true, edit: true, delete: true },
        staff: { view: true, create: true, edit: true, delete: true },
        coupons: { view: true, create: true, edit: true, delete: true },
        campaigns: { view: true, create: true, edit: true, delete: true },
        banners: { view: true, create: true, edit: true, delete: true },
        loyalty: { view: true, create: true, edit: true, delete: true },
        referrals: { view: true, create: true, edit: true, delete: true },
        wallet: { view: true, create: true, edit: true, delete: true },
        logistics: { view: true, create: true, edit: true, delete: true },
        tickets: { view: true, create: true, edit: true, delete: true },
        payments: { view: true, create: true, edit: true, delete: true },
        refunds: { view: true, create: true, edit: true, delete: true },
        performance: { view: true, create: true, edit: true, delete: true },
        settings: { view: true, create: true, edit: true, delete: true },
        branding: { view: true, create: true, edit: true, delete: true }
      }
    },
    {
      name: 'Manager',
      slug: 'manager',
      description: 'Manage daily operations',
      tenancy: tenancyId,
      isDefault: true,
      color: '#2563eb', // blue
      createdBy,
      permissions: {
        orders: { view: true, create: true, edit: true, delete: false },
        customers: { view: true, create: true, edit: true, delete: false },
        inventory: { view: true, create: true, edit: true, delete: false },
        services: { view: true, create: false, edit: false, delete: false },
        branches: { view: true, create: false, edit: false, delete: false },
        staff: { view: true, create: true, edit: true, delete: false },
        coupons: { view: true, create: true, edit: true, delete: false },
        campaigns: { view: true, create: false, edit: false, delete: false },
        banners: { view: true, create: false, edit: false, delete: false },
        loyalty: { view: true, create: false, edit: false, delete: false },
        referrals: { view: true, create: false, edit: false, delete: false },
        wallet: { view: true, create: false, edit: false, delete: false },
        logistics: { view: true, create: true, edit: true, delete: false },
        tickets: { view: true, create: true, edit: true, delete: false },
        payments: { view: true, create: false, edit: false, delete: false },
        refunds: { view: true, create: true, edit: false, delete: false },
        performance: { view: true, create: false, edit: false, delete: false },
        settings: { view: false, create: false, edit: false, delete: false },
        branding: { view: false, create: false, edit: false, delete: false }
      }
    },
    {
      name: 'Staff',
      slug: 'staff',
      description: 'Basic order processing',
      tenancy: tenancyId,
      isDefault: true,
      color: '#16a34a', // green
      createdBy,
      permissions: {
        orders: { view: true, create: true, edit: true, delete: false },
        customers: { view: true, create: true, edit: false, delete: false },
        inventory: { view: true, create: false, edit: false, delete: false },
        services: { view: true, create: false, edit: false, delete: false },
        branches: { view: false, create: false, edit: false, delete: false },
        staff: { view: false, create: false, edit: false, delete: false },
        coupons: { view: true, create: false, edit: false, delete: false },
        campaigns: { view: false, create: false, edit: false, delete: false },
        banners: { view: false, create: false, edit: false, delete: false },
        loyalty: { view: true, create: false, edit: false, delete: false },
        referrals: { view: false, create: false, edit: false, delete: false },
        wallet: { view: false, create: false, edit: false, delete: false },
        logistics: { view: true, create: false, edit: false, delete: false },
        tickets: { view: true, create: true, edit: false, delete: false },
        payments: { view: false, create: false, edit: false, delete: false },
        refunds: { view: false, create: false, edit: false, delete: false },
        performance: { view: false, create: false, edit: false, delete: false },
        settings: { view: false, create: false, edit: false, delete: false },
        branding: { view: false, create: false, edit: false, delete: false }
      }
    },
    {
      name: 'Accountant',
      slug: 'accountant',
      description: 'Financial operations only',
      tenancy: tenancyId,
      isDefault: true,
      color: '#ca8a04', // yellow
      createdBy,
      permissions: {
        orders: { view: true, create: false, edit: false, delete: false },
        customers: { view: true, create: false, edit: false, delete: false },
        inventory: { view: false, create: false, edit: false, delete: false },
        services: { view: false, create: false, edit: false, delete: false },
        branches: { view: false, create: false, edit: false, delete: false },
        staff: { view: false, create: false, edit: false, delete: false },
        coupons: { view: false, create: false, edit: false, delete: false },
        campaigns: { view: false, create: false, edit: false, delete: false },
        banners: { view: false, create: false, edit: false, delete: false },
        loyalty: { view: false, create: false, edit: false, delete: false },
        referrals: { view: false, create: false, edit: false, delete: false },
        wallet: { view: true, create: false, edit: false, delete: false },
        logistics: { view: false, create: false, edit: false, delete: false },
        tickets: { view: false, create: false, edit: false, delete: false },
        payments: { view: true, create: true, edit: true, delete: false },
        refunds: { view: true, create: true, edit: true, delete: false },
        performance: { view: true, create: false, edit: false, delete: false },
        settings: { view: false, create: false, edit: false, delete: false },
        branding: { view: false, create: false, edit: false, delete: false }
      }
    }
  ];
};

/**
 * Create default roles for a tenancy
 */
roleSchema.statics.createDefaultRoles = async function(tenancyId, createdBy) {
  const defaultRoles = this.getDefaultRoles(tenancyId, createdBy);
  return await this.insertMany(defaultRoles);
};

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
