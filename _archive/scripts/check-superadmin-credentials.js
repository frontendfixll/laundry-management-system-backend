const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
async function checkSuperAdminCredentials() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check SuperAdmin collection
    const SuperAdmin = mongoose.model('SuperAdmin', new mongoose.Schema({}, { strict: false }));
    const superAdmins = await SuperAdmin.find({}).select('email name role isActive');
    
    console.log('👑 SuperAdmin accounts found:');
    superAdmins.forEach((admin, index) => {
      console.log(`${index + 1}. Email: ${admin.email}`);
      console.log(`   Name: ${admin.name || 'N/A'}`);
      console.log(`   Role: ${admin.role || 'N/A'}`);
      console.log(`   Active: ${admin.isActive}`);
      console.log('');
    });

    // Check CenterAdmin collection (also valid for SuperAdmin routes)
    const CenterAdmin = mongoose.model('CenterAdmin', new mongoose.Schema({}, { strict: false }));
    const centerAdmins = await CenterAdmin.find({}).select('email name role isActive');
    
    console.log('🏢 CenterAdmin accounts found:');
    centerAdmins.forEach((admin, index) => {
      console.log(`${index + 1}. Email: ${admin.email}`);
      console.log(`   Name: ${admin.name || 'N/A'}`);
      console.log(`   Role: ${admin.role || 'N/A'}`);
      console.log(`   Active: ${admin.isActive}`);
      console.log('');
    });

    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkSuperAdminCredentials();