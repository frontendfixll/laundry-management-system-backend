const mongoose = require('mongoose')
require('dotenv').config()

async function checkCenterAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')

    const User = mongoose.connection.collection('users')
    
    const centerAdmin = await User.findOne({ email: 'branch@laundrypro.com' })
    
    if (centerAdmin) {
      console.log('\n✅ Center Admin found:')
      console.log('Email:', centerAdmin.email)
      console.log('Role:', centerAdmin.role)
      console.log('isActive:', centerAdmin.isActive)
      console.log('isEmailVerified:', centerAdmin.isEmailVerified)
    } else {
      console.log('\n❌ Center Admin not found with email: branch@laundrypro.com')
      
      // Check all users with center_admin role
      const allCenterAdmins = await User.find({ role: 'center_admin' }).toArray()
      console.log('\nAll center_admin users:', allCenterAdmins.length)
      allCenterAdmins.forEach(u => {
        console.log(`- ${u.email} (active: ${u.isActive})`)
      })
    }

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await mongoose.disconnect()
  }
}

checkCenterAdmin()
