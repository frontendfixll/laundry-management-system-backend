require('dotenv').config();
const mongoose = require('mongoose');

async function checkUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
    const Tenancy = mongoose.model('Tenancy', new mongoose.Schema({}, { strict: false }), 'tenancies');
    const Branch = mongoose.model('Branch', new mongoose.Schema({}, { strict: false }), 'branches');

    // Find the tenancy
    const tenancy = await Tenancy.findById('695904675b0c4cae7dc7611a').lean();
    
    console.log('=== TENANCY: dgsfg ===');
    console.log('ID:', tenancy._id);
    console.log('Name:', tenancy.name);
    console.log('Subdomain:', tenancy.subdomain);
    console.log('Owner ID:', tenancy.owner);

    // Find the actual owner
    const owner = await User.findById(tenancy.owner).lean();
    console.log('\n=== ACTUAL TENANCY OWNER ===');
    if (owner) {
      console.log('ID:', owner._id);
      console.log('Name:', owner.name);
      console.log('Email:', owner.email);
      console.log('Phone:', owner.phone);
      console.log('Role:', owner.role);
      console.log('Tenancy field:', owner.tenancy);
      console.log('Assigned Branch:', owner.assignedBranch || 'NONE');
    } else {
      console.log('❌ Owner user not found!');
    }

    // Find deepakthavrani72@gmail.com
    const deepak = await User.findOne({ email: 'deepakthavrani72@gmail.com' }).lean();
    console.log('\n=== deepakthavrani72@gmail.com ===');
    console.log('ID:', deepak._id);
    console.log('Name:', deepak.name);
    console.log('Role:', deepak.role);
    console.log('Tenancy field:', deepak.tenancy);
    console.log('Assigned Branch:', deepak.assignedBranch);

    // Find the branch
    if (deepak.assignedBranch) {
      const branch = await Branch.findById(deepak.assignedBranch).lean();
      console.log('\n=== ASSIGNED BRANCH ===');
      if (branch) {
        console.log('ID:', branch._id);
        console.log('Name:', branch.name);
        console.log('Tenancy:', branch.tenancy);
      } else {
        console.log('❌ Branch not found!');
      }
    }

    // List all admins for this tenancy
    const allAdmins = await User.find({ 
      tenancy: tenancy._id, 
      role: 'admin' 
    }).select('name email assignedBranch').lean();
    
    console.log('\n=== ALL ADMINS FOR THIS TENANCY ===');
    for (const admin of allAdmins) {
      const type = admin.assignedBranch ? 'Branch Admin' : 'Tenancy Owner';
      console.log(`- ${admin.email} (${admin.name}) - ${type}`);
    }

    console.log('\n=== RECOMMENDATION ===');
    if (owner && owner.email !== 'deepakthavrani72@gmail.com') {
      console.log(`Actual Tenancy Owner: ${owner.email}`);
      console.log(`deepakthavrani72@gmail.com is a BRANCH ADMIN (has assignedBranch)`);
      console.log('');
      console.log('If deepakthavrani72@gmail.com should be the tenancy owner instead:');
      console.log('1. Update tenancy.owner to deepak\'s ID');
      console.log('2. Remove assignedBranch from deepak');
      console.log('');
      console.log('If current setup is correct (deepak is branch admin):');
      console.log('- No changes needed, this is working as expected');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

checkUser();
