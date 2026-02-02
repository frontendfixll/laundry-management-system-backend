const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Connect to MongoDB and create a test tenant admin
async function createTestTenantAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Define User schema
    const userSchema = new mongoose.Schema({
      name: String,
      email: String,
      password: String,
      role: String,
      tenancy: mongoose.Schema.Types.ObjectId,
      isActive: Boolean,
      createdAt: { type: Date, default: Date.now }
    });

    const User = mongoose.model('User', userSchema);

    // Check if test user already exists
    const existingUser = await User.findOne({ email: 'test-tenant-admin@test.com' });
    if (existingUser) {
      console.log('👤 Test tenant admin already exists');
      console.log('📧 Email: test-tenant-admin@test.com');
      console.log('🔑 Password: TestAdmin@123');
      console.log('🏢 Tenancy:', existingUser.tenancy);
      await mongoose.disconnect();
      return;
    }

    // Get an existing tenancy ID
    const Tenancy = mongoose.model('Tenancy', new mongoose.Schema({}, { strict: false }));
    const tenancy = await Tenancy.findOne({}).select('_id name');
    
    if (!tenancy) {
      console.log('❌ No tenancy found in database. Creating a test tenancy...');
      
      const newTenancy = new Tenancy({
        name: 'Test Laundry',
        slug: 'test-laundry',
        email: 'test@testlaundry.com',
        phone: '+91-9999999999',
        address: {
          street: 'Test Street',
          city: 'Test City',
          state: 'Test State',
          zipCode: '123456',
          country: 'India'
        },
        subscription: {
          plan: 'premium',
          status: 'active'
        },
        isActive: true
      });
      
      await newTenancy.save();
      console.log('✅ Created test tenancy:', newTenancy._id);
      tenancy = newTenancy;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('TestAdmin@123', 10);

    // Create test tenant admin
    const testUser = new User({
      name: 'Test Tenant Admin',
      email: 'test-tenant-admin@test.com',
      password: hashedPassword,
      role: 'admin',
      tenancy: tenancy._id,
      isActive: true
    });

    await testUser.save();

    console.log('✅ Created test tenant admin successfully!');
    console.log('📧 Email: test-tenant-admin@test.com');
    console.log('🔑 Password: TestAdmin@123');
    console.log('🏢 Tenancy:', tenancy._id);
    console.log('🏢 Tenancy Name:', tenancy.name);

    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createTestTenantAdmin();