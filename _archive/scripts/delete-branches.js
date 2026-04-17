const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://devanshugupta321:Devanshu123@cluster0.ugk4dbe.mongodb.net/laundry-management-system?retryWrites=true&w=majority';

// Branch Schema
const branchSchema = new mongoose.Schema({
  name: String,
  tenancyId: String,
  address: Object,
  contactInfo: Object,
  isActive: Boolean,
  createdAt: Date
}, { collection: 'branches' });

const Branch = mongoose.model('Branch', branchSchema);

async function deleteBranches() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const branchesToDelete = ['jaipur fixl', 'gaurav laundry', 'kota laundry'];

    console.log('🔍 Finding branches to delete...\n');

    for (const branchName of branchesToDelete) {
      const branch = await Branch.findOne({ name: branchName });
      
      if (branch) {
        console.log(`📋 Found: ${branch.name}`);
        console.log(`   ID: ${branch._id}`);
        console.log(`   Active: ${branch.isActive}`);
        console.log(`   Created: ${branch.createdAt}`);
      } else {
        console.log(`❌ Not found: ${branchName}`);
      }
    }

    console.log('\n⚠️  Deleting branches in 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Delete the branches
    const result = await Branch.deleteMany({
      name: { $in: branchesToDelete }
    });

    console.log(`\n✅ Deleted ${result.deletedCount} branches\n`);

    // Show remaining branches
    const remainingBranches = await Branch.find({});
    console.log(`📊 Remaining Branches: ${remainingBranches.length}\n`);
    
    remainingBranches.forEach((branch, index) => {
      console.log(`${index + 1}. ${branch.name} (${branch.isActive ? '✅ Active' : '❌ Inactive'})`);
    });

    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

deleteBranches();
