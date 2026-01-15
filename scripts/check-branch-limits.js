const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Tenancy = require('../src/models/Tenancy');
const Branch = require('../src/models/Branch');

async function checkBranchLimits() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all tenancies
    const tenancies = await Tenancy.find({ status: 'active' });

    console.log('📊 Checking branch limits for all tenancies:\n');

    for (const tenancy of tenancies) {
      const maxBranches = tenancy.subscription?.features?.max_branches || 0;
      const branches = await Branch.find({ 
        tenancy: tenancy._id,
        isActive: true 
      });

      const exceeded = maxBranches !== -1 && branches.length > maxBranches;

      console.log(`${exceeded ? '⚠️' : '✅'} ${tenancy.name}`);
      console.log(`   Email: ${tenancy.contact?.email || 'N/A'}`);
      console.log(`   Plan: ${tenancy.subscription?.plan || 'N/A'}`);
      console.log(`   Max Branches: ${maxBranches === -1 ? 'Unlimited' : maxBranches}`);
      console.log(`   Current Branches: ${branches.length}`);
      
      if (exceeded) {
        console.log(`   ⚠️  LIMIT EXCEEDED by ${branches.length - maxBranches}`);
        console.log(`   Branches:`);
        branches.forEach((branch, idx) => {
          console.log(`      ${idx + 1}. ${branch.name} (${branch.code}) - Created: ${branch.createdAt.toLocaleDateString()}`);
        });
      }
      
      console.log('');
    }

    console.log('\n✅ Check complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkBranchLimits();
