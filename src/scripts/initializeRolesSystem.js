/**
 * Initialize Enhanced Roles System
 * Creates default platform and tenant roles based on droles.md specification
 */

const mongoose = require('mongoose');
const SuperAdminRole = require('../models/SuperAdminRole');
const Role = require('../models/Role');
const SuperAdmin = require('../models/SuperAdmin');
const User = require('../models/User');
const Tenancy = require('../models/Tenancy');
const { PLATFORM_ROLES, TENANT_ROLES } = require('../config/roleDefinitions');

// Database connection
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/laundrylobby';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

/**
 * Create default platform roles
 */
const createPlatformRoles = async () => {
  console.log('\n🔧 Creating Platform Roles...');
  
  try {
    const createdRoles = await SuperAdminRole.createDefaultRoles();
    
    if (createdRoles.length > 0) {
      console.log(`✅ Created ${createdRoles.length} platform roles:`);
      createdRoles.forEach(role => {
        console.log(`   - ${role.name} (${role.slug})`);
      });
    } else {
      console.log('ℹ️ All platform roles already exist');
    }
    
    // List all platform roles
    const allPlatformRoles = await SuperAdminRole.find({ isActive: true }).select('name slug description');
    console.log(`\n📋 Total Platform Roles: ${allPlatformRoles.length}`);
    allPlatformRoles.forEach(role => {
      console.log(`   - ${role.name} (${role.slug}): ${role.description}`);
    });
    
  } catch (error) {
    console.error('❌ Error creating platform roles:', error);
    throw error;
  }
};

/**
 * Create default tenant roles for all existing tenancies
 */
const createTenantRoles = async () => {
  console.log('\n🔧 Creating Tenant Roles...');
  
  try {
    // Get all active tenancies
    const tenancies = await Tenancy.find({ isActive: true }).select('_id businessName');
    console.log(`📋 Found ${tenancies.length} active tenancies`);
    
    let totalCreatedRoles = 0;
    
    for (const tenancy of tenancies) {
      console.log(`\n🏢 Processing tenancy: ${tenancy.businessName} (${tenancy._id})`);
      
      try {
        // Find a user from this tenancy to use as createdBy
        const tenancyUser = await User.findOne({ tenancy: tenancy._id }).select('_id');
        const createdBy = tenancyUser?._id;
        
        const createdRoles = await Role.createDefaultRoles(tenancy._id, createdBy);
        
        if (createdRoles.length > 0) {
          console.log(`   ✅ Created ${createdRoles.length} roles:`);
          createdRoles.forEach(role => {
            console.log(`      - ${role.name} (${role.slug})`);
          });
          totalCreatedRoles += createdRoles.length;
        } else {
          console.log('   ℹ️ All roles already exist for this tenancy');
        }
        
      } catch (error) {
        console.error(`   ❌ Error creating roles for tenancy ${tenancy.businessName}:`, error);
      }
    }
    
    console.log(`\n✅ Total tenant roles created: ${totalCreatedRoles}`);
    
    // List all tenant roles
    const allTenantRoles = await Role.find({ isActive: true })
      .populate('tenancy', 'businessName')
      .select('name slug tenancy');
    
    console.log(`\n📋 Total Tenant Roles Across All Tenancies: ${allTenantRoles.length}`);
    
  } catch (error) {
    console.error('❌ Error creating tenant roles:', error);
    throw error;
  }
};

/**
 * Assign default roles to existing users
 */
const assignDefaultRoles = async () => {
  console.log('\n🔧 Assigning Default Roles to Existing Users...');
  
  try {
    // Assign Super Admin role to existing superadmins
    const superAdminRole = await SuperAdminRole.findOne({ slug: 'super_admin' });
    if (superAdminRole) {
      const superAdmins = await SuperAdmin.find({ 
        isActive: true,
        $or: [
          { roles: { $exists: false } },
          { roles: { $size: 0 } }
        ]
      });
      
      for (const admin of superAdmins) {
        admin.roles = [superAdminRole._id];
        await admin.save();
        console.log(`   ✅ Assigned Super Admin role to: ${admin.email}`);
      }
    }
    
    // Assign Tenant Owner role to existing tenant admins
    const tenancies = await Tenancy.find({ isActive: true }).select('_id');
    
    for (const tenancy of tenancies) {
      const tenantOwnerRole = await Role.findOne({ 
        tenancy: tenancy._id, 
        slug: 'tenant_owner' 
      });
      
      if (tenantOwnerRole) {
        // Find admin users without roleId
        const adminUsers = await User.find({
          tenancy: tenancy._id,
          role: 'admin',
          isActive: true,
          roleId: { $exists: false }
        });
        
        for (const user of adminUsers) {
          user.roleId = tenantOwnerRole._id;
          await user.save();
          console.log(`   ✅ Assigned Tenant Owner role to: ${user.email}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error assigning default roles:', error);
    throw error;
  }
};

/**
 * Validate roles system
 */
const validateRolesSystem = async () => {
  console.log('\n🔍 Validating Roles System...');
  
  try {
    // Check platform roles
    const platformRoleCount = await SuperAdminRole.countDocuments({ isActive: true });
    const expectedPlatformRoles = Object.keys(PLATFORM_ROLES).length;
    
    console.log(`📊 Platform Roles: ${platformRoleCount}/${expectedPlatformRoles}`);
    
    if (platformRoleCount < expectedPlatformRoles) {
      console.warn('⚠️ Some platform roles are missing');
    }
    
    // Check tenant roles
    const tenancyCount = await Tenancy.countDocuments({ isActive: true });
    const tenantRoleCount = await Role.countDocuments({ isActive: true });
    const expectedTenantRoles = tenancyCount * Object.keys(TENANT_ROLES).length;
    
    console.log(`📊 Tenant Roles: ${tenantRoleCount}/${expectedTenantRoles} (${tenancyCount} tenancies)`);
    
    if (tenantRoleCount < expectedTenantRoles) {
      console.warn('⚠️ Some tenant roles are missing');
    }
    
    // Check user role assignments
    const superAdminsWithRoles = await SuperAdmin.countDocuments({ 
      isActive: true,
      roles: { $exists: true, $not: { $size: 0 } }
    });
    const totalSuperAdmins = await SuperAdmin.countDocuments({ isActive: true });
    
    console.log(`📊 SuperAdmins with roles: ${superAdminsWithRoles}/${totalSuperAdmins}`);
    
    const tenantUsersWithRoles = await User.countDocuments({ 
      role: { $in: ['admin', 'branch_admin', 'staff'] },
      isActive: true,
      roleId: { $exists: true }
    });
    const totalTenantUsers = await User.countDocuments({ 
      role: { $in: ['admin', 'branch_admin', 'staff'] },
      isActive: true
    });
    
    console.log(`📊 Tenant users with roles: ${tenantUsersWithRoles}/${totalTenantUsers}`);
    
    console.log('\n✅ Roles system validation complete');
    
  } catch (error) {
    console.error('❌ Error validating roles system:', error);
    throw error;
  }
};

/**
 * Main initialization function
 */
const initializeRolesSystem = async () => {
  console.log('🚀 Initializing Enhanced Roles System');
  console.log('Based on droles.md specification\n');
  
  try {
    await connectDB();
    
    // Step 1: Create platform roles
    await createPlatformRoles();
    
    // Step 2: Create tenant roles
    await createTenantRoles();
    
    // Step 3: Assign default roles to existing users
    await assignDefaultRoles();
    
    // Step 4: Validate the system
    await validateRolesSystem();
    
    console.log('\n🎉 Enhanced Roles System initialization complete!');
    console.log('\nNext steps:');
    console.log('1. Update frontend to use new role-based menus');
    console.log('2. Update API endpoints to use enhanced RBAC middleware');
    console.log('3. Test permission-first UI rendering');
    console.log('4. Configure role management interfaces');
    
  } catch (error) {
    console.error('\n💥 Initialization failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
};

/**
 * CLI interface
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Enhanced Roles System Initializer

Usage: node initializeRolesSystem.js [options]

Options:
  --platform-only    Create only platform roles
  --tenant-only      Create only tenant roles
  --assign-only      Only assign roles to existing users
  --validate-only    Only validate the current system
  --help, -h         Show this help message

Examples:
  node initializeRolesSystem.js                    # Full initialization
  node initializeRolesSystem.js --platform-only   # Create platform roles only
  node initializeRolesSystem.js --validate-only   # Validate current system
    `);
    process.exit(0);
  }
  
  // Handle specific options
  if (args.includes('--platform-only')) {
    connectDB().then(createPlatformRoles).then(() => mongoose.disconnect());
  } else if (args.includes('--tenant-only')) {
    connectDB().then(createTenantRoles).then(() => mongoose.disconnect());
  } else if (args.includes('--assign-only')) {
    connectDB().then(assignDefaultRoles).then(() => mongoose.disconnect());
  } else if (args.includes('--validate-only')) {
    connectDB().then(validateRolesSystem).then(() => mongoose.disconnect());
  } else {
    // Full initialization
    initializeRolesSystem();
  }
}

module.exports = {
  initializeRolesSystem,
  createPlatformRoles,
  createTenantRoles,
  assignDefaultRoles,
  validateRolesSystem
};