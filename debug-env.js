/**
 * Debug script to check environment variables
 * Run with: node debug-env.js
 */

require('dotenv').config();

console.log('🔍 Environment Variables Check:');
console.log('================================');

const requiredVars = [
  'MONGODB_URI',
  'JWT_SECRET',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_DATABASE_URL',
  'FIREBASE_PRIVATE_KEY'
];

let allPresent = true;

requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: ${varName === 'FIREBASE_PRIVATE_KEY' ? '[SET]' : value.substring(0, 20)}...`);
  } else {
    console.log(`❌ ${varName}: MISSING`);
    allPresent = false;
  }
});

console.log('================================');
console.log(allPresent ? '✅ All required variables present' : '❌ Some variables missing');
console.log('================================');

// Test MongoDB connection
if (process.env.MONGODB_URI) {
  const mongoose = require('mongoose');
  
  console.log('\n🔍 Testing MongoDB Connection...');
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('✅ MongoDB connected successfully');
      process.exit(0);
    })
    .catch(err => {
      console.log('❌ MongoDB connection failed:', err.message);
      process.exit(1);
    });
} else {
  console.log('\n❌ Cannot test MongoDB - MONGODB_URI not set');
  process.exit(1);
}
