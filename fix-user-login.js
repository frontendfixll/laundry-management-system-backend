/**
 * Fix User Login Script
 * Verifies email and resets password for a user
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function fixUserLogin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = require('./src/models/User');
    
    // Get email from command line or use default
    const email = process.argv[2] || 'deepakthavrani474@gmail.com';
    const newPassword = process.argv[3] || 'password123';
    
    console.log(`🔧 Fixing user: ${email}`);
    console.log(`🔑 New password: ${newPassword}\n`);
    
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    
    if (!user) {
      console.log('❌ User not found!');
      await mongoose.disconnect();
      return;
    }

    console.log('Before fix:');
    console.log('  - isEmailVerified:', user.isEmailVerified);
    console.log('  - isActive:', user.isActive);
    console.log('  - Has password:', !!user.password);

    // Fix the user
    user.isEmailVerified = true;
    user.isActive = true;
    user.password = newPassword; // Will be hashed by pre-save hook
    
    await user.save();
    
    // Verify the fix
    const updatedUser = await User.findOne({ email: email.toLowerCase() }).select('+password');
    
    console.log('\nAfter fix:');
    console.log('  - isEmailVerified:', updatedUser.isEmailVerified);
    console.log('  - isActive:', updatedUser.isActive);
    console.log('  - Password hash starts with:', updatedUser.password.substring(0, 10));

    // Test password
    const isMatch = await bcrypt.compare(newPassword, updatedUser.password);
    console.log('  - Password test:', isMatch ? '✅ WORKS' : '❌ FAILED');

    await mongoose.disconnect();
    
    console.log('\n✅ User fixed! You can now login with:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${newPassword}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixUserLogin();
