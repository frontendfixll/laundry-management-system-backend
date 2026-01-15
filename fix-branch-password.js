require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User');

async function fixPassword() {
  try {
    console.log('🔧 Fixing Branch Manager Password...\n');

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const password = 'Branch@123456';
    
    // Hash directly with bcrypt
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    console.log('Generated hash:', hashedPassword);
    
    // Verify hash works
    const testMatch = await bcrypt.compare(password, hashedPassword);
    console.log('Test match before save:', testMatch);

    // Update directly in database
    const result = await User.updateOne(
      { email: 'branchmanager@LaundryLobby.com' },
      { $set: { password: hashedPassword } }
    );
    
    console.log('Update result:', result);

    // Verify from database
    const manager = await User.findOne({ email: 'branchmanager@LaundryLobby.com' }).select('+password');
    console.log('\nVerifying from DB:');
    console.log('- Stored hash:', manager.password);
    console.log('- Hashes match:', manager.password === hashedPassword);
    
    const finalMatch = await bcrypt.compare(password, manager.password);
    console.log('- Password compare:', finalMatch);

    console.log('\n========================================');
    console.log('🔐 LOGIN CREDENTIALS');
    console.log('========================================');
    console.log('Email:    branchmanager@LaundryLobby.com');
    console.log('Password: Branch@123456');
    console.log('========================================\n');

    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixPassword();
