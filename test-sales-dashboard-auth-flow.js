#!/usr/bin/env node

/**
 * Test Sales Dashboard Authentication Flow
 * 
 * This script tests the complete authentication flow for sales dashboard access
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');

const API_URL = 'http://localhost:5000/api';
const JWT_SECRET = '7f9a3d9c4e2b8f1a9c7d6e5f4a3b2c1d';

async function testAuthFlow() {
  console.log('🧪 Testing Sales Dashboard Authentication Flow\n');
  console.log('==============================================\n');

  // Test 1: SuperAdmin Login
  console.log('1️⃣ Testing SuperAdmin Login...');
  try {
    const superAdminLogin = await axios.post(`${API_URL}/superadmin/auth/login`, {
      email: 'superadmin@laundrypro.com',
      password: 'SuperAdmin@123'
    }, { 
      withCredentials: true,
      timeout: 10000
    });

    if (superAdminLogin.data.success) {
      console.log('✅ SuperAdmin login successful');
      const token = superAdminLogin.data.token;
      
      // Decode token to check structure
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('🔍 SuperAdmin Token Structure:', {
          adminId: decoded.adminId,
          email: decoded.email,
          role: decoded.role,
          hasSessionId: !!decoded.sessionId
        });
        
        // Test sales analytics endpoints
        await testSalesEndpoints(token, 'SuperAdmin');
        
      } catch (decodeError) {
        console.log('❌ Token decode error:', decodeError.message);
      }
    } else {
      console.log('❌ SuperAdmin login failed:', superAdminLogin.data.message);
    }
  } catch (error) {
    console.log('❌ SuperAdmin login error:', error.response?.data?.message || error.message);
  }

  console.log('\n' + '='.repeat(50) + '\n');

  // Test 2: Sales User Login
  console.log('2️⃣ Testing Sales User Login...');
  try {
    const salesLogin = await axios.post(`${API_URL}/sales/auth/login`, {
      email: 'virat@sales.com',
      password: 'sales123'
    }, { 
      withCredentials: true,
      timeout: 10000
    });

    if (salesLogin.data.success) {
      console.log('✅ Sales user login successful');
      const token = salesLogin.data.token || salesLogin.data.data?.token;
      
      if (token) {
        // Decode token to check structure
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          console.log('🔍 Sales Token Structure:', {
            salesUserId: decoded.salesUserId,
            email: decoded.email,
            role: decoded.role,
            hasSessionId: !!decoded.sessionId
          });
          
          // Test sales analytics endpoints
          await testSalesEndpoints(token, 'Sales User');
          
        } catch (decodeError) {
          console.log('❌ Token decode error:', decodeError.message);
        }
      } else {
        console.log('❌ No token in sales login response');
      }
    } else {
      console.log('❌ Sales user login failed:', salesLogin.data.message);
    }
  } catch (error) {
    console.log('❌ Sales user login error:', error.response?.data?.message || error.message);
  }
}

async function testSalesEndpoints(token, userType) {
  console.log(`\n🔍 Testing Sales Analytics Endpoints for ${userType}:`);
  
  const endpoints = [
    '/sales/analytics/dashboard-stats',
    '/sales/analytics/monthly-revenue',
    '/sales/analytics/expiring-trials'
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`  📊 Testing ${endpoint}...`);
      
      const response = await axios.get(`${API_URL}${endpoint}`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        withCredentials: true,
        timeout: 10000
      });
      
      if (response.data.success) {
        console.log(`  ✅ ${endpoint} - Success (${response.status})`);
        
        // Log data structure for dashboard-stats
        if (endpoint.includes('dashboard-stats') && response.data.data) {
          const data = response.data.data;
          console.log(`     📈 Data: leads=${data.leads?.total || 0}, revenue=${data.revenue?.total || 0}`);
        }
      } else {
        console.log(`  ❌ ${endpoint} - Failed: ${response.data.message}`);
      }
      
    } catch (error) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      console.log(`  ❌ ${endpoint} - Error (${status}): ${message}`);
      
      // Log detailed error for debugging
      if (status === 401) {
        console.log(`     🔐 Authentication failed - check token format`);
      } else if (status === 403) {
        console.log(`     🚫 Permission denied - check user permissions`);
      } else if (status === 500) {
        console.log(`     💥 Server error - check backend logs`);
      }
    }
  }
}

// Test backend connectivity first
async function testBackendConnectivity() {
  console.log('🔌 Testing Backend Connectivity...');
  try {
    const response = await axios.get(`${API_URL.replace('/api', '')}/health`, {
      timeout: 5000
    });
    console.log('✅ Backend is reachable');
    return true;
  } catch (error) {
    console.log('❌ Backend connectivity failed:', error.message);
    console.log('💡 Make sure backend is running on http://localhost:5000');
    return false;
  }
}

// Main execution
async function main() {
  console.log('🚀 Sales Dashboard Authentication Test\n');
  
  const isBackendReachable = await testBackendConnectivity();
  if (!isBackendReachable) {
    console.log('\n❌ Cannot proceed without backend connectivity');
    return;
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  await testAuthFlow();
  
  console.log('\n' + '='.repeat(50));
  console.log('\n📋 SUMMARY:');
  console.log('1. Check the test results above');
  console.log('2. Look for 401/403 errors in sales endpoints');
  console.log('3. Verify token structures match middleware expectations');
  console.log('4. Check backend console logs for detailed errors');
  console.log('\n💡 If tests fail, check:');
  console.log('   - Backend is running (npm run dev in backend folder)');
  console.log('   - Database connection is working');
  console.log('   - User credentials are correct');
  console.log('   - Middleware is properly configured');
}

main().catch(console.error);