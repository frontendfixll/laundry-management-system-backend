const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function checkProductionTestTenancy() {
  try {
    // Use production MongoDB URI
    const productionURI = process.env.MONGODB_URI;
    console.log('🔍 Connecting to production database...');
    
    await mongoose.connect(productionURI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('✅ Connected to production MongoDB');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    const tenanciesCollection = db.collection('tenancies');

    // Find test-tenacy tenancy in production
    console.log('\n🔍 Searching for test-tenacy in production...');
    const testTenancy = await tenanciesCollection.findOne({
      $or: [
        { subdomain: 'test-tenacy' },
        { slug: 'test-tenacy' }
      ]
    });

    if (!testTenancy) {
      console.log('❌ test-tenacy tenancy not found in production');
      
      // Show all tenancies in production
      console.log('\n📋 All tenancies in production:');
      const allTenancies = await tenanciesCollection.find({}).toArray();
      allTenancies.forEach(t => {
        console.log(`   - ${t.name} (subdomain: ${t.subdomain}, slug: ${t.slug})`);
      });
      return;
    }

    console.log('✅ Found test-tenacy in production:', testTenancy.name);

    // Find users in test-tenacy
    console.log('\n👥 Users in test-tenacy (production):');
    const testTenancyUsers = await usersCollection.find({
      tenancy: testTenancy._id
    }).toArray();

    if (testTenancyUsers.length === 0) {
      console.log('❌ No users found in test-tenacy in production');
      
      // Create admin user for test-tenacy in production
      console.log('\n🔧 Creating admin user for test-tenacy in production...');
      const hashedPassword = await bcrypt.hash('admin123', 12);
      
      const newAdmin = {
        name: 'Test Tenacy Admin',
        email: 'admin@test-tenacy.com',
        phone: '9876543210',
        password: hashedPassword,
        role: 'admin',
        tenancy: testTenancy._id,
        isActive: true,
        isEmailVerified: true,
        permissions: {
          orders: { view: true, create: true, update: true, delete: true, assign: true, cancel: true, process: true },
          staff: { view: true, create: true, update: true, delete: true, assignShift: true, manageAttendance: true },
          inventory: { view: true, create: true, update: true, delete: true, restock: true, writeOff: true },
          services: { view: true, create: true, update: true, delete: true, toggle: true, updatePricing: true },
          customers: { view: true, create: true, update: true, delete: true },
          logistics: { view: true, create: true, update: true, delete: true, assign: true, track: true },
          tickets: { view: true, create: true, update: true, delete: true, assign: true, resolve: true, escalate: true },
          performance: { view: true, create: true, update: true, delete: true, export: true },
          analytics: { view: true },
          settings: { view: true, create: true, update: true, delete: true },
          coupons: { view: true, create: true, update: true, delete: true },
          branches: { view: true, create: true, update: true, delete: true },
          branchAdmins: { view: true, create: true, update: true, delete: true },
          support: { view: true, create: true, update: true, delete: true, assign: true, manage: true }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await usersCollection.insertOne(newAdmin);
      console.log('✅ Created admin user for test-tenacy in production');
      console.log('   Email: admin@test-tenacy.com');
      console.log('   Password: admin123');
      
    } else {
      console.log(`   Found ${testTenancyUsers.length} users:`);
      testTenancyUsers.forEach(u => {
        console.log(`   - ${u.name} (${u.email}) - Role: ${u.role}, Active: ${u.isActive}`);
      });

      // Reset passwords for existing users
      console.log('\n🔧 Resetting passwords for existing users...');
      const hashedPassword = await bcrypt.hash('admin123', 12);

      for (const user of testTenancyUsers) {
        if (user.role === 'admin') {
          await usersCollection.updateOne(
            { _id: user._id },
            { 
              $set: { 
                password: hashedPassword,
                updatedAt: new Date()
              }
            }
          );
          console.log(`✅ Reset password for: ${user.email}`);
        }
      }
    }

    console.log('\n🎉 Production credentials for test-tenacy.laundrylobby.com:');
    console.log('   Email: admin@test-tenacy.com');
    console.log('   Password: admin123');
    
    // Also check if shkrkand@gmail.com exists and reset its password
    const shkrkandUser = await usersCollection.findOne({ 
      email: 'shkrkand@gmail.com',
      tenancy: testTenancy._id 
    });
    
    if (shkrkandUser) {
      const hashedPassword = await bcrypt.hash('admin123', 12);
      await usersCollection.updateOne(
        { _id: shkrkandUser._id },
        { 
          $set: { 
            password: hashedPassword,
            updatedAt: new Date()
          }
        }
      );
      console.log('   Email: shkrkand@gmail.com');
      console.log('   Password: admin123');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('📤 Disconnected from production MongoDB');
  }
}

checkProductionTestTenancy();