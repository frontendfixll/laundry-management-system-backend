const Branch = require('./src/models/Branch');
const Service = require('./src/models/Service');
const BranchService = require('./src/models/BranchService');
require('dotenv').config();

// Connect to MongoDB
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry-management');

async function debugBranchServices() {
  try {
    console.log('🔍 Debugging Branch Services...\n');
    
    // Find the "rise" branch
    const riseBranch = await Branch.findOne({ 
      $or: [
        { name: { $regex: /rise/i } },
        { code: { $regex: /rise/i } }
      ]
    });
    
    if (!riseBranch) {
      console.log('❌ No branch found with name or code containing "rise"');
      console.log('\n📋 Available branches:');
      const allBranches = await Branch.find({}).select('name code tenancy');
      allBranches.forEach(branch => {
        console.log(`  - ${branch.name} (${branch.code}) - Tenancy: ${branch.tenancy}`);
      });
      return;
    }
    
    console.log('🏢 Found branch:', riseBranch.name, `(${riseBranch.code})`);
    console.log('   Branch ID:', riseBranch._id);
    console.log('   Tenancy:', riseBranch.tenancy);
    console.log('   Active:', riseBranch.isActive);
    
    // Check all services
    const allServices = await Service.find({ isActive: true }).select('name displayName code category');
    console.log(`\n📋 Available services (${allServices.length}):`);
    allServices.forEach(service => {
      console.log(`  - ${service.displayName} (${service.code}) - ${service.category}`);
    });
    
    // Check branch-service configurations
    const branchServices = await BranchService.find({ 
      branch: riseBranch._id 
    }).populate('service', 'name displayName code');
    
    console.log(`\n🔧 Branch-Service configurations (${branchServices.length}):`);
    if (branchServices.length === 0) {
      console.log('   ❌ No services configured for this branch!');
      console.log('   💡 This is likely the issue - no services are enabled for this branch.');
    } else {
      branchServices.forEach(bs => {
        console.log(`  - ${bs.service.displayName}: ${bs.isEnabled ? '✅ ENABLED' : '❌ DISABLED'}`);
        if (bs.isEnabled) {
          console.log(`    Price Multiplier: ${bs.priceMultiplier}x`);
          if (bs.notes) console.log(`    Notes: ${bs.notes}`);
        }
      });
    }
    
    // Test the API endpoint that customers use
    console.log('\n🧪 Testing customer API endpoint...');
    const enabledServices = await BranchService.find({ 
      branch: riseBranch._id, 
      isEnabled: true 
    }).populate('service', 'name displayName description icon category basePriceMultiplier turnaroundTime isExpressAvailable');
    
    console.log(`📊 Enabled services for customers: ${enabledServices.length}`);
    enabledServices.forEach(bs => {
      console.log(`  ✅ ${bs.service.displayName}`);
      console.log(`     Category: ${bs.service.category}`);
      console.log(`     Price Multiplier: ${bs.service.basePriceMultiplier * bs.priceMultiplier}x`);
    });
    
    if (enabledServices.length === 0) {
      console.log('\n💡 SOLUTION: Enable services for this branch by:');
      console.log('   1. Go to Admin → Services');
      console.log('   2. Click "Branches" button next to each service');
      console.log('   3. Toggle ON the services for the "rise" branch');
      
      // Auto-enable some basic services
      console.log('\n🔧 Auto-enabling basic services...');
      const basicServices = await Service.find({ 
        code: { $in: ['wash_fold', 'dry_cleaning', 'pressing'] },
        isActive: true 
      });
      
      for (const service of basicServices) {
        await BranchService.findOneAndUpdate(
          { branch: riseBranch._id, service: service._id },
          {
            isEnabled: true,
            priceMultiplier: 1.0,
            tenancy: riseBranch.tenancy,
            createdBy: riseBranch.createdBy || riseBranch._id,
            updatedBy: riseBranch.createdBy || riseBranch._id
          },
          { upsert: true, new: true }
        );
        console.log(`   ✅ Enabled: ${service.displayName}`);
      }
      
      console.log('\n🎉 Basic services have been auto-enabled! Try the booking flow again.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

debugBranchServices();