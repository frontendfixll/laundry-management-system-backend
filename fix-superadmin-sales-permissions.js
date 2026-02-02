const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/laundrylobby');

const SuperAdmin = require('./src/models/SuperAdmin');

async function fixSuperAdminSalesPermissions() {
  try {
    console.log('🔧 Fixing SuperAdmin Sales Permissions...\n');
    
    // Find all SuperAdmins
    const superAdmins = await SuperAdmin.find({});
    console.log(`Found ${superAdmins.length} SuperAdmins\n`);
    
    for (const admin of superAdmins) {
      console.log(`👤 Processing: ${admin.email}`);
      
      let needsUpdate = false;
      const updates = {};
      
      // Ensure permissions object exists
      if (!admin.permissions) {
        updates.permissions = {};
        needsUpdate = true;
      } else {
        updates.permissions = { ...admin.permissions };
      }
      
      // Add all required permissions for sales dashboard
      const requiredPermissions = {
        // Sales permissions
        analytics: true,
        upgrades: true,
        payments: true,
        sales: true,
        
        // Financial permissions
        finances: true,
        billing: true,
        
        // Admin permissions
        users: true,
        settings: true,
        superadmins: true,
        admins: true,
        
        // Other permissions
        tenancies: true,
        branches: true,
        orders: true,
        reports: true,
        audit: true,
        campaigns: true,
        banners: true,
        leads: true,
        tickets: true,
        system_settings: true,
        features: true
      };
      
      // Add missing permissions
      for (const [permission, value] of Object.entries(requiredPermissions)) {
        if (!updates.permissions[permission]) {
          updates.permissions[permission] = value;
          needsUpdate = true;
          console.log(`   ➕ Adding permission: ${permission}`);
        }
      }
      
      // Ensure user is active
      if (!admin.isActive) {
        updates.isActive = true;
        needsUpdate = true;
        console.log(`   ✅ Activating user`);
      }
      
      // Update if needed
      if (needsUpdate) {
        await SuperAdmin.findByIdAndUpdate(admin._id, updates);
        console.log(`   ✅ Updated: ${admin.email}`);
      } else {
        console.log(`   ✅ Already configured: ${admin.email}`);
      }
    }
    
    console.log('\n🎉 SuperAdmin permissions fix completed!');
    console.log('\n📋 All SuperAdmins now have:');
    console.log('   ✅ Sales dashboard access');
    console.log('   ✅ Analytics permissions');
    console.log('   ✅ Upgrades permissions');
    console.log('   ✅ Payments permissions');
    console.log('   ✅ Financial permissions');
    
  } catch (error) {
    console.error('❌ Error fixing permissions:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the fix
fixSuperAdminSalesPermissions();