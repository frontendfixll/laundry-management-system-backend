// Temporary script to update user permissions directly in database
const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI);

const User = require('./src/models/User');

async function updateSupportPermissions() {
  try {
    console.log('🔍 Finding and updating admin user permissions...');
    
    // Find the admin user
    const user = await User.findOne({ 
      email: 'shkrkand@gmail.com',
      role: 'admin'
    });
    
    if (!user) {
      console.log('❌ Admin user not found');
      return;
    }
    
    console.log('👤 Found user:', user.name, user.email);
    
    // Update support permissions
    await User.findByIdAndUpdate(user._id, {
      $set: {
        'permissions.support.view': true,
        'permissions.support.create': true,
        'permissions.support.update': true,
        'permissions.support.delete': true,
        'permissions.support.assign': true,
        'permissions.support.manage': true
      }
    });
    
    console.log('✅ Support permissions enabled!');
    
    // Verify the update
    const updatedUser = await User.findById(user._id);
    console.log('🔐 Updated support permissions:', updatedUser.permissions.support);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.disconnect();
  }
}

updateSupportPermissions();