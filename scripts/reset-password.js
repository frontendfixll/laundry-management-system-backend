require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const email = process.argv[2] || 'wdev2039@gmail.com';
const newPassword = process.argv[3] || 'Test@123';

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  
  const result = await mongoose.connection.db.collection('users').updateOne(
    { email: email },
    { $set: { password: hashedPassword } }
  );
  
  console.log('Password reset for:', email);
  console.log('New password:', newPassword);
  console.log('Updated:', result.modifiedCount);
  
  await mongoose.disconnect();
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
