const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createViratSales() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    const SalesUser = require('./src/models/SalesUser');
    
    // Check if user already exists
    const existing = await SalesUser.findOne({ email: 'virat@sales.com' });
    if (existing) {
      console.log('❌ User virat@sales.com already exists!');
      await mongoose.connection.close();
      return;
    }
    
    // Create new sales user
    const hashedPassword = await bcrypt.hash('sales123', 10);
    
    const salesUser = await SalesUser.create({
      name: 'Virat Sales',
      email: 'virat@sales.com',
      password: hashedPassword,
      phone: '9876543210',
      employeeId: 'SALES001',
      designation: 'Sales Manager',
      role: 'sales_admin',
      isActive: true,
      permissions: {
        leads: { view: true, create: true, update: true, delete: true },
        trials: { view: true, extend: true, convert: true },
        subscriptions: { view: true, manage: true },
        payments: { view: true, record: true }
      }
    });
    
    console.log('✅ Sales User Created Successfully!\n');
    console.log('📧 Email: virat@sales.com');
    console.log('🔑 Password: sales123');
    console.log('🆔 ID:', salesUser._id);
    console.log('\n🎯 Now you can login at: http://localhost:3005');
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

createViratSales();
