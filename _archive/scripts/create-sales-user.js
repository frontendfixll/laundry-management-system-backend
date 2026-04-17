const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI);

const SalesUser = require('./src/models/SalesUser');

async function createSalesUser() {
  try {
    // Check if user already exists
    const existingUser = await SalesUser.findOne({ email: 'virat@sales.com' });
    if (existingUser) {
      console.log('✅ Sales user already exists!');
      console.log('📧 Email: virat@sales.com');
      console.log('🔑 Password: sales123');
      console.log('👤 Name:', existingUser.name);
      console.log('🆔 Employee ID:', existingUser.employeeId);
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('sales123', 10);

    // Create sales user
    const salesUser = await SalesUser.create({
      name: 'Virat Sales',
      email: 'virat@sales.com',
      password: hashedPassword,
      phone: '9876543210',
      employeeId: 'SALES001',
      designation: 'Sales Manager',
      role: 'sales_admin',
      isActive: true,
    });

    console.log('✅ Sales user created successfully!');
    console.log('📧 Email: virat@sales.com');
    console.log('🔑 Password: sales123');
    console.log('👤 Name:', salesUser.name);
    console.log('🆔 Employee ID:', salesUser.employeeId);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating sales user:', error.message);
    process.exit(1);
  }
}

createSalesUser();
