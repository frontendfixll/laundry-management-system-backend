const mongoose = require('mongoose');
const SuperAdmin = require('../src/models/SuperAdmin');
const SuperAdminRole = require('../src/models/SuperAdminRole');
require('dotenv').config();

/**
 * Migration script to set up SuperAdmin RBAC system
 * This script:
 * 1. Creates default SuperAdmin roles
 * 2. Assigns default "Super Administrator" role to existing SuperAdmins
 */
async function migrateSuperAdminRBAC() {
  try {
    console.log('🚀 Starting SuperAdmin RBAC migration...\n');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');
    
    // Step 1: Create default roles
    console.log('📋 Step 1: Creating default roles...');
    
    const defaultRoles = SuperAdminRole.getDefaultRoles();
    const createdRoles = [];
    
    for (const roleData of defaultRoles) {
      const existing = await SuperAdminRole.findOne({ slug: roleData.slug });
      
      if (existing) {
        console.log(`  ⊙ Role "${roleData.name}" already exists (skipping)`);
        createdRoles.push(existing);
      } else {
        const role = await SuperAdminRole.create(roleData);
        console.log(`  ✓ Created role: "${role.name}"`);
        createdRoles.push(role);
      }
    }
    
    console.log(`\n✓ Roles setup complete (${createdRoles.length} roles available)\n`);
    
    // Step 2: Assign default role to existing SuperAdmins
    console.log('👥 Step 2: Assigning default role to existing SuperAdmins...');
    
    // Find the "Super Administrator" role
    const superAdminRole = createdRoles.find(r => r.slug === 'super-administrator');
    
    if (!superAdminRole) {
      throw new Error('Super Administrator role not found!');
    }
    
    // Get all SuperAdmins
    const superadmins = await SuperAdmin.find({});
    console.log(`  Found ${superadmins.length} SuperAdmin(s)`);
    
    let assignedCount = 0;
    let skippedCount = 0;
    
    for (const admin of superadmins) {
      if (!admin.roles || admin.roles.length === 0) {
        admin.roles = [superAdminRole._id];
        await admin.save();
        console.log(`  ✓ Assigned "Super Administrator" role to: ${admin.name} (${admin.email})`);
        assignedCount++;
      } else {
        console.log(`  ⊙ ${admin.name} already has roles assigned (skipping)`);
        skippedCount++;
      }
    }
    
    console.log(`\n✓ Role assignment complete`);
    console.log(`  - Assigned: ${assignedCount}`);
    console.log(`  - Skipped: ${skippedCount}`);
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration completed successfully!');
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`  • Total roles available: ${createdRoles.length}`);
    console.log(`  • Total SuperAdmins: ${superadmins.length}`);
    console.log(`  • SuperAdmins with roles assigned: ${assignedCount + skippedCount}`);
    console.log('\n🎯 Default Roles Created:');
    createdRoles.forEach(role => {
      console.log(`  • ${role.name} (${role.slug})`);
      console.log(`    ${role.description}`);
    });
    console.log('\n');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');
  }
}

// Run migration
migrateSuperAdminRBAC();
