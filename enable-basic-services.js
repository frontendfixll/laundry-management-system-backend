const Branch = require('./src/models/Branch');
const Service = require('./src/models/Service');
const BranchService = require('./src/models/BranchService');
const User = require('./src/models/User');
require('dotenv').config();

// Connect to MongoDB
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry-management');

async function enableBasicServices() {
  try {
    console.log('🔧 Auto-enabling basic services for "rise" branch...\n');
    
    // Find the "rise" branch
    const riseBranch = await Branch.findOne({ 
      $or: [
        { name: { $regex: /rise/i } },
        { code: { $regex: /rise/i } }
      ]
    });
    
    if (!riseBranch) {
      console.log('❌ Branch not found');
      return;
    }
    
    console.log('🏢 Branch:', riseBranch.name, `(${riseBranch.code})`);
    
    // Get a user from the same tenancy to use as createdBy
    const tenancyUser = await User.findOne({ tenancy: riseBranch.tenancy });
    const userId = tenancyUser?._id || riseBranch._id;
    
    // Basic services to enable
    const basicServiceCodes = [
      'wash_fold',
      'wash_iron', 
      'dry_clean',
      'steam_press',
      'premium_laundry'
    ];
    
    const basicServices = await Service.find({ 
      code: { $in: basicServiceCodes },
      isActive: true 
    });
    
    console.log(`📋 Enabling ${basicServices.length} basic services:\n`);
    
    for (const service of basicServices) {
      const result = await BranchService.findOneAndUpdate(
        { branch: riseBranch._id, service: service._id },
        {
          isEnabled: true,
          priceMultiplier: 1.0,
          isExpressAvailable: service.isExpressAvailable,
          tenancy: riseBranch.tenancy,
          createdBy: userId,
          updatedBy: userId
        },
        { upsert: true, new: true }
      );
      
      console.log(`   ✅ ${service.displayName} (${service.code})`);
      console.log(`      Price: ${service.basePriceMultiplier}x base`);
      console.log(`      Express: ${service.isExpressAvailable ? 'Available' : 'Not available'}`);
      console.log('');
    }
    
    // Verify the results
    const enabledCount = await BranchService.countDocuments({ 
      branch: riseBranch._id, 
      isEnabled: true 
    });
    
    console.log(`🎉 Success! ${enabledCount} services are now enabled for the "${riseBranch.name}" branch.`);
    console.log('\n💡 Customers can now book these services at this branch!');
    console.log('   Try the booking flow again - services should now appear.');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

enableBasicServices();