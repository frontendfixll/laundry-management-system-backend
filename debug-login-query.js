// Debug the exact database query used in login
const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI);

const User = require('./src/models/User');
const Tenancy = require('./src/models/Tenancy'); // Import Tenancy model

async function debugLoginQuery() {
  try {
    console.log('🔍 Debugging login database query...');
    
    // Exact same query as in login controller
    const user = await User.findOne({ email: 'shkrkand@gmail.com' })
      .select('+password')
      .populate('tenancy', 'name slug subdomain branding status subscription');
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('👤 User found:', user.name, user.email);
    console.log('🔐 Support permissions from query:', JSON.stringify(user.permissions.support, null, 2));
    
    // Also test without populate to see if that's causing issues
    const userSimple = await User.findOne({ email: 'shkrkand@gmail.com' });
    console.log('🔐 Support permissions (simple query):', JSON.stringify(userSimple.permissions.support, null, 2));
    
    // Check if permissions object exists
    console.log('📋 Permissions object exists:', !!user.permissions);
    console.log('📋 Support object exists:', !!user.permissions.support);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.disconnect();
  }
}

debugLoginQuery();