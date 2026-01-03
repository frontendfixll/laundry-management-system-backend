require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const { hashPassword } = require('./src/utils/password');

async function setupOperationsAdmin() {
  try {
    console.log('🔧 Setting up Operations Admin...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'opsadmin@laundrypro.com' });
    
    if (existingAdmin) {
      console.log('⚠️ Operations Admin already exists!');
      console.log('Email: opsadmin@laundrypro.com');
      console.log('Password: Admin@123456');
    } else {
      // Create operations admin
      const hashedPassword = await hashPassword('Admin@123456');
      
      const admin = new User({
        name: 'Operations Admin',
        email: 'opsadmin@laundrypro.com',
        phone: '9999888877',
        password: hashedPassword,
        role: 'admin',
        isActive: true,
        isEmailVerified: true
      });

      await admin.save();
      console.log('✅ Operations Admin created successfully!');
      console.log('\n📋 Login Credentials:');
      console.log('Email: opsadmin@laundrypro.com');
      console.log('Password: Admin@123456');
    }

    console.log('\n🔗 Login URL: http://localhost:3002/auth/login');
    console.log('📊 Dashboard: http://localhost:3002/admin/dashboard');

    await mongoose.disconnect();
    console.log('\n✅ Done!');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

setupOperationsAdmin();
