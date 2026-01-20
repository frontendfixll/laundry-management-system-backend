const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    // Optimized connection options for both local and Vercel
    const options = {
      serverSelectionTimeoutMS: process.env.VERCEL ? 5000 : 30000,
      socketTimeoutMS: process.env.VERCEL ? 10000 : 60000,
      maxPoolSize: process.env.VERCEL ? 5 : 10,
      minPoolSize: 1,
      maxIdleTimeMS: process.env.VERCEL ? 10000 : 30000,
      // Remove unsupported options
      // bufferMaxEntries: 0, // This option is not supported
      // bufferCommands: false, // This causes issues with mongoose
      family: 4, // Use IPv4, skip trying IPv6
      retryWrites: true,
      w: 'majority'
    };

    console.log('🔄 Connecting to MongoDB...');
    console.log('🌍 Environment:', process.env.NODE_ENV);
    console.log('🚀 Platform:', process.env.VERCEL ? 'Vercel Serverless' : 'Traditional Server');
    
    const conn = await mongoose.connect(process.env.MONGODB_URI, options);

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    console.log(`🔗 Connection State: ${conn.connection.readyState}`);
    
    // Handle connection events (only for non-serverless)
    if (!process.env.VERCEL) {
      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        console.log('⚠️ MongoDB disconnected');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('🔄 MongoDB reconnected');
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
    }
    if (error.name === 'MongoParseError') {
      console.error('💡 Check your MongoDB connection string format');
    }
    if (error.name === 'MongoNetworkTimeoutError') {
      console.error('💡 Network timeout - check your internet connection and MongoDB Atlas status');
    }
    
    // For Vercel, don't throw error - continue without DB
    if (process.env.VERCEL) {
      console.warn('⚠️ Running in serverless mode without database connection');
      return null;
    }
    
    throw error;
  }
};

module.exports = connectDB;