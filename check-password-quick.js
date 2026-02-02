const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });

const SuperAdmin = require('./src/models/SuperAdmin');

async function quickPasswordCheck() {
  try {
    console.log('🔍 Quick Password Check...');
    
    const admin = await SuperAdmin.findOne({ email: 'superadmin@laundrypro.com' });
    
    if (admin) {
      console.log(`✅ Found: ${admin.email}`);
      
      // Test most common passwords
      const passwords = ['admin123', 'password', '123456'];
      
      for (const pwd of passwords) {
        const isMatch = await bcrypt.compare(pwd, admin.password);
        if (isMatch) {
          console.log(`🎉 CORRECT PASSWORD: ${pwd}`);
          return pwd;
        }
      }
      
      console.log('❌ None of the common passwords work');
      
    } else {
      console.log('❌ Admin not found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.connection.close();
  }
}

quickPasswordCheck();