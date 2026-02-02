const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

const SuperAdmin = require('./src/models/SuperAdmin');

async function setCorrectPassword() {
  try {
    console.log('🔧 Setting Correct Password for SuperAdmin...');
    
    const email = 'superadmin@laundrypro.com';
    const newPassword = 'SuperAdmin@123';
    
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 New Password: ${newPassword}`);
    
    // Hash the password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    // Update the password
    const result = await SuperAdmin.updateOne(
      { email: email },
      { 
        $set: { 
          password: hashedPassword,
          isActive: true
        }
      }
    );
    
    if (result.modifiedCount > 0) {
      console.log('✅ Password updated successfully!');
      
      // Test the password
      console.log('\n🧪 Testing new password...');
      const admin = await SuperAdmin.findOne({ email: email });
      const isMatch = await bcrypt.compare(newPassword, admin.password);
      
      if (isMatch) {
        console.log('✅ Password verification successful!');
        console.log('\n📋 Login Credentials:');
        console.log(`   Email: ${email}`);
        console.log(`   Password: ${newPassword}`);
        console.log('\n🌐 Now try login at: http://localhost:3001');
      } else {
        console.log('❌ Password verification failed!');
      }
      
    } else {
      console.log('❌ Password update failed - user not found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

setCorrectPassword();