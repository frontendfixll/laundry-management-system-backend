const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function fixPassword() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    const SalesUser = require('./src/models/SalesUser');
    
    // Find user
    const user = await SalesUser.findOne({ email: 'd@d.com' });
    if (!user) {
      console.log('❌ User not found!');
      await mongoose.connection.close();
      return;
    }
    
    console.log('Found user:', user.name);
    console.log('Current password hash:', user.password);
    console.log('');
    
    // Hash new password properly
    const newPassword = 'sales123';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    console.log('New password:', newPassword);
    console.log('New hash:', hashedPassword);
    console.log('');
    
    // Update using direct MongoDB update to avoid any middleware issues
    await mongoose.connection.collection('salesusers').updateOne(
      { email: 'd@d.com' },
      { $set: { password: hashedPassword } }
    );
    
    console.log('✅ Password updated!\n');
    
    // Verify the password works
    const updatedUser = await SalesUser.findOne({ email: 'd@d.com' });
    const isMatch = await bcrypt.compare(newPassword, updatedUser.password);
    
    console.log('🔍 Verification:');
    console.log('   Password matches:', isMatch ? '✅ YES' : '❌ NO');
    console.log('');
    
    if (isMatch) {
      console.log('🎉 SUCCESS! You can now login with:');
      console.log('   Email: d@d.com');
      console.log('   Password: sales123');
    } else {
      console.log('❌ Something went wrong!');
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fixPassword();
