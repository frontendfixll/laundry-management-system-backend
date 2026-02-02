const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB and check tenant users
async function checkTenantUsers() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check Users collection (tenant admins)
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const users = await User.find({ role: 'admin' }).select('email name tenancy role isActive');
    
    console.log('👤 Tenant Admin users found:');
    if (users.length === 0) {
      console.log('❌ No tenant admin users found');
    } else {
      users.forEach((user, index) => {
        console.log(`${index + 1}. Email: ${user.email}`);
        console.log(`   Name: ${user.name || 'N/A'}`);
        console.log(`   Role: ${user.role || 'N/A'}`);
        console.log(`   Tenancy: ${user.tenancy || 'N/A'}`);
        console.log(`   Active: ${user.isActive}`);
        console.log('');
      });
    }

    // Check all users to see what's available
    console.log('👥 All users in database:');
    const allUsers = await User.find({}).select('email name role tenancy isActive').limit(10);
    allUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email} (${user.role}) - Tenancy: ${user.tenancy}`);
    });

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkTenantUsers();