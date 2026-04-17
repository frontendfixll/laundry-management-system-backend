const express = require('express')
const mongoose = require('mongoose')
const CenterAdmin = require('./src/models/CenterAdmin')
const jwt = require('jsonwebtoken')
require('dotenv').config()

const app = express()
app.use(express.json())

// Simple login endpoint for testing
app.post('/test-login', async (req, res) => {
  try {
    console.log('Login attempt:', req.body)
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI)
    
    const { email, password } = req.body
    
    // Find admin
    const admin = await CenterAdmin.findOne({ email })
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Admin not found' })
    }
    
    // Check password
    const isValidPassword = await admin.comparePassword(password)
    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'Invalid password' })
    }
    
    // Generate token
    const token = jwt.sign(
      {
        adminId: admin._id,
        email: admin.email,
        role: admin.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    )
    
    res.json({
      success: true,
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions
      }
    })
    
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ success: false, message: error.message })
  }
})

const PORT = 3003
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`)
})

// Test the login
setTimeout(async () => {
  try {
    const axios = require('axios')
    const response = await axios.post(`http://localhost:${PORT}/test-login`, {
      email: 'admin@LaundryLobby.com',
      password: 'Admin@123456'
    })
    
    console.log('✅ Test login successful!')
    console.log('Response:', response.data)
    process.exit(0)
  } catch (error) {
    console.log('❌ Test login failed!')
    console.log('Error:', error.response?.data || error.message)
    process.exit(1)
  }
}, 2000)