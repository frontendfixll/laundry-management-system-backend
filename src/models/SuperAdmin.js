const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  ipAddress: { type: String, required: true },
  userAgent: { type: String, required: true },
  location: { type: String },
  isActive: { type: Boolean, default: true },
  lastActivity: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
})

const superAdminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'superadmin' },

  // Session Management
  sessions: [sessionSchema],

  // Security Settings
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  lastLogin: { type: Date },
  lastLoginIP: { type: String },
  lastActivity: { type: Date, default: Date.now },

  // Password Reset
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },

  // RBAC: Multiple roles support
  roles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdminRole'
  }],

  // Permissions Overrides (Granular RBAC)
  customPermissions: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Legacy permissions (deprecated, kept for backward compatibility)
  permissions: {
    branches: { type: Boolean, default: true },
    users: { type: Boolean, default: true },
    orders: { type: Boolean, default: true },
    finances: { type: Boolean, default: true },
    analytics: { type: Boolean, default: true },
    settings: { type: Boolean, default: true },
    admins: { type: Boolean, default: true },
    pricing: { type: Boolean, default: true },
    audit: { type: Boolean, default: true },
    // RBAC permissions for SuperAdmin
    superadmins: {
      view: { type: Boolean, default: true },
      create: { type: Boolean, default: true },
      update: { type: Boolean, default: true },
      delete: { type: Boolean, default: true },
      export: { type: Boolean, default: true }
    }
  },

  // Profile
  phone: { type: String },
  avatar: { type: String },
  isActive: { type: Boolean, default: true },

  // Audit
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
})

// Indexes
superAdminSchema.index({ email: 1 })

// Pre-save middleware to hash password
superAdminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()

  try {
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// Method to compare password
superAdminSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password)
}

// Method to add session
superAdminSchema.methods.addSession = function (sessionData) {
  const session = {
    sessionId: sessionData.sessionId,
    ipAddress: sessionData.ipAddress || 'unknown',
    userAgent: sessionData.userAgent || 'unknown',
    location: sessionData.location,
    isActive: true,
    lastActivity: new Date(),
    createdAt: new Date(),
    expiresAt: sessionData.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
  this.sessions.push(session)
  return this.save()
}

// Method to remove session
superAdminSchema.methods.removeSession = function (sessionId) {
  this.sessions = this.sessions.filter(session => session.sessionId !== sessionId)
  return this.save()
}

// Method to clean expired sessions
superAdminSchema.methods.cleanExpiredSessions = function () {
  const now = new Date()
  this.sessions = this.sessions.filter(session => session.expiresAt > now)
  return this.save()
}

// Method to increment login attempts
superAdminSchema.methods.incLoginAttempts = function () {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    })
  }
  // Otherwise increment
  const updates = { $inc: { loginAttempts: 1 } }
  // Lock the account if we've reached max attempts
  if (this.loginAttempts + 1 >= 5) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 } // 2 hour lock
  }
  return this.updateOne(updates)
}

// Method to reset login attempts
superAdminSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  })
}

// Method to get effective permissions from all assigned roles
superAdminSchema.methods.getEffectivePermissions = async function () {
  // If no roles assigned, fallback to legacy permissions
  if (!this.roles || this.roles.length === 0) {
    // Convert legacy permissions to new format
    const legacyPerms = { ...this.permissions };

    // Handle nested superadmins permissions
    if (legacyPerms.superadmins && typeof legacyPerms.superadmins === 'object') {
      // Already in correct format
      return legacyPerms;
    }

    return legacyPerms;
  }

  const SuperAdminRole = mongoose.model('SuperAdminRole');

  // Populate roles if they're not already populated
  let populatedRoles;
  if (this.roles[0] && typeof this.roles[0] === 'object' && this.roles[0].permissions) {
    // Already populated
    populatedRoles = this.roles.filter(role => role.isActive !== false);
  } else {
    // Need to populate
    populatedRoles = await SuperAdminRole.find({
      _id: { $in: this.roles },
      isActive: true
    });
  }

  console.log('🔍 Roles found for permission calculation:', populatedRoles.map(r => ({
    name: r.name,
    slug: r.slug,
    permissions: r.permissions instanceof Map ? Array.from(r.permissions.keys()) : Object.keys(r.permissions || {})
  })));

  // Combine permissions using OR logic (user has permission if ANY role grants it)
  const effectivePerms = {};

  // 0. Fallback for Legacy SuperAdmin role
  if (this.role === 'superadmin') {
    Object.entries(this.permissions || {}).forEach(([module, value]) => {
      if (value === true) {
        effectivePerms[module] = { view: true, create: true, update: true, delete: true, export: true };
      }
    });
  }

  // 1. Merge Role Permissions

  // Permission Short Code Map
  const SHORT_CODES = {
    'r': 'view',
    'c': 'create',
    'u': 'update',
    'd': 'delete',
    'e': 'export'
  };

  populatedRoles.forEach(role => {
    if (role.permissions) {
      // Handle Mongoose Map vs Plain Object
      const permissionsObj = role.permissions instanceof Map
        ? Object.fromEntries(role.permissions)
        : role.permissions;

      Object.entries(permissionsObj).forEach(([module, permValue]) => {
        if (!effectivePerms[module]) {
          effectivePerms[module] = {};
        }

        // Handle Compact String Format (New, e.g., "rc")
        if (typeof permValue === 'string') {
          permValue.split('').forEach(char => {
            const action = SHORT_CODES[char];
            if (action) {
              effectivePerms[module][action] = true;
            }
          });
        }
        // Handle Legacy Object Format (Old, e.g., { view: true })
        else if (typeof permValue === 'object' && permValue !== null) {
          Object.entries(permValue).forEach(([action, value]) => {
            if (value === true) {
              effectivePerms[module][action] = true;
            }
          });
        }
        // Handle Boolean Format (Legacy, e.g., true)
        else if (permValue === true) {
          effectivePerms[module] = true;
        }
      });
    }
  });

  // 2. Merge Custom User-Specific Permissions (Overrides)
  if (this.customPermissions) {
    const customPermsObj = this.customPermissions instanceof Map
      ? Object.fromEntries(this.customPermissions)
      : this.customPermissions;

    if (typeof customPermsObj === 'object') {
      Object.entries(customPermsObj).forEach(([module, perms]) => {
        // Initialize if missing
        if (!effectivePerms[module]) {
          effectivePerms[module] = {};
        }

        // Handle Compact String (Overrides)
        if (typeof perms === 'string') {
          // If string provided, it REPLACES the module permissions largely, 
          // but for granular merge we might want to just set them.
          // Assuming string overrides means "these are the enabled permissions"
          perms.split('').forEach(char => {
            const action = SHORT_CODES[char];
            if (action) {
              effectivePerms[module][action] = true;
            }
          });
        }
        // Handle Object (Overrides)
        else if (typeof perms === 'object' && perms !== null) {
          Object.entries(perms).forEach(([action, value]) => {
            effectivePerms[module][action] = value; // value can be false to revoke
          });
        }
      });
    }
  }

  // 3. Map Legacy Keys to New Keys for backward compatibility
  const LEGACY_MAPPING = {
    'finances': 'payments_revenue',
    'billing': 'subscription_plans',
    'audit': 'audit_logs',
    'users': 'user_management',
    'admins': 'platform_settings',
    'superadmins': 'platform_settings',
    'user_management': 'platform_settings'
  };

  Object.entries(LEGACY_MAPPING).forEach(([legacyKey, newKey]) => {
    const hasLegacy = effectivePerms[legacyKey] && Object.keys(effectivePerms[legacyKey]).length > 0;
    const isNewEmpty = !effectivePerms[newKey] || Object.keys(effectivePerms[newKey]).length === 0;

    if (hasLegacy && isNewEmpty) {
      effectivePerms[newKey] = { ...effectivePerms[legacyKey] };
    }
  });

  console.log('🔍 Final effective permissions (including mapped):', effectivePerms);
  return effectivePerms;
};

// Method to check if has specific permission
superAdminSchema.methods.hasPermission = async function (module, action) {
  // First check if user has actual Super Admin role (highest privilege)
  const SuperAdminRole = mongoose.model('SuperAdminRole');
  const roles = await SuperAdminRole.find({
    _id: { $in: this.roles || [] },
    isActive: true
  });

  const hasActualSuperAdminRole = roles.some(role =>
    role.slug === 'super_admin' || role.name === 'Super Admin'
  );

  if (hasActualSuperAdminRole) {
    // Super Admin has all permissions
    return true;
  }

  const effectivePerms = await this.getEffectivePermissions();

  // Check if permission exists in effective permissions
  if (effectivePerms[module]?.[action] === true) {
    return true;
  }

  // For legacy compatibility, check if it's a simple boolean permission
  if (effectivePerms[module] === true) {
    return true;
  }

  return false;
}

module.exports = mongoose.model('SuperAdmin', superAdminSchema)
