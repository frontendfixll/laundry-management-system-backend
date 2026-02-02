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
      
      // Timeout after 5 seconds
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
    
    // Return fallback result for better UX
    if (fallbackResult !== null) {
      console.log('🔄 Returning fallback result due to database error');
      return fallbackResult;
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

module.exports = {
  ensureConnection,
  withConnection,
  addTimeout
};