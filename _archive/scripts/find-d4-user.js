const mongoose = require('mongoose')
require('dotenv').config()

async function findD4User() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')

    const User = mongoose.connection.collection('users')
    
    // Find users with d4 in email
    const users = await User.find({ email: { $regex: 'd4', $options: 'i' } }).toArray()
    
    console.log('\nUsers with d4 in email:')
    users.forEach(u => {
      console.log(`- ${u.email} | Role: ${u.role} | Active: ${u.isActive}`)
    })

    // Also show all center_admin users
    const centerAdmins = await User.find({ role: 'center_admin' }).toArray()
    console.log('\nAll center_admin users:')
    centerAdmins.forEach(u => {
      console.log(`- ${u.email} | Active: ${u.isActive} | Verified: ${u.isEmailVerified}`)
    })

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await mongoose.disconnect()
  }
}

findD4User()
