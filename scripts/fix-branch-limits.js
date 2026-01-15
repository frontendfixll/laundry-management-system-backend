const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Tenancy = require('../src/models/Tenancy');
const Branch = require('../src/models/Branch');

async function fixBranchLimits() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const tenancyEmail = process.argv[2];
    
    if (!tenancyEmail) {
      console.log('❌ Please provide tenancy email as argument');
      console.log('Usage: node fix-branch-limits.js <tenancy-email>');
      console.log('Example: node fix-branch-limits.js admin1@gmail.com');
      process.exit(1);
    }

    // Find tenancy
    const tenancy = await Tenancy.findOne({ 
      'contact.email': tenancyEmail 
    });

    if (!tenancy) {
      console.log(`❌ Tenancy not found for email: ${tenancyEmail}`);
      process.exit(1);
    }

    const maxBranches = tenancy.subscription?.features?.max_branches || 0;
    const branches = await Branch.find({ 
      tenancy: tenancy._id,
      isActive: true 
    }).sort({ createdAt: 1 }); // Oldest first

    console.log(`📋 Tenancy: ${tenancy.name}`);
    console.log(`📋 Max Branches: ${maxBranches === -1 ? 'Unlimited' : maxBranches}`);
    console.log(`📋 Current Active Branches: ${branches.length}\n`);

    if (maxBranches === -1 || branches.length <= maxBranches) {
      console.log('✅ No action needed. Branch count is within limit.');
      process.exit(0);
    }

    const toDeactivate = branches.length - maxBranches;
    console.log(`⚠️  Need to deactivate ${toDeactivate} branch(es)\n`);

    // Keep oldest branches, deactivate newest ones
    const branchesToKeep = branches.slice(0, maxBranches);
    const branchesToDeactivate = branches.slice(maxBranches);

    console.log('✅ Branches to KEEP:');
    branchesToKeep.forEach((branch, idx) => {
      console.log(`   ${idx + 1}. ${branch.name} (${branch.code}) - Created: ${branch.createdAt.toLocaleDateString()}`);
    });

    console.log('\n❌ Branches to DEACTIVATE:');
    branchesToDeactivate.forEach((branch, idx) => {
      console.log(`   ${idx + 1}. ${branch.name} (${branch.code}) - Created: ${branch.createdAt.toLocaleDateString()}`);
    });

    console.log('\n⚠️  This will deactivate the newest branches to comply with plan limits.');
    console.log('⚠️  Run with --confirm flag to proceed: node fix-branch-limits.js', tenancyEmail, '--confirm');

    if (process.argv[3] === '--confirm') {
      console.log('\n🔄 Deactivating branches...');
      
      for (const branch of branchesToDeactivate) {
        branch.isActive = false;
        branch.status = 'inactive';
        await branch.save();
        console.log(`   ✅ Deactivated: ${branch.name} (${branch.code})`);
      }

      console.log('\n✅ Branch limits fixed successfully!');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixBranchLimits();
