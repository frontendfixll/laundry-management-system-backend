require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const { hashPassword } = require('./src/utils/password');

async function resetBranchManager() {
  try {
    console.log('🔄 Resetting Branch Manager password...\n');

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find branch manager
    let manager = await User.findOne({ email: 'branchmanager@LaundryLobby.com' });

    if (!manager) {
      console.log('❌ Branch Manager not found!');
      console.log('Run: node setup-branch-manager.js first');
      await mongoose.disconnect();
      return;
    }

    // Reset password
    const hashedPassword = await hashPassword('Branch@123456');
    manager.password = hashedPassword;
    manager.isActive = true;
    manager.isEmailVerified = true;
    await manager.save();

    console.log('✅ Password reset successful!');
    console.log('\n========================================');
    console.log('🔐 BRANCH MANAGER LOGIN CREDENTIALS');
    console.log('========================================');
    console.log('URL:      http://localhost:3002/auth/login');
    console.log('Email:    branchmanager@LaundryLobby.com');
    console.log('Password: Branch@123456');
    console.log('Role:    ', manager.role);
    console.log('Active:  ', manager.isActive);
    console.log('========================================\n');

    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

resetBranchManager();
