const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/laundrylobby');

const SuperAdmin = require('./src/models/SuperAdmin');
const CenterAdmin = require('./src/models/CenterAdmin');

async function checkSuperAdminDatabase() {
  try {
    console.log('🔍 Checking SuperAdmin Database...\n');
    
    // Check SuperAdmin collection
    console.log('📋 SuperAdmin Collection:');
    const superAdmins = await SuperAdmin.find({}).limit(10);
    console.log(`Found ${superAdmins.length} SuperAdmins`);
    
    for (const admin of superAdmins) {
      console.log(`\n👤 SuperAdmin: ${admin.email}`);
      console.log(`   ID: ${admin._id}`);
      console.log(`   Name: ${admin.name}`);
      console.log(`   Role: ${admin.role}`);
      console.log(`   Active: ${admin.isActive}`);
      console.log(`   Created: ${admin.createdAt}`);
      
      // Check if this is the admin that's trying to login
      if (admin.email.includes('admin@gmail.com') || admin.email.includes('admin')) {
        console.log(`   🎯 POTENTIAL LOGIN USER: ${admin.email}`);
        console.log(`   🔐 Password Hash: ${admin.password ? 'EXISTS' : 'MISSING'}`);
        console.log(`   📧 Email Verified: ${admin.emailVerified}`);
        console.log(`   🔒 Account Locked: ${admin.accountLocked}`);
        
        if (admin.permissions) {
          console.log(`   📋 Legacy Permissions:`, Object.keys(admin.permissions));
        }
        
        if (admin.roles && admin.roles.length > 0) {
          console.log(`   🏷️ RBAC Roles: ${admin.roles.length} roles assigned`);
        } else {
          console.log(`   🏷️ RBAC Roles: No roles assigned`);
        }
      }
    }
    
    // Check CenterAdmin collection as fallback
    console.log('\n📋 CenterAdmin Collection:');
    const centerAdmins = await CenterAdmin.find({}).limit(5);
    console.log(`Found ${centerAdmins.length} CenterAdmins`);
    
    for (const admin of centerAdmins) {
      console.log(`\n👤 CenterAdmin: ${admin.email}`);
      console.log(`   ID: ${admin._id}`);
      console.log(`   Name: ${admin.name}`);
      console.log(`   Role: ${admin.role}`);
      console.log(`   Active: ${admin.isActive}`);
      
      if (admin.email.includes('admin@gmail.com') || admin.email.includes('admin')) {
        console.log(`   🎯 POTENTIAL LOGIN USER: ${admin.email}`);
      }
    }
    
    // Check for common admin emails
    console.log('\n🔍 Searching for common admin emails...');
    const commonEmails = ['admin@gmail.com', 'superadmin@gmail.com', 'admin@laundrylobby.com'];
    
    for (const email of commonEmails) {
      const superAdmin = await SuperAdmin.findOne({ email });
      const centerAdmin = await CenterAdmin.findOne({ email });
      
      if (superAdmin) {
        console.log(`✅ Found SuperAdmin with email: ${email}`);
        console.log(`   Active: ${superAdmin.isActive}`);
        console.log(`   Role: ${superAdmin.role}`);
      } else if (centerAdmin) {
        console.log(`✅ Found CenterAdmin with email: ${email}`);
        console.log(`   Active: ${centerAdmin.isActive}`);
        console.log(`   Role: ${centerAdmin.role}`);
      } else {
        console.log(`❌ No admin found with email: ${email}`);
      }
    }
    
    console.log('\n🎉 Database check completed!');
    
  } catch (error) {
    console.error('❌ Error checking database:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the check
checkSuperAdminDatabase();