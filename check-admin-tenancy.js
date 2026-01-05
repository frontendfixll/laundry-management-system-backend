/**
 * Check which tenancy is assigned to admin users
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function checkAdminTenancy() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = require('./src/models/User');
    const Tenancy = require('./src/models/Tenancy');
    
    const emails = ['deepakthavrani72@gmail.com', 'deepakthavrani94@gmail.com'];
    
    for (const email of emails) {
      const user = await User.findOne({ email }).populate('tenancy');
      
      if (user) {
        console.log('=====================================');
        console.log('Email:', user.email);
        console.log('Name:', user.name);
        console.log('Role:', user.role);
        console.log('');
        
        if (user.tenancy) {
          console.log('🏪 ASSIGNED LAUNDRY:');
          console.log('   Name:', user.tenancy.name);
          console.log('   Subdomain:', user.tenancy.subdomain);
          console.log('   Status:', user.tenancy.status);
          console.log('   ID:', user.tenancy._id);
        } else {
          console.log('❌ No tenancy assigned');
        }
        console.log('');
      }
    }

    await mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkAdminTenancy();
