const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: __dirname + '/.env' });

async function resetPassword() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const CenterAdmin = require('./src/models/CenterAdmin');
    
    const admin = await CenterAdmin.findOne({ email: 'admin@LaundryLobby.com' });
    if (admin) {
      // Set password directly - the pre-save hook will hash it
      admin.password = 'Admin@123456';
      admin.loginAttempts = 0;
      admin.lockUntil = undefined;
      await admin.save();
      console.log('✅ Password reset successfully');
      console.log('📧 Email: admin@LaundryLobby.com');
      console.log('🔑 Password: Admin@123456');
    } else {
      console.log('Admin not found, creating new one...');
      await CenterAdmin.create({
        name: 'Center Admin',
        email: 'admin@LaundryLobby.com',
        password: 'Admin@123456', // Will be hashed by pre-save hook
        role: 'center_admin',
        permissions: {
          branches: true,
          users: true,
          orders: true,
          finances: true,
          analytics: true,
          settings: true
        },
        isActive: true
      });
      console.log('✅ Admin created');
      console.log('📧 Email: admin@LaundryLobby.com');
      console.log('🔑 Password: Admin@123456');
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

resetPassword();
