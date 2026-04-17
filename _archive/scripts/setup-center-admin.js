const mongoose = require('mongoose')
const CenterAdmin = require('./src/models/CenterAdmin')
const AuditLog = require('./src/models/AuditLog')
require('dotenv').config({ path: __dirname + '/.env' })

async function setupCenterAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')

    // Check if center admin already exists
    const existingAdmin = await CenterAdmin.findOne({ role: 'center_admin' })
    if (existingAdmin) {
      console.log('Center admin already exists:', existingAdmin.email)
      process.exit(0)
    }

    // Create center admin
    const centerAdmin = new CenterAdmin({
      name: 'Center Admin',
      email: 'admin@LaundryLobby.com',
      password: 'Admin@123456', // This will be hashed automatically
      role: 'center_admin',
      permissions: {
        branches: true,
        users: true,
        orders: true,
        finances: true,
        analytics: true,
        settings: true
      },
      isActive: true
    })

    await centerAdmin.save()
    console.log('✅ Center admin created successfully!')
    console.log('📧 Email:', centerAdmin.email)
    console.log('🔑 Password: Admin@123456')
    console.log('⚠️  Please change the password after first login')

    // Log the creation
    await AuditLog.logAction({
      userId: centerAdmin._id,
      userType: 'system',
      userEmail: 'system@LaundryLobby.com',
      action: 'create_center_admin',
      category: 'system',
      description: 'Initial center admin account created',
      ipAddress: '127.0.0.1',
      status: 'success',
      riskLevel: 'low',
      metadata: {
        adminEmail: centerAdmin.email,
        setupScript: true
      }
    })

    console.log('📝 Setup logged in audit trail')
    
  } catch (error) {
    console.error('❌ Error setting up center admin:', error)
  } finally {
    await mongoose.disconnect()
    console.log('Disconnected from MongoDB')
    process.exit(0)
  }
}

setupCenterAdmin()