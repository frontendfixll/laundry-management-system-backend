/**
 * Migration script to fix permission schema mismatches
 * Run this once to clean up existing users with incorrect permission structures
 */

const mongoose = require('mongoose');
const User = require('../models/User');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry-management');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

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

// Migration mapping for old module names to new ones
const MODULE_MIGRATION = {
  'support': 'tickets',
  'financial': 'performance',
  'reports': 'analytics',
  'users': 'staff'
};

const fixUserPermissions = async () => {
  try {
    console.log('🔄 Starting permission schema migration...');
    
    // Find all users with permissions
    const users = await User.find({ 
      permissions: { $exists: true },
      role: { $in: ['admin', 'branch_admin', 'staff'] }
    });
    
    console.log(`📋 Found ${users.length} users with permissions to check`);
    
    let fixedCount = 0;
    
    for (const user of users) {
      let needsUpdate = false;
      const newPermissions = {};
      
      // Initialize all valid modules with default false values
      VALID_MODULES.forEach(module => {
        newPermissions[module] = {};
        VALID_ACTIONS[module].forEach(action => {
          newPermissions[module][action] = false;
        });
      });
      
      // Migrate existing permissions
      if (user.permissions && typeof user.permissions === 'object') {
        Object.keys(user.permissions).forEach(oldModule => {
          // Map old module names to new ones
          const newModule = MODULE_MIGRATION[oldModule] || oldModule;
          
          // Only process if it's a valid module
          if (VALID_MODULES.includes(newModule)) {
            const modulePerms = user.permissions[oldModule];
            
            if (modulePerms && typeof modulePerms === 'object') {
              Object.keys(modulePerms).forEach(action => {
                // Only keep valid actions
                if (VALID_ACTIONS[newModule].includes(action)) {
                  newPermissions[newModule][action] = Boolean(modulePerms[action]);
                  if (modulePerms[action]) {
                    needsUpdate = true;
                  }
                }
              });
            }
          } else {
            console.log(`⚠️ Removing invalid module '${oldModule}' from user ${user.email}`);
            needsUpdate = true;
          }
        });
      }
      
      // Update user if needed
      if (needsUpdate || !user.permissions || Object.keys(user.permissions).length === 0) {
        try {
          await User.findByIdAndUpdate(user._id, { permissions: newPermissions });
          console.log(`✅ Fixed permissions for user: ${user.email}`);
          fixedCount++;
        } catch (error) {
          console.error(`❌ Failed to update user ${user.email}:`, error.message);
        }
      } else {
        console.log(`✓ User ${user.email} permissions are already correct`);
      }
    }
    
    console.log(`🎉 Migration completed! Fixed ${fixedCount} users`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
};

const grantBasicPermissions = async (userEmail) => {
  try {
    console.log(`🔄 Granting basic permissions to ${userEmail}...`);
    
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      console.error(`❌ User not found: ${userEmail}`);
      return;
    }
    
    // Grant basic view permissions for common modules
    const basicPermissions = {
      orders: { view: true, create: true, update: true },
      customers: { view: true, create: true, update: true },
      inventory: { view: true, create: true, update: true },
      services: { view: true, create: true, update: true },
      settings: { view: true },
      analytics: { view: true },
      performance: { view: true }
    };
    
    // Merge with existing permissions
    const newPermissions = { ...user.permissions };
    Object.keys(basicPermissions).forEach(module => {
      if (!newPermissions[module]) {
        newPermissions[module] = {};
      }
      Object.keys(basicPermissions[module]).forEach(action => {
        newPermissions[module][action] = basicPermissions[module][action];
      });
    });
    
    await User.findByIdAndUpdate(user._id, { permissions: newPermissions });
    console.log(`✅ Granted basic permissions to ${userEmail}`);
    
  } catch (error) {
    console.error(`❌ Failed to grant permissions to ${userEmail}:`, error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  
  const args = process.argv.slice(2);
  
  if (args[0] === 'grant' && args[1]) {
    // Grant basic permissions to specific user
    await grantBasicPermissions(args[1]);
  } else {
    // Run full migration
    await fixUserPermissions();
  }
  
  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB');
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { fixUserPermissions, grantBasicPermissions };