const mongoose = require('mongoose');

/**
 * Permission schema for each module
 * Each module can have view, create, update, delete, export permissions
 */
const modulePermissionSchema = new mongoose.Schema({
  view: { type: Boolean, default: false },
  create: { type: Boolean, default: false },
  update: { type: Boolean, default: false },
  delete: { type: Boolean, default: false },
  export: { type: Boolean, default: false }
}, { _id: false });

/**
 * SuperAdminRole Schema
 * Defines roles with granular permissions for SuperAdmins at platform level
 */
const superAdminRoleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  
  // Platform-level permissions
  permissions: {
    // Tenancy Management
    tenancies: { type: modulePermissionSchema, default: () => ({}) },
    
    // User Management
    superadmins: { type: modulePermissionSchema, default: () => ({}) },
    admins: { type: modulePermissionSchema, default: () => ({}) },
    customers: { type: modulePermissionSchema, default: () => ({}) },
    
    // Platform Analytics
    analytics: { type: modulePermissionSchema, default: () => ({}) },
    reports: { type: modulePermissionSchema, default: () => ({}) },
    
    // Billing & Finance
    billing: { type: modulePermissionSchema, default: () => ({}) },
    settlements: { type: modulePermissionSchema, default: () => ({}) },
    
    // Platform Settings
    system_settings: { type: modulePermissionSchema, default: () => ({}) },
    features: { type: modulePermissionSchema, default: () => ({}) },
    
    // Audit & Security
    audit_logs: { type: modulePermissionSchema, default: () => ({}) },
    security: { type: modulePermissionSchema, default: () => ({}) },
    
    // Marketing & Campaigns
    campaigns: { type: modulePermissionSchema, default: () => ({}) },
    banners: { type: modulePermissionSchema, default: () => ({}) },
    
    // Support
    leads: { type: modulePermissionSchema, default: () => ({}) },
    tickets: { type: modulePermissionSchema, default: () => ({}) }
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
    ref: 'SuperAdmin'
  },
  
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin'
  }
}, { 
  timestamps: true 
});

// Indexes
superAdminRoleSchema.index({ slug: 1 }, { unique: true });
superAdminRoleSchema.index({ isActive: 1 });
superAdminRoleSchema.index({ createdAt: -1 });

/**
 * Check if role has specific permission
 * @param {string} module - Module name (e.g., 'tenancies')
 * @param {string} action - Action name (e.g., 'view', 'create')
 * @returns {boolean} - True if permission is granted
 */
superAdminRoleSchema.methods.hasPermission = function(module, action) {
  if (!this.permissions[module]) return false;
  return this.permissions[module][action] === true;
};

/**
 * Get all enabled permissions as flat array
 * @returns {string[]} - Array of enabled permissions in format 'module.action'
 */
superAdminRoleSchema.methods.getEnabledPermissions = function() {
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
 * Static method to get default roles for platform setup
 * @returns {Array} - Array of default role definitions
 */
superAdminRoleSchema.statics.getDefaultRoles = function() {
  return [
    {
      name: 'Super Administrator',
      slug: 'super-administrator',
      description: 'Full platform access with all permissions',
      isDefault: true,
      color: '#dc2626', // red
      permissions: {
        tenancies: { view: true, create: true, update: true, delete: true, export: true },
        superadmins: { view: true, create: true, update: true, delete: true, export: true },
        admins: { view: true, create: true, update: true, delete: true, export: true },
        customers: { view: true, create: true, update: true, delete: true, export: true },
        analytics: { view: true, create: true, update: true, delete: true, export: true },
        reports: { view: true, create: true, update: true, delete: true, export: true },
        billing: { view: true, create: true, update: true, delete: true, export: true },
        settlements: { view: true, create: true, update: true, delete: true, export: true },
        system_settings: { view: true, create: true, update: true, delete: true, export: true },
        features: { view: true, create: true, update: true, delete: true, export: true },
        audit_logs: { view: true, create: true, update: true, delete: true, export: true },
        security: { view: true, create: true, update: true, delete: true, export: true },
        campaigns: { view: true, create: true, update: true, delete: true, export: true },
        banners: { view: true, create: true, update: true, delete: true, export: true },
        leads: { view: true, create: true, update: true, delete: true, export: true },
        tickets: { view: true, create: true, update: true, delete: true, export: true }
      }
    },
    {
      name: 'Analytics Manager',
      slug: 'analytics-manager',
      description: 'View and manage analytics and reports',
      isDefault: true,
      color: '#2563eb', // blue
      permissions: {
        tenancies: { view: true, create: false, update: false, delete: false, export: false },
        analytics: { view: true, create: true, update: true, delete: false, export: true },
        reports: { view: true, create: true, update: true, delete: false, export: true },
        billing: { view: true, create: false, update: false, delete: false, export: true }
      }
    },
    {
      name: 'Support Manager',
      slug: 'support-manager',
      description: 'Manage customer support and leads',
      isDefault: true,
      color: '#16a34a', // green
      permissions: {
        tenancies: { view: true, create: false, update: false, delete: false, export: false },
        customers: { view: true, create: false, update: true, delete: false, export: false },
        leads: { view: true, create: true, update: true, delete: false, export: true },
        tickets: { view: true, create: true, update: true, delete: false, export: false }
      }
    },
    {
      name: 'Billing Manager',
      slug: 'billing-manager',
      description: 'Manage billing and settlements',
      isDefault: true,
      color: '#ca8a04', // yellow
      permissions: {
        tenancies: { view: true, create: false, update: false, delete: false, export: false },
        billing: { view: true, create: true, update: true, delete: false, export: true },
        settlements: { view: true, create: true, update: true, delete: false, export: true },
        analytics: { view: true, create: false, update: false, delete: false, export: true }
      }
    }
  ];
};

/**
 * Create default roles for platform
 * @returns {Promise<Array>} - Array of created roles
 */
superAdminRoleSchema.statics.createDefaultRoles = async function() {
  const defaultRoles = this.getDefaultRoles();
  const createdRoles = [];
  
  for (const roleData of defaultRoles) {
    const existing = await this.findOne({ slug: roleData.slug });
    if (!existing) {
      const role = await this.create(roleData);
      createdRoles.push(role);
    }
  }
  
  return createdRoles;
};

const SuperAdminRole = mongoose.model('SuperAdminRole', superAdminRoleSchema);

module.exports = SuperAdminRole;
