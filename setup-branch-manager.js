require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Branch = require('./src/models/Branch');
const { hashPassword } = require('./src/utils/password');

async function setupBranchManager() {
  try {
    console.log('🏢 Setting up Branch Manager...\n');

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find first active branch
    let branch = await Branch.findOne({ isActive: true });
    
    if (!branch) {
      // Create a branch if none exists
      branch = await Branch.create({
        name: 'LaundryPro Main Branch',
        code: 'MAIN001',
        address: {
          addressLine1: '123 Main Street',
          city: 'Delhi',
          pincode: '110001'
        },
        contact: { phone: '9876543210', email: 'main@laundrypro.com' },
        isActive: true
      });
      console.log('✅ Created branch:', branch.name);
    }

    // Check if branch manager already exists
    let manager = await User.findOne({ email: 'branchmanager@laundrypro.com' });

    if (manager) {
      console.log('⚠️  Branch Manager already exists');
    } else {
      const hashedPassword = await hashPassword('Branch@123456');
      
      manager = await User.create({
        name: 'Branch Manager',
        email: 'branchmanager@laundrypro.com',
        phone: '9876500001',
        password: hashedPassword,
        role: 'branch_manager',
        isActive: true,
        isEmailVerified: true,
        assignedBranch: branch._id
      });
      
      // Update branch with manager
      branch.manager = manager._id;
      await branch.save();
      
      console.log('✅ Branch Manager created');
    }

    console.log('\n========================================');
    console.log('🔐 BRANCH MANAGER LOGIN CREDENTIALS');
    console.log('========================================');
    console.log('URL:      http://localhost:3002/auth/login');
    console.log('Email:    branchmanager@laundrypro.com');
    console.log('Password: Branch@123456');
    console.log('Branch:  ', branch.name, `(${branch.code})`);
    console.log('========================================\n');

    await mongoose.disconnect();
    console.log('✅ Done!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupBranchManager();
