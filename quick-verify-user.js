require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

async function verifyUser(email) {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find and verify user
    const user = await User.findOneAndUpdate(
      { email: email },
      { isEmailVerified: true },
      { new: true }
    );

    if (user) {
      console.log(`✅ User ${email} has been verified manually!`);
      console.log(`User can now login at: http://localhost:3002/auth/login`);
    } else {
      console.log(`❌ User ${email} not found. Please register first.`);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.log('Usage: node quick-verify-user.js user@example.com');
  process.exit(1);
}

verifyUser(email);