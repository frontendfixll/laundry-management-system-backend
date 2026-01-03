// Script to fix admin password that was double-hashed
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('./src/models/User');

async function fixAdminPassword() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const email = 'pgkota406@gmail.com';
    const newPassword = 'deep2026';

    // Find the user
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log('User not found:', email);
      process.exit(1);
    }

    console.log('Found user:', user.name, user.email, user.role);

    // Update password directly (bypassing the pre-save hook by using updateOne)
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    await User.updateOne(
      { email },
      { $set: { password: hashedPassword } }
    );

    console.log('Password updated successfully!');
    console.log('You can now login with:');
    console.log('Email:', email);
    console.log('Password:', newPassword);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixAdminPassword();
