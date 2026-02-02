const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  ipAddress: { type: String, required: true },
  userAgent: { type: String, required: true },
  location: { type: String },
  isActive: { type: Boolean, default: true },
  lastActivity: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});

const salesUserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  phone: { type: String },
  role: { type: String, default: 'sales_admin' },
  
  // New RBAC Role System
  roleSlug: { 
    type: String, 
    default: 'platform-sales',
    enum: ['platform-sales', 'platform-sales-junior', 'platform-sales-senior']
  },
  roles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdminRole'
  }],
  
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
  
  // Sales-specific fields
  employeeId: { type: String, unique: true, sparse: true },
  department: { type: String, default: 'Sales' },
  designation: { type: String, default: 'Sales Executive' },
  
  // Permissions (limited compared to SuperAdmin)
  permissions: {
    // Lead Management
    leads: {
      view: { type: Boolean, default: true },
      create: { type: Boolean, default: true },
      update: { type: Boolean, default: true },
      delete: { type: Boolean, default: false },
      export: { type: Boolean, default: true }
    },
    // Trial Management
    trials: {
      view: { type: Boolean, default: true },
      extend: { type: Boolean, default: true },
      convert: { type: Boolean, default: true }
    },
    // Subscription Management
    subscriptions: {
      view: { type: Boolean, default: true },
      activate: { type: Boolean, default: true },
      pause: { type: Boolean, default: true },
      upgrade: { type: Boolean, default: true },
      downgrade: { type: Boolean, default: true }
    },
    // Plan Assignment
    plans: {
      view: { type: Boolean, default: true },
      assign: { type: Boolean, default: true },
      customPricing: { type: Boolean, default: false }, // Requires approval
      createPlan: { type: Boolean, default: false } // Only SuperAdmin
    },
    // Payment Management
    payments: {
      view: { type: Boolean, default: true },
      generateLink: { type: Boolean, default: true },
      recordOffline: { type: Boolean, default: true },
      markPaid: { type: Boolean, default: true }
    },
    // Analytics
    analytics: {
      view: { type: Boolean, default: true },
      export: { type: Boolean, default: true }
    },
    // Upgrade Management
    upgrades: {
      view: { type: Boolean, default: true },
      create: { type: Boolean, default: true },
      update: { type: Boolean, default: true },
      delete: { type: Boolean, default: false },
      payment: { type: Boolean, default: true },
      remind: { type: Boolean, default: true },
      extend: { type: Boolean, default: true }
    },
    // Tenancy Management (limited)
    tenancies: {
      view: { type: Boolean, default: true },
      create: { type: Boolean, default: false }, // Only SuperAdmin
      update: { type: Boolean, default: false },
      delete: { type: Boolean, default: false }
    }
  },
  
  // Sales Performance Tracking
  performance: {
    leadsAssigned: { type: Number, default: 0 },
    leadsConverted: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    currentMonthRevenue: { type: Number, default: 0 },
    target: { type: Number, default: 0 },
    targetAchieved: { type: Number, default: 0 }
  },
  
  // Status
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  
  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin'
  }
}, {
  timestamps: true
});

// Hash password before saving
salesUserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
salesUserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Check if account is locked
salesUserSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Increment login attempts
salesUserSchema.methods.incLoginAttempts = function() {
  // Reset attempts if lock has expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }
  
  // Increment attempts
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000; // 2 hours
  
  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + lockTime };
  }
  
  return this.updateOne(updates);
};

// Reset login attempts
salesUserSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 }
  });
};

// Add session
salesUserSchema.methods.addSession = function(sessionData) {
  this.sessions.push(sessionData);
  return this.save();
};

// Remove session
salesUserSchema.methods.removeSession = function(sessionId) {
  this.sessions = this.sessions.filter(s => s.sessionId !== sessionId);
  return this.save();
};

// Check permission (legacy method - kept for backward compatibility)
salesUserSchema.methods.hasPermission = function(module, action) {
  if (!this.permissions || !this.permissions[module]) {
    return false;
  }
  return this.permissions[module][action] === true;
};

// New RBAC permission check method
salesUserSchema.methods.hasRBACPermission = async function(module, action) {
  // If no roles assigned, fall back to legacy permissions
  if (!this.roles || this.roles.length === 0) {
    return this.hasPermission(module, action);
  }

  // Populate roles if not already populated
  if (!this.populated('roles')) {
    await this.populate('roles');
  }

  // Check permissions across all assigned roles
  for (const role of this.roles) {
    if (role && role.hasPermission && role.hasPermission(module, action)) {
      return true;
    }
  }

  return false;
};

// Get effective permissions from roles
salesUserSchema.methods.getEffectivePermissions = async function() {
  const permissions = {};

  // If no roles assigned, return legacy permissions
  if (!this.roles || this.roles.length === 0) {
    return this.permissions || {};
  }

  // Populate roles if not already populated
  if (!this.populated('roles')) {
    await this.populate('roles');
  }

  // Merge permissions from all roles
  for (const role of this.roles) {
    if (role && role.permissions) {
      Object.entries(role.permissions).forEach(([module, permString]) => {
        if (permString && typeof permString === 'string') {
          if (!permissions[module]) {
            permissions[module] = {};
          }
          
          // Convert permission string to boolean flags
          permissions[module].view = permissions[module].view || permString.includes('r');
          permissions[module].create = permissions[module].create || permString.includes('c');
          permissions[module].update = permissions[module].update || permString.includes('u');
          permissions[module].delete = permissions[module].delete || permString.includes('d');
          permissions[module].export = permissions[module].export || permString.includes('e');
        }
      });
    }
  }

  return permissions;
};

// Update performance metrics
salesUserSchema.methods.updatePerformance = function(data) {
  Object.assign(this.performance, data);
  if (this.performance.target > 0) {
    this.performance.targetAchieved = (this.performance.totalRevenue / this.performance.target) * 100;
  }
  if (this.performance.leadsAssigned > 0) {
    this.performance.conversionRate = (this.performance.leadsConverted / this.performance.leadsAssigned) * 100;
  }
  return this.save();
};

module.exports = mongoose.model('SalesUser', salesUserSchema);
