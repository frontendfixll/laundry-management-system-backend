const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

const SuperAdmin = require('./src/models/SuperAdmin');

async function resetPassword() {
  try {
    console.log('🔧 Resetting SuperAdmin Password...');
    
    const newPassword = 'admin123';
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    const result = await SuperAdmin.updateOne(
      { email: 'superadmin@laundrypro.com' },
      { 
        $set: { 
          password: hashedPassword,
          isActive: true
        }
      }
    );
    
    if (result.modifiedCount > 0) {
      console.log('✅ Password reset successful!');
      console.log(`📧 Email: superadmin@laundrypro.com`);
      console.log(`🔑 Password: ${newPassword}`);
    } else {
      console.log('❌ Password reset failed');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

resetPassword();