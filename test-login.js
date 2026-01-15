const express = require('express')
const mongoose = require('mongoose')
const CenterAdmin = require('./src/models/CenterAdmin')
require('dotenv').config()

async function testLogin() {
  try {
    console.log('🔍 Testing Center Admin Login...')
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Find center admin
    const admin = await CenterAdmin.findOne({ email: 'admin@LaundryLobby.com' })
    if (!admin) {
      console.log('❌ Center admin not found!')
      return
    }

    console.log('✅ Center admin found:', admin.email)
    console.log('📊 Admin details:')
    console.log('  - Name:', admin.name)
    console.log('  - Email:', admin.email)
    console.log('  - Active:', admin.isActive)
    console.log('  - Role:', admin.role)
    console.log('  - Permissions:', admin.permissions)

    // Test password
    const isValidPassword = await admin.comparePassword('Admin@123456')
    console.log('🔑 Password test:', isValidPassword ? '✅ Valid' : '❌ Invalid')

    // Test API endpoint
    const app = require('./src/app.js')
    const request = require('supertest')
    
    console.log('\n🌐 Testing API endpoint...')
    const response = await request(app)
      .post('/api/center-admin/auth/login')
      .send({
        email: 'admin@LaundryLobby.com',
        password: 'Admin@123456'
      })

    console.log('📡 API Response Status:', response.status)
    console.log('📄 API Response Body:', response.body)

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Disconnected from MongoDB')
    process.exit(0)
  }
}

testLogin()