const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protectSuperAdmin } = require('../middlewares/auth');

// Valid permission modules from User model
const VALID_MODULES = [
  'orders', 'staff', 'inventory', 'services', 'customers', 
  'logistics', 'tickets', 'performance', 'analytics', 
  'settings', 'coupons', 'branches', 'branchAdmins'
];

// Valid actions per module
const VALID_ACTIONS = {
  orders: ['view', 'create', 'update', 'delete', 'assign', 'cancel', 'process'],
  staff: ['view', 'create', 'update', 'delete', 'assignShift', 'manageAttendance'],
  inventory: ['view', 'create', 'update', 'delete', 'restock', 'writeOff'],
  services: ['view', 'create', 'update', 'delete', 'toggle', 'updatePricing'],
  customers: ['view', 'create', 'update', 'delete'],
  logistics: ['view', 'create', 'update', 'delete', 'assign', 'track'],
  tickets: ['view', 'create', 'update', 'delete', 'assign', 'resolve', 'escalate'],
  performance: ['view', 'create', 'update', 'delete', 'export'],
  analytics: ['view'],
  settings: ['view', 'create', 'update', 'delete'],
  coupons: ['view', 'create', 'update', 'delete'],
  branches: ['view', 'create', 'update', 'delete'],
  branchAdmins: ['view', 'create', 'update', 'delete']
};

/**
 * @route POST /api/permissions/fix-schema
 * @desc Fix permission schema for a specific user or all users
 * @access SuperAdmin only
 */
router.post('/fix-schema', protectSuperAdmin, async (req, res) => {
  try {
    const { userEmail, grantBasicPermissions = false } = req.body;
    
    let users;
    if (userEmail) {
      const user = await User.findOne({ email: userEmail });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      users = [user];
    } else {
      users = await User.find({ 
        permissions: { $exists: true },
        role: { $in: ['admin', 'branch_admin', 'staff'] }
      });
    }
    
    let fixedCount = 0;
    const results = [];
    
    for (const user of users) {
      const result = await fixUserPermissionSchema(user, grantBasicPermissions);
      if (result.updated) {
        fixedCount++;
      }
      results.push(result);
    }
    
    res.json({
      success: true,
      message: `Fixed permissions for ${fixedCount} users`,
      data: {
        totalUsers: users.length,
        fixedUsers: fixedCount,
        results: userEmail ? results : results.slice(0, 10) // Limit results for bulk operations
      }
    });
    
  } catch (error) {
    console.error('Permission schema fix error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fix permission schema'
    });
  }
});

/**
 * @route GET /api/permissions/validate-schema/:userId
 * @desc Validate permission schema for a specific user
 * @access SuperAdmin only
 */
router.get('/validate-schema/:userId', protectSuperAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const validation = validatePermissionSchema(user.permissions);
    
    res.json({
      success: true,
      data: {
        user: {
          _id: user._id,
          email: user.email,
          role: user.role
        },
        validation
      }
    });
    
  } catch (error) {
    console.error('Permission validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate permission schema'
    });
  }
});

// Helper function to fix user permission schema
async function fixUserPermissionSchema(user, grantBasicPermissions = false) {
  try {
    const newPermissions = {};
    
    // Initialize all valid modules with default false values
    VALID_MODULES.forEach(module => {
      newPermissions[module] = {};
      VALID_ACTIONS[module].forEach(action => {
        newPermissions[module][action] = false;
      });
    });
    
    // Migrate existing permissions
    let hasValidPermissions = false;
    if (user.permissions && typeof user.permissions === 'object') {
      Object.keys(user.permissions).forEach(module => {
        if (VALID_MODULES.includes(module)) {
          const modulePerms = user.permissions[module];
          if (modulePerms && typeof modulePerms === 'object') {
            Object.keys(modulePerms).forEach(action => {
              if (VALID_ACTIONS[module].includes(action) && modulePerms[action]) {
                newPermissions[module][action] = true;
                hasValidPermissions = true;
              }
            });
          }
        }
      });
    }
    
    // Grant basic permissions if requested and user has no valid permissions
    if (grantBasicPermissions && !hasValidPermissions) {
      const basicPermissions = {
        orders: { view: true },
        customers: { view: true },
        inventory: { view: true },
        services: { view: true },
        settings: { view: true },
        analytics: { view: true }
      };
      
      Object.keys(basicPermissions).forEach(module => {
        Object.keys(basicPermissions[module]).forEach(action => {
          newPermissions[module][action] = basicPermissions[module][action];
        });
      });
      hasValidPermissions = true;
    }
    
    // Update user
    await User.findByIdAndUpdate(user._id, { permissions: newPermissions });
    
    return {
      userId: user._id,
      email: user.email,
      updated: true,
      hadValidPermissions: hasValidPermissions,
      newPermissions
    };
    
  } catch (error) {
    return {
      userId: user._id,
      email: user.email,
      updated: false,
      error: error.message
    };
  }
}

// Helper function to validate permission schema
function validatePermissionSchema(permissions) {
  const issues = [];
  const validModules = [];
  const invalidModules = [];
  
  if (!permissions || typeof permissions !== 'object') {
    issues.push('Permissions object is missing or invalid');
    return { isValid: false, issues, validModules, invalidModules };
  }
  
  Object.keys(permissions).forEach(module => {
    if (VALID_MODULES.includes(module)) {
      validModules.push(module);
      
      const modulePerms = permissions[module];
      if (modulePerms && typeof modulePerms === 'object') {
        Object.keys(modulePerms).forEach(action => {
          if (!VALID_ACTIONS[module].includes(action)) {
            issues.push(`Invalid action '${action}' in module '${module}'`);
          }
        });
      } else {
        issues.push(`Module '${module}' has invalid structure`);
      }
    } else {
      invalidModules.push(module);
      issues.push(`Invalid module '${module}'`);
    }
  });
  
  // Check for missing modules
  const missingModules = VALID_MODULES.filter(module => !validModules.includes(module));
  if (missingModules.length > 0) {
    issues.push(`Missing modules: ${missingModules.join(', ')}`);
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    validModules,
    invalidModules,
    missingModules
  };
}

module.exports = router;