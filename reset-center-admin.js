require('dotenv').config()
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

async function resetCenterAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')

    const CenterAdmin = mongoose.connection.collection('centeradmins')
    
    // Hash new password
    const salt = await bcrypt.genSalt(12)
    const hashedPassword = await bcrypt.hash('Admin@123456', salt)
    
    // Update password
    const result = await CenterAdmin.updateOne(
      { email: 'admin@LaundryLobby.com' },
      { 
        $set: { 
          password: hashedPassword,
          isActive: true,
          loginAttempts: 0
        },
        $unset: { lockUntil: 1 }
      }
    )

    if (result.modifiedCount > 0) {
      console.log('✅ Center Admin password reset successfully!')
    } else {
      console.log('⚠️ No changes made - admin may not exist')
    }

    console.log('\n📋 Login Credentials:')
    console.log('URL: http://localhost:3002/auth/center-admin-login')
    console.log('Email: admin@LaundryLobby.com')
    console.log('Password: Admin@123456')

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await mongoose.disconnect()
    process.exit(0)
  }
}

resetCenterAdmin()
