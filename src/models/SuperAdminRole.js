const mongoose = require('mongoose');
const { PLATFORM_ROLES } = require('../config/roleDefinitions');

/**
 * Permission schema for each module
 * Each module can have view, create, update, delete, export permissions
 */
const PERMISSION_SHORT_CODES = {
  'r': 'view',
  'c': 'create',
  'u': 'update',
  'd': 'delete',
  'e': 'export'
};

const REVERSE_PERMISSION_MAP = {
  'view': 'r',
  'create': 'c',
  'update': 'u',
  'delete': 'd',
  'export': 'e'
};

// Compact permission definition
const compactPermissionDef = { type: String, default: '' }; // e.g., "rc" for Read+Create

/**
 * SuperAdminRole Schema
 * Defines roles with granular permissions for SuperAdmins at platform level
 * Based on droles.md specification
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

  // Platform-level permissions - stored as compact strings "rcude"
  permissions: {
    // Platform Settings
    platform_settings: { type: String, default: '' },

    // Tenant Management
    tenant_crud: { type: String, default: '' },
    tenant_suspend: { type: String, default: '' },

    // Subscription & Plans
    subscription_plans: { type: String, default: '' },

    // Payments & Revenue
    payments_revenue: { type: String, default: '' },
    refunds: { type: String, default: '' },

    // Marketplace Control
    marketplace_control: { type: String, default: '' },

    // Logs & Audit
    audit_logs: { type: String, default: '' },

    // User Impersonation
    user_impersonation: { type: String, default: '' },

    // Legacy permissions
    tenancies: { type: String, default: '' },
    superadmins: { type: String, default: '' },
    admins: { type: String, default: '' },
    customers: { type: String, default: '' },
    analytics: { type: String, default: '' },
    reports: { type: String, default: '' },
    billing: { type: String, default: '' },
    settlements: { type: String, default: '' },
    system_settings: { type: String, default: '' },
    features: { type: String, default: '' },
    security: { type: String, default: '' },
    campaigns: { type: String, default: '' },
    banners: { type: String, default: '' },
    leads: { type: String, default: '' },
    tickets: { type: String, default: '' }
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
superAdminRoleSchema.methods.hasPermission = function (module, action) {
  const permString = this.permissions[module];
  if (!permString || typeof permString !== 'string') return false;

  // Map full action name to code (e.g., 'view' -> 'r')
  const code = REVERSE_PERMISSION_MAP[action];
  if (!code) return false;

  return permString.includes(code);
};

/**
 * Get all enabled permissions as flat array
 * @returns {string[]} - Array of enabled permissions in format 'module.action'
 */
superAdminRoleSchema.methods.getEnabledPermissions = function () {
  const enabled = [];
  Object.entries(this.permissions).forEach(([module, permString]) => {
    if (typeof permString === 'string') {
      permString.split('').forEach(char => {
        const action = PERMISSION_SHORT_CODES[char];
        if (action) {
          enabled.push(`${module}.${action}`);
        }
      });
    }
  });
  return enabled;
};

/**
 * Static method to get default roles for platform setup
 * Based on droles.md specification
 * @returns {Array} - Array of default role definitions
 */
superAdminRoleSchema.statics.getDefaultRoles = function () {
  // Convert PLATFORM_ROLES to the format expected by the model
  const defaultRoles = [];

  Object.values(PLATFORM_ROLES).forEach(roleData => {
    defaultRoles.push({
      name: roleData.name,
      slug: roleData.slug,
      description: roleData.description,
      isDefault: roleData.isDefault,
      color: roleData.color,
      permissions: roleData.permissions
    });
  });

  return defaultRoles;
};

/**
 * Create default roles for platform
 * @returns {Promise<Array>} - Array of created roles
 */
superAdminRoleSchema.statics.createDefaultRoles = async function () {
  const defaultRoles = this.getDefaultRoles();
  const createdRoles = [];

  for (const roleData of defaultRoles) {
    try {
      const existing = await this.findOne({ slug: roleData.slug });
      if (!existing) {
        const role = await this.create(roleData);
        createdRoles.push(role);
        console.log(`✅ Created platform role: ${roleData.name}`);
      } else {
        console.log(`⚠️ Platform role already exists: ${roleData.name}`);
      }
    } catch (error) {
      console.error(`❌ Error creating platform role ${roleData.name}:`, error);
    }
  }

  return createdRoles;
};

const SuperAdminRole = mongoose.model('SuperAdminRole', superAdminRoleSchema);

module.exports = SuperAdminRole;
