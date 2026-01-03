const mongoose = require('mongoose')

const permissionSchema = new mongoose.Schema({
  module: {
    type: String,
    required: true,
    enum: ['orders', 'customers', 'inventory', 'reports', 'settings', 'staff', 'finances', 'analytics']
  },
  actions: [{
    type: String,
    enum: ['create', 'read', 'update', 'delete', 'approve', 'export']
  }],
  restrictions: {
    maxAmount: { type: Number }, // For financial operations
    maxDiscount: { type: Number }, // For discount permissions
    timeRestriction: { type: String }, // e.g., "business_hours_only"
    branchRestriction: { type: Boolean, default: false } // Restrict to own branch only
  }
})

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  displayName: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  level: {
    type: Number,
    required: true,
    min: 1,
    max: 10 // 1 = highest authority, 10 = lowest
  },
  category: {
    type: String,
    enum: ['management', 'operations', 'support', 'custom'],
    required: true
  },
  
  // Permissions
  permissions: [permissionSchema],
  
  // Role Settings
  settings: {
    canCreateUsers: { type: Boolean, default: false },
    canAssignRoles: { type: Boolean, default: false },
    canModifyBranch: { type: Boolean, default: false },
    canViewReports: { type: Boolean, default: false },
    canExportData: { type: Boolean, default: false },
    requireApproval: { type: Boolean, default: false }, // For sensitive operations
    sessionTimeout: { type: Number, default: 8 }, // Hours
    maxConcurrentSessions: { type: Number, default: 3 }
  },
  
  // Financial Limits
  financialLimits: {
    maxRefundAmount: { type: Number, default: 0 },
    maxDiscountPercent: { type: Number, default: 0 },
    maxOrderValue: { type: Number, default: 0 },
    canProcessPayments: { type: Boolean, default: false },
    canViewFinancials: { type: Boolean, default: false }
  },
  
  // Operational Limits
  operationalLimits: {
    maxOrdersPerDay: { type: Number },
    canCancelOrders: { type: Boolean, default: false },
    canModifyOrders: { type: Boolean, default: false },
    canAssignDrivers: { type: Boolean, default: false },
    canManageInventory: { type: Boolean, default: false }
  },
  
  // System Access
  systemAccess: {
    dashboardAccess: { type: Boolean, default: true },
    mobileAppAccess: { type: Boolean, default: true },
    apiAccess: { type: Boolean, default: false },
    adminPanelAccess: { type: Boolean, default: false }
  },
  
  // Role Status
  isActive: {
    type: Boolean,
    default: true
  },
  isSystemRole: {
    type: Boolean,
    default: false // System roles cannot be deleted
  },
  
  // Hierarchy
  parentRole: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  },
  childRoles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  }],
  
  // Usage Statistics
  stats: {
    userCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    lastUsed: { type: Date }
  },
  
  // Creation Info
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
})

// Indexes
roleSchema.index({ name: 1 })
roleSchema.index({ level: 1 })
roleSchema.index({ category: 1 })
roleSchema.index({ isActive: 1 })

// Virtual for permission count
roleSchema.virtual('permissionCount').get(function() {
  return this.permissions.length
})

// Method to check if role has specific permission
roleSchema.methods.hasPermission = function(module, action) {
  const permission = this.permissions.find(p => p.module === module)
  return permission && permission.actions.includes(action)
}

// Method to add permission
roleSchema.methods.addPermission = function(module, actions, restrictions = {}) {
  const existingPermission = this.permissions.find(p => p.module === module)
  
  if (existingPermission) {
    // Merge actions
    const newActions = [...new Set([...existingPermission.actions, ...actions])]
    existingPermission.actions = newActions
    existingPermission.restrictions = { ...existingPermission.restrictions, ...restrictions }
  } else {
    this.permissions.push({ module, actions, restrictions })
  }
  
  return this.save()
}

// Method to remove permission
roleSchema.methods.removePermission = function(module, action = null) {
  if (action) {
    const permission = this.permissions.find(p => p.module === module)
    if (permission) {
      permission.actions = permission.actions.filter(a => a !== action)
      if (permission.actions.length === 0) {
        this.permissions = this.permissions.filter(p => p.module !== module)
      }
    }
  } else {
    this.permissions = this.permissions.filter(p => p.module !== module)
  }
  
  return this.save()
}

// Method to check if role can perform action with restrictions
roleSchema.methods.canPerformAction = function(module, action, context = {}) {
  const permission = this.permissions.find(p => p.module === module)
  
  if (!permission || !permission.actions.includes(action)) {
    return { allowed: false, reason: 'Permission not granted' }
  }
  
  const restrictions = permission.restrictions
  
  // Check amount restrictions
  if (restrictions.maxAmount && context.amount > restrictions.maxAmount) {
    return { 
      allowed: false, 
      reason: `Amount exceeds limit of ₹${restrictions.maxAmount}` 
    }
  }
  
  // Check discount restrictions
  if (restrictions.maxDiscount && context.discount > restrictions.maxDiscount) {
    return { 
      allowed: false, 
      reason: `Discount exceeds limit of ${restrictions.maxDiscount}%` 
    }
  }
  
  // Check time restrictions
  if (restrictions.timeRestriction === 'business_hours_only') {
    const now = new Date()
    const hour = now.getHours()
    if (hour < 9 || hour > 18) {
      return { 
        allowed: false, 
        reason: 'Action only allowed during business hours (9 AM - 6 PM)' 
      }
    }
  }
  
  // Check branch restrictions
  if (restrictions.branchRestriction && context.userBranch !== context.targetBranch) {
    return { 
      allowed: false, 
      reason: 'Action restricted to own branch only' 
    }
  }
  
  return { allowed: true }
}

// Static method to create default roles
roleSchema.statics.createDefaultRoles = async function(createdBy) {
  const defaultRoles = [
    {
      name: 'admin',
      displayName: 'Admin',
      description: 'Full control over branch operations',
      level: 2,
      category: 'management',
      permissions: [
        { module: 'orders', actions: ['create', 'read', 'update', 'delete'] },
        { module: 'customers', actions: ['create', 'read', 'update'] },
        { module: 'staff', actions: ['create', 'read', 'update', 'delete'] },
        { module: 'inventory', actions: ['create', 'read', 'update', 'delete'] },
        { module: 'reports', actions: ['read', 'export'] },
        { module: 'finances', actions: ['read'], restrictions: { maxAmount: 5000 } },
        { module: 'settings', actions: ['read', 'update'] }
      ],
      settings: {
        canCreateUsers: true,
        canViewReports: true,
        canExportData: true,
        canModifyBranch: true
      },
      financialLimits: {
        maxRefundAmount: 1000,
        maxDiscountPercent: 15,
        canViewFinancials: true
      },
      isSystemRole: true,
      createdBy
    },
    {
      name: 'supervisor',
      displayName: 'Supervisor',
      description: 'Supervises daily operations and staff',
      level: 3,
      category: 'operations',
      permissions: [
        { module: 'orders', actions: ['create', 'read', 'update'] },
        { module: 'customers', actions: ['read', 'update'] },
        { module: 'staff', actions: ['read'] },
        { module: 'inventory', actions: ['read', 'update'] }
      ],
      financialLimits: {
        maxRefundAmount: 500,
        maxDiscountPercent: 10
      },
      isSystemRole: true,
      createdBy
    },
    {
      name: 'staff',
      displayName: 'Staff Member',
      description: 'Basic operational access',
      level: 4,
      category: 'operations',
      permissions: [
        { module: 'orders', actions: ['read', 'update'] },
        { module: 'customers', actions: ['read'] },
        { module: 'inventory', actions: ['read'] }
      ],
      financialLimits: {
        maxRefundAmount: 200,
        maxDiscountPercent: 5
      },
      isSystemRole: true,
      createdBy
    },
    {
      name: 'driver',
      displayName: 'Delivery Driver',
      description: 'Pickup and delivery operations',
      level: 5,
      category: 'operations',
      permissions: [
        { module: 'orders', actions: ['read', 'update'] }
      ],
      operationalLimits: {
        canCancelOrders: false,
        canModifyOrders: false
      },
      isSystemRole: true,
      createdBy
    }
  ]
  
  const createdRoles = []
  for (const roleData of defaultRoles) {
    const existingRole = await this.findOne({ name: roleData.name })
    if (!existingRole) {
      const role = new this(roleData)
      await role.save()
      createdRoles.push(role)
    }
  }
  
  return createdRoles
}

module.exports = mongoose.model('Role', roleSchema)