// Firebase Admin SDK wrapper — used only by the customer-app auth flow to
// verify phone-OTP-derived Firebase ID tokens. Lazy-initialized so existing
// deployments without Firebase service-account env vars don't crash on boot.

const admin = require('firebase-admin');

let initialized = false;
let initError = null;

function initFirebase() {
  if (initialized || initError) return;

  try {
    // Prefer FIREBASE_SERVICE_ACCOUNT_JSON (entire JSON inline, useful on Vercel)
    // Fall back to individual env vars
    let credential;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const json = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      credential = admin.credential.cert(json);
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      credential = admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Vercel env vars escape newlines as \\n
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      });
    } else {
      throw new Error(
        'Firebase credentials missing — set FIREBASE_SERVICE_ACCOUNT_JSON ' +
        'or (FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)'
      );
    }

    admin.initializeApp({ credential });
    initialized = true;
    console.log('✅ Firebase Admin SDK initialized for customer-app auth');
  } catch (err) {
    initError = err;
    console.error('❌ Firebase Admin SDK init failed:', err.message);
  }
}

// Verify a Firebase ID token (typically obtained after phone-OTP on the client).
// Returns the decoded token: { uid, phone_number, email?, ... }
async function verifyIdToken(idToken) {
  initFirebase();
  if (initError) throw initError;
  if (!initialized) throw new Error('Firebase Admin not initialized');
  return admin.auth().verifyIdToken(idToken);
}

module.exports = { verifyIdToken };
