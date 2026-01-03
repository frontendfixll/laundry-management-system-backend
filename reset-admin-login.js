/**
 * Reset Admin Password Script
 * Run: node reset-admin-login.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const resetAdminPassword = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = mongoose.connection.collection('users');

    // Find admin user
    const admin = await User.findOne({ email: 'admin@laundrypro.com' });
    
    if (!admin) {
      console.log('❌ Admin user not found!');
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log('📋 Found Admin User:');
    console.log(`   Name: ${admin.name}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   Active: ${admin.isActive}`);

    // Reset password to 'admin123'
    const newPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await User.updateOne(
      { email: 'admin@laundrypro.com' },
      { 
        $set: { 
          password: hashedPassword,
          isActive: true,
          isEmailVerified: true
        }
      }
    );

    console.log('\n✅ Password reset successful!');
    console.log('\n' + '='.repeat(50));
    console.log('\n🔐 NEW LOGIN CREDENTIALS:');
    console.log('   Email: admin@laundrypro.com');
    console.log('   Password: admin123');
    console.log('\n🔗 Login URL: http://localhost:3000/auth/login');
    console.log('='.repeat(50));

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

resetAdminPassword();
