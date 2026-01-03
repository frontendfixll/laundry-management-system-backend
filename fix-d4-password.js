const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
require('dotenv').config()

async function fixD4Password() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')

    const User = mongoose.connection.collection('users')
    
    const hashedPassword = await bcrypt.hash('password123', 12)
    
    const result = await User.updateOne(
      { email: 'd4@gmail.com' },
      { 
        $set: {
          password: hashedPassword,
          isActive: true,
          isEmailVerified: true
        }
      }
    )
    
    console.log('Updated:', result.modifiedCount, 'document(s)')
    
    const user = await User.findOne({ email: 'd4@gmail.com' })
    console.log('\n✅ Center Admin Credentials:')
    console.log('Email: d4@gmail.com')
    console.log('Password: password123')
    console.log('Role:', user.role)
    console.log('isActive:', user.isActive)

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await mongoose.disconnect()
  }
}

fixD4Password()
