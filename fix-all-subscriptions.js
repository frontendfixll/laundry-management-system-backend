const mongoose = require('mongoose');
require('dotenv').config();

const Tenancy = require('./src/models/Tenancy');

async function fixAllSubscriptions() {
  try {
    console.log('🔧 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    console.log('🔍 Checking all tenancies...');
    
    // Get all tenancies
    const tenancies = await Tenancy.find({});
    console.log(`Found ${tenancies.length} tenancies`);
    
    let fixedCount = 0;
    
    for (const tenancy of tenancies) {
      const wasActive = tenancy.isSubscriptionActive();
      
      if (!wasActive) {
        console.log(`⚠️  Fixing subscription for: ${tenancy.name}`);
        
        // Set trial subscription with generous limits
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 90); // 90 days trial
        
        tenancy.subscription = {
          status: 'trial',
          plan: 'premium',
          trialEndsAt: trialEndDate,
          features: {
            maxOrders: -1, // Unlimited
            maxStaff: -1,  // Unlimited
            maxBranches: -1, // Unlimited
            maxCustomers: -1, // Unlimited
            analytics: true,
            notifications: true,
            multiLocation: true,
            customBranding: true,
            apiAccess: true,
            prioritySupport: true
          }
        };
        
        await tenancy.save();
        fixedCount++;
        console.log(`✅ Fixed: ${tenancy.name} - now has 90-day premium trial`);
      } else {
        console.log(`✅ Already active: ${tenancy.name} (${tenancy.subscription?.status})`);
      }
    }
    
    console.log(`\n🎉 Summary:`);
    console.log(`   Total tenancies: ${tenancies.length}`);
    console.log(`   Fixed subscriptions: ${fixedCount}`);
    console.log(`   Already active: ${tenancies.length - fixedCount}`);
    
    if (fixedCount > 0) {
      console.log('\n✅ All subscription issues have been resolved!');
      console.log('🚀 Order booking should now work for all tenancies.');
    } else {
      console.log('\n✅ All tenancies already had active subscriptions.');
    }
    
  } catch (error) {
    console.error('❌ Error fixing subscriptions:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the fix
fixAllSubscriptions();