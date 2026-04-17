const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// MongoDB connection string - update if needed
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://deepakfixl2_db_user:sgr7QHS46sn36eEs@cluster0.ugk4dbe.mongodb.net/laundry-management-system?retryWrites=true&w=majority';

// Define SalesUser schema
const salesUserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  phone: String,
  employeeId: String,
  designation: String,
  role: String,
  isActive: Boolean,
  permissions: Object,
  performance: Object,
}, { timestamps: true });

const SalesUser = mongoose.model('SalesUser', salesUserSchema);

async function resetPassword() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const email = 'virat@sales.com';
    const newPassword = 'sales123';

    console.log(`🔍 Finding user: ${email}`);
    const user = await SalesUser.findOne({ email });

    if (!user) {
      console.log('❌ User not found!');
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.name}`);
    console.log(`📧 Email: ${user.email}`);
    console.log(`💼 Designation: ${user.designation}\n`);

    // Hash the new password
    console.log('🔐 Hashing new password...');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the password
    user.password = hashedPassword;
    await user.save();

    console.log('✅ Password updated successfully!');
    console.log(`\n📝 New credentials:`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${newPassword}\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

resetPassword();
