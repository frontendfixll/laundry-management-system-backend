const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Check if MongoDB URI is available
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    // For Vercel serverless, use more aggressive timeouts
    const isVercel = process.env.VERCEL || process.env.VERCEL_ENV || process.env.NODE_ENV === 'production';
    
    // Don't disable buffering initially - let connection establish first
    console.log('🔄 Connecting to MongoDB...');
    console.log('🌍 Environment:', process.env.NODE_ENV);
    console.log('🚀 Platform:', isVercel ? 'Vercel Serverless' : 'Traditional Server');
    console.log('🔗 MongoDB URI exists:', !!process.env.MONGODB_URI);
    
    // Optimized connection options for serverless
    const options = {
      serverSelectionTimeoutMS: isVercel ? 5000 : 30000,
      socketTimeoutMS: isVercel ? 8000 : 60000,
      connectTimeoutMS: isVercel ? 5000 : 30000,
      maxPoolSize: isVercel ? 5 : 10,
      minPoolSize: 0, // Allow 0 connections in serverless
      maxIdleTimeMS: isVercel ? 10000 : 30000,
      family: 4, // Use IPv4, skip trying IPv6
      retryWrites: true,
      w: 'majority'
      // Removed deprecated bufferCommands and bufferMaxEntries from connection options
    };
    
    const conn = await mongoose.connect(process.env.MONGODB_URI, options);

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    console.log(`🔗 Connection State: ${conn.connection.readyState}`);
    
    // Only disable buffering AFTER successful connection
    mongoose.set('bufferCommands', false);
    // Note: bufferMaxEntries is deprecated in newer mongoose versions
    console.log('🔧 Disabled mongoose buffering after successful connection');
    
    // Handle connection events (only for non-serverless)
    if (!isVercel) {
      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err);
        // Re-enable buffering on error
        mongoose.set('bufferCommands', true);
      });

      mongoose.connection.on('disconnected', () => {
        console.log('⚠️ MongoDB disconnected');
        // Re-enable buffering on disconnect
        mongoose.set('bufferCommands', true);
      });

      mongoose.connection.on('reconnected', () => {
        console.log('🔄 MongoDB reconnected');
        // Disable buffering again on reconnect
        mongoose.set('bufferCommands', false);
        // Note: bufferMaxEntries is deprecated
      });
    }

    return conn;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    
    // More detailed error logging for cluster connections
    if (error.name === 'MongoServerSelectionError') {
      console.error('💡 Check your MongoDB Atlas cluster connection string and network access');
      console.error('💡 Add your IP to MongoDB Atlas whitelist or use 0.0.0.0/0 for development');
      console.error('💡 Verify cluster is running and accessible');
      console.error('💡 Connection string format: mongodb+srv://username:password@cluster.mongodb.net/database');
    }
    if (error.name === 'MongoParseError') {
      console.error('💡 Check your MongoDB connection string format');
      console.error('💡 Ensure special characters in password are URL encoded');
    }
    if (error.name === 'MongoNetworkTimeoutError') {
      console.error('💡 Network timeout - check your internet connection and MongoDB Atlas status');
    }
    if (error.name === 'MongooseServerSelectionError') {
      console.error('💡 Server selection timeout - MongoDB cluster might be down or unreachable');
    }
    
    // For production/Vercel, throw error to fail fast
    if (isVercel) {
      console.error('🚨 Serverless environment - failing fast on database error');
    }
    throw error;
  }
};

module.exports = connectDB;