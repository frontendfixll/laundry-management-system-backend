const mongoose = require('mongoose');
require('dotenv').config();

async function checkUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected');
    
    const SalesUser = require('./src/models/SalesUser');
    const users = await SalesUser.find();
    
    console.log('\n👥 All Sales Users:\n');
    users.forEach(user => {
      console.log(`Name: ${user.name}`);
      console.log(`Email: ${user.email}`);
      console.log(`ID: ${user._id}`);
      console.log(`Active: ${user.isActive}`);
      console.log('---');
    });
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkUsers();
