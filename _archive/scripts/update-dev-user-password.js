const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function updateDevUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const SalesUser = require('./src/models/SalesUser');
    
    // Find dev user
    const devUser = await SalesUser.findOne({ email: 'd@d.com' });
    if (!devUser) {
      console.log('❌ Dev user not found!');
      await mongoose.connection.close();
      return;
    }
    
    // Update password and details
    const hashedPassword = await bcrypt.hash('sales123', 10);
    
    devUser.password = hashedPassword;
    devUser.name = 'Sales User';
    devUser.phone = '9876543210';
    devUser.employeeId = 'SALES002'; // Changed to avoid duplicate
    devUser.designation = 'Sales Manager';
    devUser.role = 'sales_admin';
    devUser.isActive = true;
    devUser.permissions = {
      leads: { view: true, create: true, update: true, delete: true },
      trials: { view: true, extend: true, convert: true },
      subscriptions: { view: true, manage: true },
      payments: { view: true, record: true }
    };
    
    await devUser.save();
    
    console.log('✅ Sales User Updated Successfully!\n');
    console.log('📧 Email: d@d.com');
    console.log('🔑 Password: sales123');
    console.log('👤 Name: Sales User');
    console.log('🆔 ID:', devUser._id);
    console.log('\n🎯 Login at: http://localhost:3005');
    console.log('   Email: d@d.com');
    console.log('   Password: sales123');
    
    // Also reassign all leads to this user
    const Lead = require('./src/models/Lead');
    const result = await Lead.updateMany(
      {},
      { $set: { assignedTo: devUser._id, assignedDate: new Date() } }
    );
    
    console.log(`\n✅ Assigned ${result.modifiedCount} leads to this user`);
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

updateDevUser();
