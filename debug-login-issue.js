/**
 * Debug Login Issue Script
 * Checks user status and password in database
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function debugLogin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = require('./src/models/User');
    
    // Get the email from command line or use a default
    const email = process.argv[2] || 'deepakthavrani474@gmail.com';
    
    console.log(`🔍 Checking user: ${email}\n`);
    
    // Find user with password field
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password +emailVerificationToken +emailVerificationExpires');
    
    if (!user) {
      console.log('❌ User NOT FOUND in database');
      console.log('\nPossible issues:');
      console.log('1. Email might be different');
      console.log('2. User was not created properly');
      
      // List all users to help debug
      const allUsers = await User.find({}).select('email role isActive isEmailVerified tenancy');
      console.log('\n📋 All users in database:');
      allUsers.forEach(u => {
        console.log(`  - ${u.email} (${u.role}) - Active: ${u.isActive}, Verified: ${u.isEmailVerified}`);
      });
      
      await mongoose.disconnect();
      return;
    }

    console.log('✅ User FOUND!\n');
    console.log('User Details:');
    console.log('=============');
    console.log('ID:', user._id);
    console.log('Email:', user.email);
    console.log('Name:', user.name);
    console.log('Role:', user.role);
    console.log('Is Active:', user.isActive);
    console.log('Is Email Verified:', user.isEmailVerified);
    console.log('Has Password:', !!user.password);
    console.log('Password Hash:', user.password ? user.password.substring(0, 20) + '...' : 'NO PASSWORD');
    console.log('Tenancy:', user.tenancy);
    console.log('Has Pending Invitation:', !!user.emailVerificationToken);
    
    if (user.emailVerificationExpires) {
      const isExpired = new Date(user.emailVerificationExpires) < new Date();
      console.log('Invitation Expired:', isExpired);
    }

    // Test password comparison
    if (user.password) {
      console.log('\n🔐 Password Test:');
      const testPasswords = ['password123', 'Password123', 'admin123', 'test123'];
      
      for (const testPwd of testPasswords) {
        const isMatch = await bcrypt.compare(testPwd, user.password);
        console.log(`  "${testPwd}": ${isMatch ? '✅ MATCH' : '❌ No match'}`);
      }
      
      console.log('\n💡 If none match, the password was set to something else.');
      console.log('   You can reset it using the script below.');
    }

    // Check if password looks properly hashed
    if (user.password && !user.password.startsWith('$2')) {
      console.log('\n⚠️ WARNING: Password does not appear to be hashed properly!');
      console.log('   It should start with "$2a$" or "$2b$"');
    }

    await mongoose.disconnect();
    console.log('\n✅ Done');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

debugLogin();
