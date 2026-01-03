const mongoose = require('mongoose')
require('dotenv').config()

async function fixCenterAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')

    const User = mongoose.connection.collection('users')
    
    // Update the center admin
    const result = await User.updateOne(
      { email: 'branch@laundrypro.com' },
      { 
        $set: { 
          role: 'center_admin',
          isEmailVerified: true,
          isActive: true
        } 
      }
    )
    
    console.log('Updated:', result.modifiedCount, 'document(s)')
    
    // Verify
    const updated = await User.findOne({ email: 'branch@laundrypro.com' })
    console.log('\n✅ Center Admin updated:')
    console.log('Email:', updated.email)
    console.log('Role:', updated.role)
    console.log('isActive:', updated.isActive)
    console.log('isEmailVerified:', updated.isEmailVerified)

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await mongoose.disconnect()
  }
}

fixCenterAdmin()
