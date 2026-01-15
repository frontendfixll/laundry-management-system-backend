require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const { hashPassword, comparePassword } = require('./src/utils/password');

async function testLogin() {
  try {
    console.log('🔍 Testing Branch Manager Login...\n');

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find branch manager
    const manager = await User.findOne({ email: 'branchmanager@LaundryLobby.com' }).select('+password');

    if (!manager) {
      console.log('❌ Branch Manager not found!');
      await mongoose.disconnect();
      return;
    }

    console.log('\n📋 User Details:');
    console.log('- ID:', manager._id);
    console.log('- Name:', manager.name);
    console.log('- Email:', manager.email);
    console.log('- Role:', manager.role);
    console.log('- isActive:', manager.isActive);
    console.log('- Password hash exists:', !!manager.password);
    console.log('- Password hash length:', manager.password?.length);

    // Test password comparison
    const testPassword = 'Branch@123456';
    console.log('\n🔐 Testing password:', testPassword);
    
    const isMatch = await comparePassword(testPassword, manager.password);
    console.log('- Password match:', isMatch);

    if (!isMatch) {
      console.log('\n⚠️ Password does not match! Resetting...');
      
      // Reset password
      const newHash = await hashPassword(testPassword);
      manager.password = newHash;
      await manager.save();
      
      // Verify again
      const updatedManager = await User.findOne({ email: 'branchmanager@LaundryLobby.com' }).select('+password');
      const isMatchNow = await comparePassword(testPassword, updatedManager.password);
      console.log('- Password match after reset:', isMatchNow);
    }

    console.log('\n✅ Done!');
    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testLogin();
