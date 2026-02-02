const mongoose = require('mongoose');

/**
 * Serverless-optimized database connection helper
 * Ensures connection is established before executing queries
 */
const ensureConnection = async () => {
  // If already connected, return immediately
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // If connecting, wait for connection
  if (mongoose.connection.readyState === 2) {
    return new Promise((resolve, reject) => {
      mongoose.connection.once('connected', () => resolve(mongoose.connection));
      mongoose.connection.once('error', reject);

      // Timeout after 5 seconds for serverless
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  }

  // If disconnected, attempt to connect
  console.log('🔄 Establishing MongoDB connection for serverless function...');
  const connectDB = require('../config/database');
  return await connectDB();
};

/**
 * Execute a database operation with connection check
 * @param {Function} operation - The database operation to execute
 * @param {Object} fallbackResult - Result to return if connection fails
 */
const withConnection = async (operation, fallbackResult = null) => {
  try {
    await ensureConnection();
    return await operation();
  } catch (error) {
    console.error('❌ Database operation failed:', error.message);
    console.error('❌ Error type:', error.name);

    // Log more details for debugging
    if (error.name === 'MongoServerSelectionError') {
      console.error('💡 Server selection failed - MongoDB cluster might be unreachable');
    } else if (error.name === 'MongoNetworkTimeoutError') {
      console.error('💡 Network timeout - check MongoDB Atlas status');
    } else if (error.name === 'MongoTimeoutError') {
      console.error('💡 Query timeout - operation took too long');
    }

    // Return fallback result for better UX
    if (fallbackResult !== null) {
      console.log('🔄 Returning fallback result due to database error');
      return fallbackResult;
    }

    // Re-throw with more specific error for better handling
    if (error.name === 'MongoTimeoutError' || error.message.includes('timeout')) {
      const timeoutError = new Error('Database connection timeout. Please try again later.');
      timeoutError.name = 'MongoTimeoutError';
      throw timeoutError;
    }

    if (error.name === 'MongoServerSelectionError' || error.name === 'MongoNetworkError') {
      const networkError = new Error('Database connection unavailable. Please try again later.');
      networkError.name = 'MongoNetworkError';
      throw networkError;
    }

    throw error;
  }
};

/**
 * Add query timeout for serverless environment
 * @param {Query} query - Mongoose query
 * @param {number} timeout - Timeout in milliseconds (default: 3000)
 */
const addTimeout = (query, timeout = 3000) => {
  const isVercel = process.env.VERCEL || process.env.VERCEL_ENV || process.env.NODE_ENV === 'production';
  if (isVercel) {
    return query.maxTimeMS(timeout);
  }
  return query;
};

/**
 * Test database connection with comprehensive diagnostics
 */
const testConnection = async () => {
  try {
    console.log('🧪 Testing database connection...');

    const startTime = Date.now();
    await ensureConnection();
    const connectionTime = Date.now() - startTime;

    console.log(`✅ Connection established in ${connectionTime}ms`);

    // Test a simple query
    const testStart = Date.now();
    const collections = await mongoose.connection.db.listCollections().toArray();
    const queryTime = Date.now() - testStart;

    console.log(`✅ Query test successful in ${queryTime}ms`);
    console.log(`📊 Found ${collections.length} collections`);

    return {
      success: true,
      connectionTime,
      queryTime,
      collectionsCount: collections.length
    };
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    return {
      success: false,
      error: error.message,
      errorType: error.name
    };
  }
};

module.exports = {
  ensureConnection,
  withConnection,
  addTimeout,
  testConnection
};