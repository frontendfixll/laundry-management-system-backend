const jwt = require('jsonwebtoken');

// Test JWT token from SuperAdmin login
async function debugSuperAdminJWT() {
  try {
    console.log('🔍 Debugging SuperAdmin JWT Token...\n');

    // First, let's login and get the token
    const axios = require('axios');
    const API_URL = 'http://localhost:5000/api';

    const loginResponse = await axios.post(`${API_URL}/superadmin/auth/login`, {
      email: 'superadmin@laundrypro.com',
      password: 'SuperAdmin@123',
      rememberMe: false
    });

    if (!loginResponse.data.success) {
      console.error('❌ Login failed');
      return;
    }

    const token = loginResponse.data.token;
    console.log('✅ Login successful, got token');
    console.log('🔑 Token (first 50 chars):', token.substring(0, 50) + '...');

    // Decode the JWT token
    const decoded = jwt.decode(token);
    console.log('\n🔍 Decoded JWT Token:');
    console.log('   - adminId:', decoded.adminId);
    console.log('   - email:', decoded.email);
    console.log('   - role:', decoded.role);
    console.log('   - sessionId:', decoded.sessionId);
    console.log('   - rememberMe:', decoded.rememberMe);
    console.log('   - iat:', new Date(decoded.iat * 1000).toISOString());
    console.log('   - exp:', new Date(decoded.exp * 1000).toISOString());

    // Check if role is in valid roles for salesOrSuperAdminAuth
    const validRoles = ['sales_admin', 'center_admin', 'superadmin', 'auditor'];
    const isValidRole = validRoles.includes(decoded.role);
    
    console.log('\n🔍 Role Validation:');
    console.log('   - Valid roles:', validRoles);
    console.log('   - Current role:', decoded.role);
    console.log('   - Is valid?', isValidRole ? '✅ YES' : '❌ NO');

    // Test the sales API endpoint
    console.log('\n🧪 Testing Sales API endpoint...');
    try {
      const salesResponse = await axios.get(`${API_URL}/sales/analytics/dashboard-stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Sales API call successful');
      console.log('📊 Response status:', salesResponse.status);
    } catch (error) {
      console.log('❌ Sales API call failed');
      console.log('📄 Status:', error.response?.status);
      console.log('📄 Message:', error.response?.data?.message);
      console.log('📄 Full error:', error.response?.data);
    }

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }
}

// Run the debug
debugSuperAdminJWT();