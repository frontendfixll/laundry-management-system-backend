const jwt = require('jsonwebtoken');
const User = require('./src/models/User');
const SuperAdmin = require('./src/models/SuperAdmin');
const { verifyToken } = require('./src/utils/jwt');
require('dotenv').config();

// Connect to MongoDB
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry-management');

async function debugAuth() {
  try {
    console.log('🔍 Debugging Authentication Issues...\n');
    
    // Check if we have any admin users
    const adminUsers = await User.find({ role: 'admin' }).select('name email role isActive');
    console.log('👥 Admin Users:', adminUsers.length);
    adminUsers.forEach(user => {
      console.log(`  - ${user.name} (${user.email}) - Role: ${user.role}, Active: ${user.isActive}`);
    });
    
    // Check if we have any superadmin users
    const superAdmins = await SuperAdmin.find({}).select('name email role isActive');
    console.log('\n👑 SuperAdmin Users:', superAdmins.length);
    superAdmins.forEach(admin => {
      console.log(`  - ${admin.name} (${admin.email}) - Role: ${admin.role}, Active: ${admin.isActive}`);
    });
    
    // Test token generation for first admin user
    if (adminUsers.length > 0) {
      const testUser = adminUsers[0];
      const testToken = jwt.sign(
        { userId: testUser._id, role: testUser.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      console.log('\n🔑 Test Token for Admin User:');
      console.log('Token:', testToken.substring(0, 50) + '...');
      
      // Verify the token
      try {
        const decoded = verifyToken(testToken);
        console.log('✅ Token verification successful:', decoded);
      } catch (error) {
        console.log('❌ Token verification failed:', error.message);
      }
    }
    
    // Test token generation for first superadmin user
    if (superAdmins.length > 0) {
      const testAdmin = superAdmins[0];
      const testToken = jwt.sign(
        { adminId: testAdmin._id, role: 'superadmin' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      console.log('\n🔑 Test Token for SuperAdmin:');
      console.log('Token:', testToken.substring(0, 50) + '...');
      
      // Verify the token
      try {
        const decoded = verifyToken(testToken);
        console.log('✅ Token verification successful:', decoded);
      } catch (error) {
        console.log('❌ Token verification failed:', error.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Debug error:', error);
  } finally {
    mongoose.connection.close();
  }
}

debugAuth();