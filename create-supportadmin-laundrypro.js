const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createSupportAdminUser() {
  try {
    // Connect to MongoDB using the backend's connection
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry-management', {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Check if user already exists
    const existingUser = await usersCollection.findOne({
      email: 'supportadmin@laundrypro.com'
    });

    if (existingUser) {
      console.log('⚠️ User already exists! Updating password...');
      
      // Hash the password
      const hashedPassword = await bcrypt.hash('deep2025', 12);
      
      // Update the existing user
      await usersCollection.updateOne(
        { email: 'supportadmin@laundrypro.com' },
        { 
          $set: { 
            password: hashedPassword,
            isActive: true,
            isEmailVerified: true,
            role: 'support',
            updatedAt: new Date(),
            permissions: {
              orders: { view: true, create: false, update: true, delete: false, assign: true, cancel: false, process: true },
              staff: { view: true, create: false, update: false, delete: false, assignShift: false, manageAttendance: false },
              inventory: { view: true, create: false, update: false, delete: false, restock: false, writeOff: false },
              services: { view: true, create: false, update: false, delete: false, toggle: false, updatePricing: false },
              customers: { view: true, create: true, update: true, delete: false },
              logistics: { view: true, create: false, update: true, delete: false, assign: true, track: true },
              tickets: { view: true, create: true, update: true, delete: false, assign: true, resolve: true, escalate: true },
              performance: { view: true, create: false, update: false, delete: false, export: false },
              analytics: { view: true },
              settings: { view: false, create: false, update: false, delete: false },
              coupons: { view: true, create: false, update: false, delete: false },
              branches: { view: true, create: false, update: false, delete: false },
              branchAdmins: { view: false, create: false, update: false, delete: false },
              support: { view: true, create: true, update: true, delete: false, assign: true, manage: true }
            }
          }
        }
      );
      
      console.log('✅ Updated existing user with new password and permissions');
      
    } else {
      console.log('🔧 Creating new support admin user...');
      
      // Hash the password
      const hashedPassword = await bcrypt.hash('deep2025', 12);
      
      // Create new support admin user
      const supportAdminUser = {
        name: 'Support Admin',
        email: 'supportadmin@laundrypro.com',
        phone: '9876543210',
        password: hashedPassword,
        role: 'support',
        isActive: true,
        isEmailVerified: true,
        permissions: {
          orders: { view: true, create: false, update: true, delete: false, assign: true, cancel: false, process: true },
          staff: { view: true, create: false, update: false, delete: false, assignShift: false, manageAttendance: false },
          inventory: { view: true, create: false, update: false, delete: false, restock: false, writeOff: false },
          services: { view: true, create: false, update: false, delete: false, toggle: false, updatePricing: false },
          customers: { view: true, create: true, update: true, delete: false },
          logistics: { view: true, create: false, update: true, delete: false, assign: true, track: true },
          tickets: { view: true, create: true, update: true, delete: false, assign: true, resolve: true, escalate: true },
          performance: { view: true, create: false, update: false, delete: false, export: false },
          analytics: { view: true },
          settings: { view: false, create: false, update: false, delete: false },
          coupons: { view: true, create: false, update: false, delete: false },
          branches: { view: true, create: false, update: false, delete: false },
          branchAdmins: { view: false, create: false, update: false, delete: false },
          support: { view: true, create: true, update: true, delete: false, assign: true, manage: true }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await usersCollection.insertOne(supportAdminUser);
      console.log('✅ Created new support admin user');
    }

    // Verify the user was created/updated correctly
    const verifyUser = await usersCollection.findOne({
      email: 'supportadmin@laundrypro.com'
    });

    console.log('\n🎉 Support Admin User Ready!');
    console.log('\n📋 Login Credentials:');
    console.log('   Email: supportadmin@laundrypro.com');
    console.log('   Password: deep2025');
    console.log('   Role:', verifyUser.role);
    console.log('   Active:', verifyUser.isActive);
    console.log('   Email Verified:', verifyUser.isEmailVerified);
    
    console.log('\n🔧 User Capabilities:');
    console.log('   ✅ View and manage support tickets');
    console.log('   ✅ View and update orders');
    console.log('   ✅ View and manage customers');
    console.log('   ✅ View analytics and performance');
    console.log('   ✅ Assign and track logistics');
    console.log('   ✅ Full support management access');

    // Test password verification
    console.log('\n🔑 Testing password verification...');
    const isPasswordValid = await bcrypt.compare('deep2025', verifyUser.password);
    console.log('   Password verification:', isPasswordValid ? '✅ VALID' : '❌ INVALID');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n📤 Disconnected from MongoDB');
  }
}

createSupportAdminUser();