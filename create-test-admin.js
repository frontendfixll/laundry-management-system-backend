require('dotenv').config();
const mongoose = require('mongoose');
const { hashPassword } = require('./src/utils/password');

async function createTestAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
    const Tenancy = mongoose.model('Tenancy', new mongoose.Schema({}, { strict: false }), 'tenancies');

    // Find the test-tenacy tenancy
    const testTenancy = await Tenancy.findOne({ slug: 'test-tenacy' }).lean();
    
    if (!testTenancy) {
      console.log('❌ test-tenacy tenancy not found');
      return;
    }

    console.log('✅ Found test-tenacy tenancy:', testTenancy.name);

    // Check if test admin already exists
    let testAdmin = await User.findOne({ email: 'testadmin@test-tenacy.com' });
    
    if (testAdmin) {
      console.log('✅ Test admin already exists, updating password...');
      
      // Update password to known value
      const hashedPassword = await hashPassword('test123');
      testAdmin.password = hashedPassword;
      testAdmin.isActive = true;
      await testAdmin.save();
      
      console.log('✅ Updated test admin password to: test123');
    } else {
      console.log('Creating new test admin...');
      
      // Create new test admin
      const hashedPassword = await hashPassword('test123');
      
      testAdmin = new User({
        name: 'Test Admin',
        email: 'testadmin@test-tenacy.com',
        phone: '+1234567890',
        password: hashedPassword,
        role: 'admin',
        tenancy: testTenancy._id,
        isActive: true,
        isEmailVerified: true
      });
      
      await testAdmin.save();
      console.log('✅ Created new test admin');
    }

    console.log('\n=== TEST ADMIN DETAILS ===');
    console.log('Email:', testAdmin.email);
    console.log('Password: test123');
    console.log('Role:', testAdmin.role);
    console.log('Tenancy:', testTenancy.name);
    console.log('Tenancy Slug:', testTenancy.slug);
    console.log('Tenancy Subdomain:', testTenancy.subdomain);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

createTestAdmin();