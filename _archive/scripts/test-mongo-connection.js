require('dotenv').config();
const mongoose = require('mongoose');

async function testConnection() {
  console.log('🔍 Testing MongoDB Connection...');
  console.log('📍 MongoDB URI:', process.env.MONGODB_URI ? 'Found' : 'Missing');
  
  try {
    const options = {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      maxPoolSize: 1,
      family: 4
    };

    console.log('⏳ Attempting connection...');
    const conn = await mongoose.connect(process.env.MONGODB_URI, options);
    
    console.log('✅ Connection successful!');
    console.log('📊 Host:', conn.connection.host);
    console.log('📊 Database:', conn.connection.name);
    console.log('📊 State:', conn.connection.readyState);
    
    await mongoose.connection.close();
    console.log('👋 Connection closed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('Error type:', error.name);
    process.exit(1);
  }
}

testConnection();
