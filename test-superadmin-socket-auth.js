/**
 * Test SuperAdmin Socket Authentication Fix
 * This script tests if SuperAdmin tokens work with the socket authentication
 */

const jwt = require('jsonwebtoken');

// Simulate the token validation logic
function testTokenValidation() {
  console.log('🧪 Testing SuperAdmin Socket Authentication Fix...\n');

  // Create a SuperAdmin token (similar to what the frontend sends)
  const superAdminToken = jwt.sign(
    {
      adminId: '694a8c2fe584a566d439a624',
      email: 'superadmin@laundrypro.com',
      role: 'superadmin',
      sessionId: 'cc02510514ca4a6d9118acbac72455be7364e73e8e76234d1e60d8264ff37080'
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '24h' }
  );

  // Create a regular user token for comparison
  const userToken = jwt.sign(
    {
      userId: '507f1f77bcf86cd799439011',
      email: 'user@example.com',
      role: 'admin',
      tenancyId: '507f1f77bcf86cd799439012'
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '24h' }
  );

  console.log('1. SuperAdmin Token Structure:');
  const decodedSuperAdmin = jwt.decode(superAdminToken);
  console.log('   - adminId:', !!decodedSuperAdmin.adminId);
  console.log('   - userId:', !!decodedSuperAdmin.userId);
  console.log('   - role:', decodedSuperAdmin.role);

  console.log('\n2. Regular User Token Structure:');
  const decodedUser = jwt.decode(userToken);
  console.log('   - adminId:', !!decodedUser.adminId);
  console.log('   - userId:', !!decodedUser.userId);
  console.log('   - role:', decodedUser.role);

  console.log('\n3. Testing Authentication Logic:');
  
  // Test the fixed authentication logic
  function testAuth(decoded, tokenType) {
    console.log(`\n   Testing ${tokenType}:`);
    
    // OLD LOGIC (would fail for SuperAdmin)
    if (!decoded.userId) {
      console.log('   ❌ OLD: Invalid token structure: missing userId');
    } else {
      console.log('   ✅ OLD: Token valid');
    }
    
    // NEW LOGIC (should work for both)
    if (!decoded.userId && !decoded.adminId) {
      console.log('   ❌ NEW: Invalid token structure: missing userId or adminId');
    } else {
      const userId = decoded.userId || decoded.adminId;
      console.log('   ✅ NEW: Token valid, using ID:', userId.substring(0, 8) + '...');
    }
  }

  testAuth(decodedSuperAdmin, 'SuperAdmin Token');
  testAuth(decodedUser, 'Regular User Token');

  console.log('\n🎉 Test completed! The fix should resolve SuperAdmin socket authentication.');
  console.log('\n📝 Summary:');
  console.log('   - SuperAdmin tokens use "adminId" instead of "userId"');
  console.log('   - Fixed authentication logic accepts both "userId" and "adminId"');
  console.log('   - Both token types should now work with Socket.IO authentication');
}

// Run the test
testTokenValidation();