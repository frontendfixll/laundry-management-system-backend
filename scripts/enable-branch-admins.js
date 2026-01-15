const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Tenancy = require('../src/models/Tenancy');

async function enableBranchAdmins() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find tenancy by admin email
    const tenancy = await Tenancy.findOne({ 
      'contact.email': 'admin1@gmail.com' 
    });

    if (!tenancy) {
      console.log('❌ Tenancy not found for admin1@gmail.com');
      process.exit(1);
    }

    console.log('\n📋 Current Features:');
    console.log(JSON.stringify(tenancy.subscription.features, null, 2));

    // Enable branch_admins feature
    tenancy.subscription.features.branch_admins = true;
    await tenancy.save();

    console.log('\n✅ Updated Features:');
    console.log(JSON.stringify(tenancy.subscription.features, null, 2));

    console.log('\n✅ branch_admins feature enabled successfully!');
    console.log('🔄 Please refresh your admin dashboard to see the change.');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

enableBranchAdmins();
