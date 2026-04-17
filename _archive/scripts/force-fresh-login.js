// Force fresh login by updating user's lastLogin field
const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI);

const User = require('./src/models/User');

async function forceFreshLogin() {
  try {
    console.log('🔄 Forcing fresh login for admin user...');
    
    // Find and update the admin user
    const user = await User.findOneAndUpdate(
      { 
        email: 'shkrkand@gmail.com',
        role: 'admin'
      },
      {
        $set: {
          lastLogin: new Date(),
          // Force token refresh by updating a field
          updatedAt: new Date()
        }
      },
      { new: true }
    );
    
    if (!user) {
      console.log('❌ Admin user not found');
      return;
    }
    
    console.log('👤 User found:', user.name, user.email);
    console.log('🔐 Current support permissions:', user.permissions.support);
    
    // Verify permissions are correct
    if (user.permissions.support.view === true) {
      console.log('✅ Support permissions are correct in database');
      console.log('💡 Issue is with JWT token caching old permissions');
      console.log('🔧 Solution: User needs to logout and login again to get fresh token');
    } else {
      console.log('❌ Support permissions are still false in database');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.disconnect();
  }
}

forceFreshLogin();