/**
 * Role Migration Script
 * 
 * This script migrates the old role structure to the new simplified structure:
 * - Converts CenterAdmin users to User collection with role='admin'
 * - Updates branch_manager users to role='admin'
 * - Updates center_admin users (in User collection) to role='admin'
 * - Preserves all permissions and branch assignments
 * 
 * Usage: node scripts/migrate-roles.js
 * 
 * IMPORTANT: Run this script AFTER deploying the code changes
 * Make sure to backup your database before running!
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Branch = require('../src/models/Branch');

// Import CenterAdmin model if it exists
let CenterAdmin;
try {
  CenterAdmin = require('../src/models/CenterAdmin');
} catch (e) {
  console.log('CenterAdmin model not found, skipping CenterAdmin migration');
}

// Helper to convert old permission format to new RBAC structure
const convertPermissions = (oldPermissions) => {
  if (!oldPermissions) return getDefaultAdminPermissions();
  
  // If already in new format, return as-is
  if (oldPermissions.orders && typeof oldPermissions.orders === 'object') {
    return oldPermissions;
  }
  
  // Convert old boolean format to new RBAC format
  const newPermissions = {
    orders: {
      view: oldPermissions.orders === true,
      create: oldPermissions.orders === true,
      update: oldPermissions.orders === true,
      delete: false,
      assign: oldPermissions.orders === true,
      cancel: oldPermissions.orders === true,
      process: oldPermissions.orders === true
    },
    staff: {
      view: oldPermissions.users === true,
      create: oldPermissions.users === true,
      update: oldPermissions.users === true,
      delete: oldPermissions.users === true,
      assignShift: oldPermissions.users === true,
      manageAttendance: oldPermissions.users === true
    },
    inventory: {
      view: true,
      create: true,
      update: true,
      delete: true
    },
    services: {
      view: true,
      create: oldPermissions.settings === true,
      update: oldPermissions.settings === true,
      delete: false,
      toggle: oldPermissions.settings === true
    },
    analytics: {
      view: oldPermissions.analytics === true
    },
    settings: {
      view: oldPermissions.settings === true,
      update: oldPermissions.settings === true
    }
  };
  
  return newPermissions;
};

// Default admin permissions (all enabled)
const getDefaultAdminPermissions = () => ({
  orders: { view: true, create: true, update: true, delete: true, assign: true, cancel: true, process: true },
  staff: { view: true, create: true, update: true, delete: true, assignShift: true, manageAttendance: true },
  inventory: { view: true, create: true, update: true, delete: true },
  services: { view: true, create: true, update: true, delete: true, toggle: true },
  analytics: { view: true },
  settings: { view: true, update: true }
});

async function migrateRoles() {
  console.log('🚀 Starting Role Migration...\n');
  
  const stats = {
    centerAdminsMigrated: 0,
    branchManagersUpdated: 0,
    centerAdminUsersUpdated: 0,
    errors: [],
    skipped: []
  };

  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
    // Step 1: Migrate CenterAdmin users to User collection
    if (CenterAdmin) {
      console.log('📦 Step 1: Migrating CenterAdmin users...');
      const centerAdmins = await CenterAdmin.find({});
      
      for (const ca of centerAdmins) {
        try {
          // Check if user already exists with this email
          const existingUser = await User.findOne({ email: ca.email });
          
          if (existingUser) {
            // Update existing user to admin role
            existingUser.role = 'admin';
            existingUser.permissions = convertPermissions(ca.permissions);
            existingUser.isActive = ca.isActive;
            if (ca.lastLogin) existingUser.lastLogin = ca.lastLogin;
            await existingUser.save({ session });
            stats.skipped.push(`${ca.email} (updated existing user)`);
          } else {
            // Create new user from CenterAdmin
            const newUser = new User({
              name: ca.name,
              email: ca.email,
              phone: ca.phone || '0000000000', // Default phone if missing
              password: ca.password, // Already hashed
              role: 'admin',
              permissions: convertPermissions(ca.permissions),
              isActive: ca.isActive,
              isEmailVerified: true,
              lastLogin: ca.lastLogin
            });
            
            await newUser.save({ session });
            stats.centerAdminsMigrated++;
          }
        } catch (err) {
          stats.errors.push(`CenterAdmin ${ca.email}: ${err.message}`);
        }
      }
      console.log(`   ✅ Processed ${centerAdmins.length} CenterAdmin users\n`);
    }
    
    // Step 2: Update branch_manager users to admin
    console.log('📦 Step 2: Updating branch_manager users...');
    const branchManagers = await User.find({ role: 'branch_manager' });
    
    for (const bm of branchManagers) {
      try {
        bm.role = 'admin';
        bm.permissions = convertPermissions(bm.permissions) || getDefaultAdminPermissions();
        await bm.save({ session });
        stats.branchManagersUpdated++;
      } catch (err) {
        stats.errors.push(`branch_manager ${bm.email}: ${err.message}`);
      }
    }
    console.log(`   ✅ Updated ${stats.branchManagersUpdated} branch_manager users\n`);
    
    // Step 3: Update center_admin users (in User collection) to admin
    console.log('📦 Step 3: Updating center_admin users in User collection...');
    const centerAdminUsers = await User.find({ role: 'center_admin' });
    
    for (const cau of centerAdminUsers) {
      try {
        cau.role = 'admin';
        cau.permissions = convertPermissions(cau.permissions) || getDefaultAdminPermissions();
        await cau.save({ session });
        stats.centerAdminUsersUpdated++;
      } catch (err) {
        stats.errors.push(`center_admin ${cau.email}: ${err.message}`);
      }
    }
    console.log(`   ✅ Updated ${stats.centerAdminUsersUpdated} center_admin users\n`);
    
    // Step 4: Ensure all admins have branch assignments
    console.log('📦 Step 4: Verifying branch assignments...');
    const adminsWithoutBranch = await User.find({ 
      role: 'admin', 
      assignedBranch: { $exists: false } 
    });
    
    if (adminsWithoutBranch.length > 0) {
      console.log(`   ⚠️  ${adminsWithoutBranch.length} admins without branch assignment:`);
      for (const admin of adminsWithoutBranch) {
        // Try to find branch where this user is manager
        const branch = await Branch.findOne({ manager: admin._id });
        if (branch) {
          admin.assignedBranch = branch._id;
          await admin.save({ session });
          console.log(`      - ${admin.email}: Assigned to ${branch.name}`);
        } else {
          console.log(`      - ${admin.email}: No branch found (needs manual assignment)`);
          stats.errors.push(`Admin ${admin.email} has no branch assignment`);
        }
      }
    }
    console.log('');
    
    await session.commitTransaction();
    
    // Print summary
    console.log('═══════════════════════════════════════════');
    console.log('📊 MIGRATION SUMMARY');
    console.log('═══════════════════════════════════════════');
    console.log(`CenterAdmin users migrated: ${stats.centerAdminsMigrated}`);
    console.log(`branch_manager users updated: ${stats.branchManagersUpdated}`);
    console.log(`center_admin users updated: ${stats.centerAdminUsersUpdated}`);
    console.log(`Total admins now: ${stats.centerAdminsMigrated + stats.branchManagersUpdated + stats.centerAdminUsersUpdated}`);
    
    if (stats.skipped.length > 0) {
      console.log(`\n⏭️  Skipped (already existed):`);
      stats.skipped.forEach(s => console.log(`   - ${s}`));
    }
    
    if (stats.errors.length > 0) {
      console.log(`\n❌ Errors (${stats.errors.length}):`);
      stats.errors.forEach(e => console.log(`   - ${e}`));
    }
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    await session.abortTransaction();
    console.error('\n❌ Migration failed:', error.message);
    console.error('All changes have been rolled back.');
    throw error;
  } finally {
    session.endSession();
  }
}

// Main execution
async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected!\n');
    
    await migrateRoles();
    
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
    process.exit(0);
  }
}

main();
