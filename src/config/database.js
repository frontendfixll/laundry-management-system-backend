const mongoose = require('mongoose');

// Global cache for Vercel serverless — reuse connection across warm invocations
let cached = global.mongooseCache;
if (!cached) {
  cached = global.mongooseCache = { conn: null, promise: null };
}

const connectDB = async () => {
  try {
    // Check if MongoDB URI is available
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    // For Vercel serverless, use more aggressive timeouts
    const isVercel = process.env.VERCEL || process.env.VERCEL_ENV || process.env.NODE_ENV === 'production';

    // Return cached connection if available (critical for Vercel warm instances)
    if (cached.conn) {
      return cached.conn;
    }

    // Check if already connected via mongoose state
    if (mongoose.connection.readyState === 1) {
      console.log('✅ MongoDB already connected');
      cached.conn = mongoose.connection;
      return mongoose.connection;
    }

    // If a connection is already in progress, wait for it
    if (cached.promise) {
      cached.conn = await cached.promise;
      return cached.conn;
    }

    // Don't disable buffering initially - let connection establish first
    console.log('🔄 Connecting to MongoDB...');
    console.log('🌍 Environment:', process.env.NODE_ENV);
    console.log('🚀 Platform:', isVercel ? 'Vercel Serverless' : 'Traditional Server');
    console.log('🔗 MongoDB URI exists:', !!process.env.MONGODB_URI);

    // Optimized connection options for serverless with longer timeouts for localhost
    const options = {
      serverSelectionTimeoutMS: isVercel ? 5000 : 60000, // Increased to 60s for localhost
      socketTimeoutMS: isVercel ? 45000 : 120000, // Increased to 120s for localhost
      connectTimeoutMS: isVercel ? 5000 : 60000, // Increased to 60s for localhost
      maxPoolSize: isVercel ? 5 : 10, // Keep connections warm in serverless
      minPoolSize: 0, // Allow 0 connections in serverless
      maxIdleTimeMS: isVercel ? 30000 : 60000,
      family: 4, // Use IPv4, skip trying IPv6
      retryWrites: true,
      w: 'majority',
      bufferCommands: false // Disable buffering from start
    };

    // Cache the promise so parallel calls don't create multiple connections
    cached.promise = mongoose.connect(process.env.MONGODB_URI, options);
    const conn = await cached.promise;
    cached.conn = conn;

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    console.log(`🔗 Connection State: ${conn.connection.readyState}`);

    // For serverless, buffering is already disabled in connection options
    if (isVercel) {
      console.log('🔧 Serverless mode: Buffering disabled in connection options');
    } else {
      // Only disable buffering AFTER successful connection for traditional servers
      mongoose.set('bufferCommands', false);
      console.log('🔧 Traditional server: Disabled mongoose buffering after successful connection');
    }

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
    // Reset cache on error so next request tries fresh
    cached.promise = null;
    cached.conn = null;

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