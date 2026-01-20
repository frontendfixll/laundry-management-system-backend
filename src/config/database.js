const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Enhanced connection options for production
    const options = {
      serverSelectionTimeoutMS: 30000, // Increase timeout for Vercel
      socketTimeoutMS: 60000,
      maxPoolSize: 10, // Maintain up to 10 socket connections
      minPoolSize: 2, // Maintain minimum 2 connections
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
      bufferMaxEntries: 0, // Disable mongoose buffering
      bufferCommands: false, // Disable mongoose buffering
      family: 4, // Use IPv4, skip trying IPv6
      retryWrites: true,
      w: 'majority'
    };

    console.log('🔄 Connecting to MongoDB...');
    console.log('🌍 Environment:', process.env.NODE_ENV);
    
    const conn = await mongoose.connect(process.env.MONGODB_URI, options);

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    console.log(`🔗 Connection State: ${conn.connection.readyState}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected');
    });

    return conn;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    
    // More detailed error logging for cluster connections
    if (error.name === 'MongoServerSelectionError') {
      console.error('💡 Check your MongoDB Atlas cluster connection string and network access');
      console.error('💡 Add your IP to MongoDB Atlas whitelist or use 0.0.0.0/0 for development');
      console.error('💡 Verify cluster is running and accessible');
    }
    if (error.name === 'MongoParseError') {
      console.error('💡 Check your MongoDB connection string format');
    }
    if (error.name === 'MongoNetworkTimeoutError') {
      console.error('💡 Network timeout - check your internet connection and MongoDB Atlas status');
    }
    
    throw error; // Don't exit, let the caller handle it
  }
};

module.exports = connectDB;