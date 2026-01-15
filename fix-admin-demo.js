const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
require('dotenv').config()

async function fixAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')

    const User = mongoose.connection.collection('users')
    
    // Check if admin exists
    const admin = await User.findOne({ email: 'admin@LaundryLobby.com' })
    
    if (admin) {
      console.log('Admin found, updating password and settings...')
      const hashedPassword = await bcrypt.hash('admin123', 12)
      await User.updateOne(
        { email: 'admin@LaundryLobby.com' },
        { 
          $set: {
            password: hashedPassword,
            role: 'admin',
            isActive: true,
            isEmailVerified: true
          }
        }
      )
      console.log('✅ Admin updated!')
    } else {
      console.log('Creating new admin...')
      const hashedPassword = await bcrypt.hash('admin123', 12)
      
      await User.insertOne({
        name: 'Admin User',
        email: 'admin@LaundryLobby.com',
        password: hashedPassword,
        phone: '9999999998',
        role: 'admin',
        isActive: true,
        isEmailVerified: true,
        permissions: {
          orders: true,
          customers: true,
          staff: true,
          inventory: true,
          reports: true,
          settings: true
        },
        createdAt: new Date(),
        updatedAt: new Date()
      })
      console.log('✅ Admin created!')
    }

    // Verify
    const updated = await User.findOne({ email: 'admin@LaundryLobby.com' })
    console.log('\n📧 Admin Credentials:')
    console.log('Email:', updated.email)
    console.log('Password: admin123')
    console.log('Role:', updated.role)
    console.log('isActive:', updated.isActive)
    console.log('isEmailVerified:', updated.isEmailVerified)

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await mongoose.disconnect()
  }
}

fixAdmin()
