/**
 * Setup Admin User Script
 * Run: node setup-admin.js
 * 
 * This script checks for existing admin users and shows their credentials.
 * Only creates a new admin if none exists.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

const setupAdmin = async () => {
  await connectDB();

  // Get User model from existing schema
  const User = mongoose.connection.collection('users');

  try {
    console.log('\n🔍 Checking for existing admin users...\n');

    // Find ALL users with admin role
    const existingAdmins = await User.find({ role: 'admin' }).toArray();

    if (existingAdmins.length > 0) {
      console.log(`✅ Found ${existingAdmins.length} existing admin user(s):\n`);
      console.log('=' .repeat(60));
      
      existingAdmins.forEach((admin, index) => {
        console.log(`\n📋 Admin #${index + 1}:`);
        console.log(`   Name: ${admin.name}`);
        console.log(`   Email: ${admin.email}`);
        console.log(`   Phone: ${admin.phone}`);
        console.log(`   Role: ${admin.role}`);
        console.log(`   Active: ${admin.isActive}`);
        console.log(`   Email Verified: ${admin.isEmailVerified}`);
        console.log(`   Created: ${admin.createdAt}`);
      });
      
      console.log('\n' + '=' .repeat(60));
      console.log('\n⚠️  Admin user(s) already exist! No new admin created.');
      console.log('\n🔐 Use one of the above emails to login.');
      console.log('   If you forgot password, use the first admin email with password: admin123');
      console.log('   (or whatever password was set during creation)');
      
    } else {
      console.log('❌ No admin users found. Creating new admin...\n');
      
      // Check if email/phone already exists with different role
      const existingUser = await User.findOne({ 
        $or: [
          { email: 'admin@laundry.com' }, 
          { phone: '9999999999' }
        ] 
      });

      if (existingUser) {
        // Update existing user to admin role
        await User.updateOne(
          { _id: existingUser._id },
          { 
            $set: { 
              role: 'admin',
              isActive: true,
              isEmailVerified: true
            }
          }
        );
        console.log('✅ Updated existing user to admin role!');
        console.log('\n📋 Admin Login Credentials:');
        console.log(`   Email: ${existingUser.email}`);
        console.log('   Password: (use your existing password)');
        console.log('   Role: admin');
      } else {
        // Create new admin
        const hashedPassword = await bcrypt.hash('admin123', 12);
        
        await User.insertOne({
          name: 'Admin User',
          email: 'admin@laundry.com',
          phone: '9999999999',
          password: hashedPassword,
          role: 'admin',
          isActive: true,
          isEmailVerified: true,
          isVIP: false,
          rewardPoints: 0,
          totalOrders: 0,
          addresses: [],
          preferences: {},
          createdAt: new Date(),
          updatedAt: new Date()
        });

        console.log('✅ New admin user created successfully!');
        console.log('\n📋 Admin Login Credentials:');
        console.log('   Email: admin@laundry.com');
        console.log('   Password: admin123');
        console.log('   Role: admin');
      }
    }

    // Also show Center Admin info if exists
    const centerAdmins = await mongoose.connection.collection('centeradmins').find({}).toArray();
    if (centerAdmins.length > 0) {
      console.log('\n' + '=' .repeat(60));
      console.log('\n📌 Center Admin Users (separate login):');
      centerAdmins.forEach((ca, index) => {
        console.log(`\n   Center Admin #${index + 1}:`);
        console.log(`   Email: ${ca.email}`);
        console.log(`   Login URL: /auth/center-admin-login`);
      });
    }

    console.log('\n' + '=' .repeat(60));
    console.log('\n🔗 Admin Login URL: http://localhost:3000/auth/login');
    console.log('📌 After login, redirect to: /admin/dashboard');
    console.log('\n✅ Done!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  await mongoose.disconnect();
  process.exit(0);
};

setupAdmin();
