#!/usr/bin/env node

/**
 * Debug Sales Dashboard Authentication Issue
 * 
 * This script helps identify why SuperAdmin users can't access sales dashboard
 */

const jwt = require('jsonwebtoken');

// Test JWT token decoding
function testTokenDecoding() {
  console.log('🔍 Testing JWT Token Decoding...\n');
  
  // Sample tokens that might be used
  const JWT_SECRET = '7f9a3d9c4e2b8f1a9c7d6e5f4a3b2c1d'; // From .env
  
  // Create sample SuperAdmin token
  const superAdminPayload = {
    adminId: '507f1f77bcf86cd799439011',
    email: 'superadmin@laundrypro.com',
    role: 'superadmin',
    sessionId: 'sample-session-id'
  };
  
  const superAdminToken = jwt.sign(superAdminPayload, JWT_SECRET, { expiresIn: '7d' });
  console.log('📝 Sample SuperAdmin Token:', superAdminToken.substring(0, 50) + '...');
  
  // Create sample Sales token
  const salesPayload = {
    salesUserId: '507f1f77bcf86cd799439012',
    email: 'virat@sales.com',
    role: 'sales_admin',
    sessionId: 'sample-session-id'
  };
  
  const salesToken = jwt.sign(salesPayload, JWT_SECRET, { expiresIn: '7d' });
  console.log('📝 Sample Sales Token:', salesToken.substring(0, 50) + '...');
  
  // Test decoding
  try {
    const decodedSuperAdmin = jwt.verify(superAdminToken, JWT_SECRET);
    console.log('\n✅ SuperAdmin Token Decoded:', {
      adminId: decodedSuperAdmin.adminId,
      email: decodedSuperAdmin.email,
      role: decodedSuperAdmin.role
    });
  } catch (error) {
    console.log('❌ SuperAdmin Token Decode Error:', error.message);
  }
  
  try {
    const decodedSales = jwt.verify(salesToken, JWT_SECRET);
    console.log('✅ Sales Token Decoded:', {
      salesUserId: decodedSales.salesUserId,
      email: decodedSales.email,
      role: decodedSales.role
    });
  } catch (error) {
    console.log('❌ Sales Token Decode Error:', error.message);
  }
}

// Analyze middleware logic
function analyzeMiddlewareLogic() {
  console.log('\n🔍 Analyzing Middleware Logic...\n');
  
  console.log('📋 salesOrSuperAdminAuth.js middleware flow:');
  console.log('1. Gets token from request (cookie or header)');
  console.log('2. Verifies JWT token with JWT_SECRET');
  console.log('3. Checks if role is in validRoles: [sales_admin, center_admin, superadmin, auditor]');
  console.log('4. For SuperAdmin: Looks up user in SuperAdmin or CenterAdmin models');
  console.log('5. For Sales: Looks up user in SalesUser model');
  console.log('6. Sets appropriate flags: isSuperAdmin, isSalesAdmin, isAuditor');
  
  console.log('\n📋 requireSalesOrSuperAdminPermission logic:');
  console.log('1. SuperAdmin and Auditor get ALL permissions automatically');
  console.log('2. Sales users check specific permissions via hasPermission method');
  console.log('3. Permission format: module.action (e.g., analytics.view)');
  
  console.log('\n🎯 Potential Issues:');
  console.log('1. Token format mismatch (adminId vs salesUserId)');
  console.log('2. User not found in database');
  console.log('3. User account inactive');
  console.log('4. Permission check failing');
  console.log('5. Cookie not being sent properly');
}

// Check API endpoints
function checkAPIEndpoints() {
  console.log('\n🔍 Sales Dashboard API Endpoints...\n');
  
  const endpoints = [
    '/api/sales/analytics/dashboard-stats',
    '/api/sales/analytics/monthly-revenue',
    '/api/sales/analytics/expiring-trials'
  ];
  
  console.log('📋 Required endpoints for sales dashboard:');
  endpoints.forEach(endpoint => {
    console.log(`  - ${endpoint}`);
  });
  
  console.log('\n📋 Required permissions:');
  console.log('  - analytics.view (for dashboard-stats and monthly-revenue)');
  console.log('  - trials.view (for expiring-trials)');
}

// Provide debugging steps
function provideDebuggingSteps() {
  console.log('\n🔧 DEBUGGING STEPS:\n');
  
  console.log('1. 🌐 Frontend Debugging:');
  console.log('   - Open browser DevTools → Network tab');
  console.log('   - Login as SuperAdmin');
  console.log('   - Navigate to /sales-dashboard');
  console.log('   - Check API calls to /sales/analytics/*');
  console.log('   - Look for 401/403 errors');
  console.log('   - Check Authorization header in requests');
  
  console.log('\n2. 🔐 Token Debugging:');
  console.log('   - Check localStorage for token');
  console.log('   - Check cookies for sales_token or admin_token');
  console.log('   - Decode token at jwt.io to verify payload');
  
  console.log('\n3. 🖥️  Backend Debugging:');
  console.log('   - Check backend console logs');
  console.log('   - Look for authentication middleware logs');
  console.log('   - Check permission check logs');
  console.log('   - Verify user exists in database');
  
  console.log('\n4. 🧪 Test Cases:');
  console.log('   - Test SuperAdmin login → sales dashboard');
  console.log('   - Test Sales user login → sales dashboard');
  console.log('   - Test API calls directly with Postman');
  console.log('   - Check both cookie and header authentication');
}

// Provide solutions
function provideSolutions() {
  console.log('\n💡 POTENTIAL SOLUTIONS:\n');
  
  console.log('1. 🔧 Fix Token Format:');
  console.log('   - Ensure SuperAdmin tokens have adminId field');
  console.log('   - Ensure Sales tokens have salesUserId field');
  
  console.log('\n2. 🔧 Fix Database Lookup:');
  console.log('   - Verify SuperAdmin exists in SuperAdmin or CenterAdmin collection');
  console.log('   - Verify Sales user exists in SalesUser collection');
  console.log('   - Check user isActive status');
  
  console.log('\n3. 🔧 Fix Permissions:');
  console.log('   - Grant analytics.view permission to SuperAdmin');
  console.log('   - Grant analytics.view permission to Sales users');
  console.log('   - Grant trials.view permission for expiring trials');
  
  console.log('\n4. 🔧 Fix Cookie/Header Issues:');
  console.log('   - Check cookie domain and path settings');
  console.log('   - Verify CORS credentials: include');
  console.log('   - Check Authorization header format');
  
  console.log('\n5. 🔧 Fix Middleware Logic:');
  console.log('   - Add more detailed logging to middleware');
  console.log('   - Handle edge cases in user lookup');
  console.log('   - Improve error messages');
}

// Main execution
console.log('🚀 Sales Dashboard Authentication Debugger\n');
console.log('==========================================\n');

testTokenDecoding();
analyzeMiddlewareLogic();
checkAPIEndpoints();
provideDebuggingSteps();
provideSolutions();

console.log('\n✅ Debug analysis complete!');
console.log('\n📞 Next: Check browser DevTools and backend logs while testing login flows.');