const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const User = require('./src/models/User');
const Tenancy = require('./src/models/Tenancy');

async function createSupportUser() {
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

    // Check if support user already exists
    const existingSupportUser = await usersCollection.findOne({
      email: 'support@test-tenacy.com',
      tenancy: testTenancy._id
    });

    if (existingSupportUser) {
      console.log('⚠️ Support user already exists:', existingSupportUser.email);
      
      // Reset password
      const hashedPassword = await bcrypt.hash('support123', 12);
      await usersCollection.updateOne(
        { _id: existingSupportUser._id },
        { 
          $set: { 
            password: hashedPassword,
            updatedAt: new Date()
          }
        }
      );
      console.log('✅ Password reset for existing support user');
    } else {
      // Create new support user
      console.log('🔧 Creating new support user...');
      const hashedPassword = await bcrypt.hash('support123', 12);
      
      const supportUser = {
        name: 'Test Support Agent',
        email: 'support@test-tenacy.com',
        phone: '9876543211',
        password: hashedPassword,
        role: 'support',
        tenancy: testTenancy._id,
        isActive: true,
        isEmailVerified: true,
        permissions: {
          orders: { view: true, create: false, update: false, delete: false, assign: false, cancel: false, process: false },
          staff: { view: false, create: false, update: false, delete: false, assignShift: false, manageAttendance: false },
          inventory: { view: false, create: false, update: false, delete: false, restock: false, writeOff: false },
          services: { view: true, create: false, update: false, delete: false, toggle: false, updatePricing: false },
          customers: { view: true, create: false, update: false, delete: false },
          logistics: { view: false, create: false, update: false, delete: false, assign: false, track: false },
          tickets: { view: true, create: true, update: true, delete: false, assign: true, resolve: true, escalate: true },
          performance: { view: false, create: false, update: false, delete: false, export: false },
          analytics: { view: false },
          settings: { view: false, create: false, update: false, delete: false },
          coupons: { view: false, create: false, update: false, delete: false },
          branches: { view: false, create: false, update: false, delete: false },
          branchAdmins: { view: false, create: false, update: false, delete: false },
          support: { view: false, create: false, update: false, delete: false, assign: false, manage: false }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await usersCollection.insertOne(supportUser);
      console.log('✅ Created support user');
    }

    console.log('\n🎉 Support user ready!');
    console.log('\n📋 Support User Credentials:');
    console.log('   URL: https://test-tenacy.laundrylobby.com');
    console.log('   Email: support@test-tenacy.com');
    console.log('   Password: support123');
    console.log('   Role: support');
    
    console.log('\n🔧 Support User Capabilities:');
    console.log('   ✅ View and manage tickets');
    console.log('   ✅ Assign tickets to self');
    console.log('   ✅ Add messages to tickets');
    console.log('   ✅ Resolve tickets');
    console.log('   ✅ Escalate tickets to admins');
    console.log('   ✅ View customers (for ticket context)');
    console.log('   ✅ View orders (for ticket context)');
    console.log('   ❌ Cannot manage other users');
    console.log('   ❌ Cannot access admin functions');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('📤 Disconnected from MongoDB');
  }
}

createSupportUser();