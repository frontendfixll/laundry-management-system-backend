const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { USER_ROLES, WORKER_TYPES } = require('../config/constants');

// RBAC Permission Schema for Admin role
const permissionActionSchema = new mongoose.Schema({
  view: { type: Boolean, default: false },
  create: { type: Boolean, default: false },
  update: { type: Boolean, default: false },
  delete: { type: Boolean, default: false }
}, { _id: false });

const adminPermissionsSchema = new mongoose.Schema({
  orders: {
    view: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    assign: { type: Boolean, default: false },
    cancel: { type: Boolean, default: false },
    process: { type: Boolean, default: false }
  },
  staff: {
    view: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    assignShift: { type: Boolean, default: false },
    manageAttendance: { type: Boolean, default: false }
  },
  inventory: {
    view: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    restock: { type: Boolean, default: false },
    writeOff: { type: Boolean, default: false }
  },
  services: {
    view: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    toggle: { type: Boolean, default: false },
    updatePricing: { type: Boolean, default: false }
  },
  customers: {
    view: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false }
  },
  logistics: {
    view: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    assign: { type: Boolean, default: false },
    track: { type: Boolean, default: false }
  },
  tickets: {
    view: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    assign: { type: Boolean, default: false },
    resolve: { type: Boolean, default: false },
    escalate: { type: Boolean, default: false }
  },
  performance: {
    view: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false },
    export: { type: Boolean, default: false }
  },
  analytics: {
    view: { type: Boolean, default: false }
  },
  settings: {
    view: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    update: { type: Boolean, default: false },
    delete: { type: Boolean, default: false }
  }
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    unique: true,
    match: [/^[6-9]\d{9}$/, 'Please enter a valid 10-digit phone number']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['admin', 'staff', 'customer'],  // Simplified roles (superadmin is separate model)
    default: 'customer'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVIP: {
    type: Boolean,
    default: false
  },
  // Customer specific fields
  addresses: [{
    name: String,
    phone: String,
    addressLine1: String,
    addressLine2: String,
    landmark: String,
    city: String,
    pincode: String,
    addressType: {
      type: String,
      enum: ['home', 'office', 'other'],
      default: 'home'
    },
    isDefault: {
      type: Boolean,
      default: false
    }
  }],
  preferences: {
    preferredPickupTime: String,
    savedServices: [String]
  },
  // Admin/Staff specific - Branch assignment
  assignedBranch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch'
  },
  // Admin RBAC permissions (structured schema)
  permissions: {
    type: adminPermissionsSchema,
    default: () => ({})
  },
  // Staff/Worker specific fields
  workerType: {
    type: String,
    enum: Object.values(WORKER_TYPES),
    default: WORKER_TYPES.GENERAL
  },
  // New: Reference to StaffType (dynamic staff types)
  staffType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StaffType'
  },
  // Rewards
  rewardPoints: {
    type: Number,
    default: 0
  },
  totalOrders: {
    type: Number,
    default: 0
  },
  // Email verification
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    select: false
  },
  emailVerificationExpires: {
    type: Date,
    select: false
  },
  // Password reset
  passwordResetToken: {
    type: String,
    select: false
  },
  passwordResetExpires: {
    type: Date,
    select: false
  },
  // Timestamps
  lastLogin: Date,
  phoneVerified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for performance
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ role: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Update last login
userSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  return this.save({ validateBeforeSave: false });
};

// Generate email verification token
userSchema.methods.generateEmailVerificationToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  
  this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  return token;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  
  return token;
};

// Check if admin has specific permission
userSchema.methods.hasPermission = function(module, action) {
  if (this.role !== 'admin') return false;
  return this.permissions?.[module]?.[action] === true;
};

// Get all permissions for a module
userSchema.methods.getModulePermissions = function(module) {
  if (this.role !== 'admin') return {};
  return this.permissions?.[module] || {};
};

// Default admin permissions (all enabled)
userSchema.statics.getDefaultAdminPermissions = function() {
  return {
    orders: { view: true, create: true, update: true, delete: true, assign: true, cancel: true, process: true },
    staff: { view: true, create: true, update: true, delete: true, assignShift: true, manageAttendance: true },
    inventory: { view: true, create: true, update: true, delete: true, restock: true, writeOff: true },
    services: { view: true, create: true, update: true, delete: true, toggle: true, updatePricing: true },
    customers: { view: true, create: true, update: true, delete: true },
    logistics: { view: true, create: true, update: true, delete: true, assign: true, track: true },
    tickets: { view: true, create: true, update: true, delete: true, assign: true, resolve: true, escalate: true },
    performance: { view: true, create: true, update: true, delete: true, export: true },
    analytics: { view: true },
    settings: { view: true, create: true, update: true, delete: true }
  };
};

module.exports = mongoose.model('User', userSchema);