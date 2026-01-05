/**
 * Check Tenancy Admins Script
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function checkAdmins() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = require('./src/models/User');
    const Tenancy = require('./src/models/Tenancy');
    
    // Get all admin users
    const admins = await User.find({ role: 'admin' })
      .select('+emailVerificationToken +emailVerificationExpires +password')
      .populate('tenancy', 'name status');
    
    console.log(`Found ${admins.length} admin users:\n`);
    
    for (const admin of admins) {
      console.log('-----------------------------------');
      console.log('Email:', admin.email);
      console.log('Name:', admin.name);
      console.log('Active:', admin.isActive);
      console.log('Email Verified:', admin.isEmailVerified);
      console.log('Has Password:', !!admin.password);
      console.log('Tenancy:', admin.tenancy?.name || 'None');
      console.log('Tenancy Status:', admin.tenancy?.status || 'N/A');
      console.log('Has Pending Invitation:', !!admin.emailVerificationToken);
      
      if (admin.emailVerificationExpires) {
        const isExpired = new Date(admin.emailVerificationExpires) < new Date();
        console.log('Invitation Expired:', isExpired);
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Done');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkAdmins();
