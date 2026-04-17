const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function resetTestTenancyPassword() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const tenanciesCollection = db.collection('tenancies');

    // Find test-tenacy tenancy
    const testTenancy = await tenanciesCollection.findOne({
      $or: [
        { subdomain: 'test-tenacy' },
        { slug: 'test-tenacy' }
      ]
    });

    if (!testTenancy) {
      console.log('❌ test-tenacy tenancy not found');
      return;
    }

    console.log('✅ Found test-tenacy tenancy:', testTenancy.name);

    // Find admin users in test-tenacy
    const adminUsers = await usersCollection.find({
      tenancy: testTenancy._id,
      role: 'admin'
    }).toArray();

    if (adminUsers.length === 0) {
      console.log('❌ No admin users found in test-tenacy');
      return;
    }

    console.log(`\n🔧 Resetting passwords for ${adminUsers.length} admin users in test-tenacy:`);

    // Reset password to 'admin123' for all admin users
    const newPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    for (const user of adminUsers) {
      await usersCollection.updateOne(
        { _id: user._id },
        { 
          $set: { 
            password: hashedPassword,
            updatedAt: new Date()
          }
        }
      );

      console.log(`✅ Reset password for: ${user.email} (${user.name})`);
    }

    console.log('\n🎉 Password reset complete!');
    console.log('\n📋 Login credentials for test-tenacy.laundrylobby.com:');
    adminUsers.forEach(user => {
      console.log(`   Email: ${user.email}`);
      console.log(`   Password: ${newPassword}`);
      console.log('   ---');
    });

    console.log('\n⚠️  IMPORTANT: admin@gmail.com should NOT work on test-tenacy subdomain');
    console.log('   This is correct behavior due to tenancy isolation.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('📤 Disconnected from MongoDB');
  }
}

resetTestTenancyPassword();