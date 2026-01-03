// Script to check and fix admin roles
require('dotenv').config()
const mongoose = require('mongoose')
const CenterAdmin = require('./src/models/CenterAdmin')

async function fixAdminRoles() {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB')

    // Find all admins
    const admins = await CenterAdmin.find({})
    console.log(`\nFound ${admins.length} admins:\n`)

    for (const admin of admins) {
      console.log(`- ${admin.email}`)
      console.log(`  Role: "${admin.role}"`)
      console.log(`  isActive: ${admin.isActive}`)
      
      // Check if role is valid
      const validRoles = ['center_admin', 'superadmin']
      if (!validRoles.includes(admin.role)) {
        console.log(`  ⚠️  Invalid role! Updating to 'center_admin'...`)
        admin.role = 'center_admin'
        await admin.save()
        console.log(`  ✅ Role updated to 'center_admin'`)
      } else {
        console.log(`  ✅ Role is valid`)
      }
      console.log('')
    }

    console.log('Done!')
    process.exit(0)
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

fixAdminRoles()
