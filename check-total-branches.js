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

// Tenancy Schema
const tenancySchema = new mongoose.Schema({
  businessName: String,
  subdomain: String,
  isActive: Boolean,
  createdAt: Date
}, { collection: 'tenancies' });

const Tenancy = mongoose.model('Tenancy', tenancySchema);

async function checkBranches() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Total branches count
    const totalBranches = await Branch.countDocuments();
    console.log(`📊 Total Branches in Database: ${totalBranches}\n`);

    // Active vs Inactive
    const activeBranches = await Branch.countDocuments({ isActive: true });
    const inactiveBranches = await Branch.countDocuments({ isActive: false });
    console.log(`✅ Active Branches: ${activeBranches}`);
    console.log(`❌ Inactive Branches: ${inactiveBranches}\n`);

    // Branches per tenancy
    const branchesGrouped = await Branch.aggregate([
      {
        $group: {
          _id: '$tenancyId',
          count: { $sum: 1 },
          branches: { $push: { name: '$name', isActive: '$isActive' } }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    console.log('📋 Branches per Tenancy:\n');
    
    for (const group of branchesGrouped) {
      const tenancy = await Tenancy.findById(group._id);
      const tenancyName = tenancy ? tenancy.businessName : 'Unknown';
      
      console.log(`🏢 ${tenancyName} (${group._id})`);
      console.log(`   Total: ${group.count} branches`);
      group.branches.forEach((branch, index) => {
        const status = branch.isActive ? '✅' : '❌';
        console.log(`   ${index + 1}. ${status} ${branch.name}`);
      });
      console.log('');
    }

    // Total tenancies
    const totalTenancies = await Tenancy.countDocuments();
    console.log(`\n🏪 Total Tenancies: ${totalTenancies}`);
    console.log(`📊 Average Branches per Tenancy: ${(totalBranches / totalTenancies).toFixed(2)}`);

    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkBranches();
