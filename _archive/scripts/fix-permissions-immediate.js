const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI);

const SuperAdmin = require('./src/models/SuperAdmin');

async function fixSalesPermissions() {
  try {
    console.log('🔧 Fixing SuperAdmin Sales Permissions...\n');
    
    // Find all SuperAdmins
    const superAdmins = await SuperAdmin.find({});
    console.log(`Found ${superAdmins.length} SuperAdmins\n`);
    
    for (const admin of superAdmins) {
      console.log(`👤 Processing: ${admin.email}`);
      
      // Complete permissions object for sales dashboard
      const completePermissions = {
        // Sales Dashboard Core Permissions
        analytics: true,
        upgrades: true,
        payments: true,
        sales: true,
        
        // Financial Permissions
        finances: true,
        billing: true,
        
        // Admin Management
        users: true,
        settings: true,
        superadmins: true,
        admins: true,
        
        // Platform Management
        tenancies: true,
        branches: true,
        orders: true,
        reports: true,
        audit: true,
        
        // Marketing & Campaigns
        campaigns: true,
        banners: true,
        leads: true,
        
        // Support System
        tickets: true,
        support: true,
        
        // System Settings
        system_settings: true,
        features: true,
        pricing: true,
        
        // Additional permissions that might be needed
        customers: true,
        inventory: true,
        notifications: true,
        integrations: true
      };
      
      // Update the admin with complete permissions
      const updateResult = await SuperAdmin.findByIdAndUpdate(
        admin._id,
        {
          $set: {
            permissions: completePermissions,
            isActive: true
          }
        },
        { new: true }
      );
      
      if (updateResult) {
        console.log(`   ✅ Updated permissions for: ${admin.email}`);
        console.log(`   📋 Total permissions granted: ${Object.keys(completePermissions).length}`);
      } else {
        console.log(`   ❌ Failed to update: ${admin.email}`);
      }
    }
    
    console.log('\n🎉 Sales Dashboard Permission Fix Complete!');
    console.log('✅ All SuperAdmins now have full sales dashboard access');
    console.log('✅ Analytics permissions granted');
    console.log('✅ Upgrades permissions granted');
    console.log('✅ Payments permissions granted');
    console.log('✅ Financial permissions granted');
    console.log('\n📝 Next: Start backend server to test');
    
  } catch (error) {
    console.error('❌ Error fixing permissions:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the fix
console.log('🚀 Starting Sales Dashboard Permission Fix...\n');
fixSalesPermissions();