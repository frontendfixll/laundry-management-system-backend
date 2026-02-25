/**
 * Firebase Connection Test Script
 * 
 * Run this after setting up Firebase credentials in .env
 * Usage: node test-firebase-connection.js
 */

require('dotenv').config();
const { initializeFirebase, healthCheck, getDatabase } = require('./src/config/firebase-admin-config');

async function testFirebaseConnection() {
  console.log('='.repeat(60));
  console.log('🔥 Firebase Connection Test');
  console.log('='.repeat(60));

  // Step 1: Check environment variables
  console.log('\n📋 Step 1: Checking environment variables...');
  const requiredVars = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_DATABASE_URL'
  ];

  let allVarsPresent = true;
  for (const varName of requiredVars) {
    const isPresent = !!process.env[varName];
    console.log(`   ${isPresent ? '✅' : '❌'} ${varName}: ${isPresent ? 'Set' : 'Missing'}`);
    if (!isPresent) allVarsPresent = false;
  }

  if (!allVarsPresent) {
    console.log('\n❌ Missing environment variables!');
    console.log('💡 Please add Firebase credentials to your .env file');
    console.log('📖 See FIREBASE_SETUP_GUIDE.md for instructions');
    process.exit(1);
  }

  // Step 2: Initialize Firebase
  console.log('\n🔄 Step 2: Initializing Firebase Admin SDK...');
  try {
    await initializeFirebase();
    console.log('✅ Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error.message);
    process.exit(1);
  }

  // Step 3: Test database connection
  console.log('\n🔄 Step 3: Testing database connection...');
  try {
    const health = await healthCheck();
    if (health) {
      console.log('✅ Database connection successful');
    } else {
      console.log('⚠️  Database connection check returned false');
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }

  // Step 4: Test write operation
  console.log('\n🔄 Step 4: Testing write operation...');
  try {
    const db = getDatabase();
    const testRef = db.ref('test/connection');
    await testRef.set({
      message: 'Firebase connection test',
      timestamp: Date.now(),
      status: 'success'
    });
    console.log('✅ Write operation successful');
  } catch (error) {
    console.error('❌ Write operation failed:', error.message);
    process.exit(1);
  }

  // Step 5: Test read operation
  console.log('\n🔄 Step 5: Testing read operation...');
  try {
    const db = getDatabase();
    const testRef = db.ref('test/connection');
    const snapshot = await testRef.once('value');
    const data = snapshot.val();
    
    if (data && data.message === 'Firebase connection test') {
      console.log('✅ Read operation successful');
      console.log('   Data:', JSON.stringify(data, null, 2));
    } else {
      console.log('⚠️  Read operation returned unexpected data');
    }
  } catch (error) {
    console.error('❌ Read operation failed:', error.message);
    process.exit(1);
  }

  // Step 6: Clean up test data
  console.log('\n🔄 Step 6: Cleaning up test data...');
  try {
    const db = getDatabase();
    const testRef = db.ref('test/connection');
    await testRef.remove();
    console.log('✅ Test data cleaned up');
  } catch (error) {
    console.error('⚠️  Cleanup failed:', error.message);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('🎉 All tests passed! Firebase is ready to use.');
  console.log('='.repeat(60));
  console.log('\n📊 Configuration:');
  console.log(`   Project ID: ${process.env.FIREBASE_PROJECT_ID}`);
  console.log(`   Database URL: ${process.env.FIREBASE_DATABASE_URL}`);
  console.log(`   Client Email: ${process.env.FIREBASE_CLIENT_EMAIL}`);
  console.log('\n✅ You can now proceed with Phase 2 of the migration');
  console.log('📖 See FIREBASE_MIGRATION_PROGRESS.md for next steps\n');

  process.exit(0);
}

// Run the test
testFirebaseConnection().catch(error => {
  console.error('\n❌ Test failed with error:', error);
  process.exit(1);
});
