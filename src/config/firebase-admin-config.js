/**
 * Firebase Admin SDK Configuration
 * 
 * This module initializes Firebase Admin SDK for server-side operations
 * Used for: Real-time Database, Cloud Functions, Authentication
 */

const admin = require('firebase-admin');

let firebaseApp = null;
let database = null;

/**
 * Initialize Firebase Admin SDK
 * @returns {Object} Firebase Admin App instance
 */
const initializeFirebase = () => {
  if (firebaseApp) {
    console.log('✅ Firebase Admin already initialized');
    return firebaseApp;
  }

  try {
    // Check required environment variables
    const requiredEnvVars = [
      'FIREBASE_PROJECT_ID',
      'FIREBASE_PRIVATE_KEY',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_DATABASE_URL'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      throw new Error(`Missing Firebase environment variables: ${missingVars.join(', ')}`);
    }

    // Parse private key (handle escaped newlines)
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

    // Initialize Firebase Admin
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: privateKey,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
      databaseURL: process.env.FIREBASE_DATABASE_URL,
    });

    // Get database reference
    database = admin.database();

    console.log('✅ Firebase Admin SDK initialized successfully');
    console.log(`📊 Project: ${process.env.FIREBASE_PROJECT_ID}`);
    console.log(`🔗 Database: ${process.env.FIREBASE_DATABASE_URL}`);

    return firebaseApp;
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error.message);
    throw error;
  }
};

/**
 * Get Firebase Admin App instance
 * @returns {Object} Firebase Admin App
 */
const getFirebaseApp = () => {
  if (!firebaseApp) {
    return initializeFirebase();
  }
  return firebaseApp;
};

/**
 * Get Firebase Realtime Database instance
 * @returns {Object} Firebase Database
 */
const getDatabase = () => {
  if (!database) {
    initializeFirebase();
  }
  return database;
};

/**
 * Get reference to a specific path in database
 * @param {string} path - Database path
 * @returns {Object} Database reference
 */
const getRef = (path) => {
  const db = getDatabase();
  return db.ref(path);
};

/**
 * Health check for Firebase connection
 * @returns {Promise<boolean>}
 */
const healthCheck = async () => {
  try {
    const db = getDatabase();
    const testRef = db.ref('.info/connected');
    const snapshot = await testRef.once('value');
    return snapshot.val() === true;
  } catch (error) {
    console.error('❌ Firebase health check failed:', error.message);
    return false;
  }
};

module.exports = {
  initializeFirebase,
  getFirebaseApp,
  getDatabase,
  getRef,
  healthCheck,
  admin, // Export admin for direct access if needed
};
