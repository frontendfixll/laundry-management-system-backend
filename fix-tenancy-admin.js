/**
 * Fix Tenancy Admin Login
 * Activates the admin and sets password
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function fixTenancyAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = require('./src/models/User');
    const Tenancy = require('./src/models/Tenancy');
    
    // Get email from command line
    const email = process.argv[2];
    const newPassword = process.argv[3] || 'password123';
    
    if (!email) {
      console.log('Usage: node fix-tenancy-admin.js <email> [password]');
      console.log('\nPending tenancy admins:');
      
      const pendingAdmins = await User.find({ 
        role: 'admin', 
        isActive: false 
      }).populate('tenancy', 'name');
      
      pendingAdmins.forEach(a => {
        console.log(`  - ${a.email} (Tenancy: ${a.tenancy?.name || 'None'})`);
      });
      
      await mongoose.disconnect();
      return;
    }
    
    console.log(`🔧 Fixing admin: ${email}`);
    console.log(`🔑 New password: ${newPassword}\n`);
    
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    
    if (!user) {
      console.log('❌ User not found!');
      await mongoose.disconnect();
      return;
    }

    console.log('Before fix:');
    console.log('  - isActive:', user.isActive);
    console.log('  - isEmailVerified:', user.isEmailVerified);
    console.log('  - Has password:', !!user.password);

    // Fix the user
    user.isActive = true;
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    user.password = newPassword; // Will be hashed by pre-save hook
    
    await user.save();
    
    // Verify the fix
    const updatedUser = await User.findOne({ email: email.toLowerCase() }).select('+password');
    
    console.log('\nAfter fix:');
    console.log('  - isActive:', updatedUser.isActive);
    console.log('  - isEmailVerified:', updatedUser.isEmailVerified);

    // Test password
    const isMatch = await bcrypt.compare(newPassword, updatedUser.password);
    console.log('  - Password test:', isMatch ? '✅ WORKS' : '❌ FAILED');

    // Also activate tenancy if pending
    if (user.tenancy) {
      const tenancy = await Tenancy.findById(user.tenancy);
      if (tenancy && tenancy.status === 'pending') {
        tenancy.status = 'active';
        await tenancy.save();
        console.log('  - Tenancy activated:', tenancy.name);
      }
    }

    await mongoose.disconnect();
    
    console.log('\n✅ Admin fixed! You can now login with:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${newPassword}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixTenancyAdmin();
