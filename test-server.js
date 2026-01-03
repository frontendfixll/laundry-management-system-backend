const axios = require('axios')

async function testServer() {
  try {
    console.log('Testing server endpoints...')
    
    // Test health endpoint
    try {
      const healthResponse = await axios.get('http://localhost:3002/health')
      console.log('✅ Health endpoint working:', healthResponse.data)
    } catch (error) {
      console.log('❌ Health endpoint failed:', error.response?.status, error.response?.data || error.message)
    }
    
    // Test center admin login endpoint
    try {
      const loginResponse = await axios.post('http://localhost:3002/api/center-admin/auth/login', {
        email: 'admin@laundrypro.com',
        password: 'Admin@123456'
      })
      console.log('✅ Login endpoint working:', loginResponse.status)
    } catch (error) {
      console.log('❌ Login endpoint failed:', error.response?.status, error.response?.data || error.message)
    }
    
    // Test if any endpoint works
    try {
      const response = await axios.get('http://localhost:3002/')
      console.log('✅ Root endpoint response:', response.status)
    } catch (error) {
      console.log('❌ Root endpoint failed:', error.response?.status, error.response?.data || error.message)
    }
    
  } catch (error) {
    console.error('Test failed:', error.message)
  }
}

testServer()