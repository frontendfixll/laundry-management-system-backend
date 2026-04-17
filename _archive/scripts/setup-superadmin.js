const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const SuperAdmin = require('./src/models/SuperAdmin');
  
  // Check if superadmin exists
  const existing = await SuperAdmin.findOne({ email: 'superadmin@LaundryLobby.com' });
  
  if (existing) {
    console.log('SuperAdmin already exists:', existing.email);
    // Update password if needed
    existing.password = 'SuperAdmin@123';
    await existing.save();
    console.log('Password updated to: SuperAdmin@123');
  } else {
    // Create new superadmin
    const superAdmin = new SuperAdmin({
      name: 'Super Admin',
      email: 'superadmin@LaundryLobby.com',
      password: 'SuperAdmin@123',
      role: 'superadmin',
      isActive: true,
      permissions: {
        branches: true,
        users: true,
        orders: true,
        finances: true,
        analytics: true,
        settings: true,
        admins: true,
        pricing: true,
        audit: true
      }
    });
    
    await superAdmin.save();
    console.log('SuperAdmin created successfully!');
    console.log('Email: superadmin@LaundryLobby.com');
    console.log('Password: SuperAdmin@123');
  }
  
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
