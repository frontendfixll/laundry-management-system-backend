const jwt = require('jsonwebtoken');
require('dotenv').config();

// Test JWT token decoding to understand the issue
function debugToken() {
  console.log('🔍 Debugging Sales Auth Issue...\n');
  
  console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);
  console.log('JWT_SECRET preview:', process.env.JWT_SECRET ? process.env.JWT_SECRET.substring(0, 10) + '...' : 'NOT SET');
  
  // Test token structure that should work for SuperAdmin
  const testPayload = {
    adminId: '507f1f77bcf86cd799439011', // Sample ObjectId
    email: 'admin@gmail.com',
    role: 'superadmin', // This should trigger isSuperAdmin flag
    sessionId: 'test-session-123',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
  };
  
  console.log('\n📋 Test Token Payload:');
  console.log(JSON.stringify(testPayload, null, 2));
  
  if (process.env.JWT_SECRET) {
    try {
      const testToken = jwt.sign(testPayload, process.env.JWT_SECRET);
      console.log('\n🔐 Generated Test Token:');
      console.log(testToken.substring(0, 50) + '...');
      
      // Decode it back
      const decoded = jwt.verify(testToken, process.env.JWT_SECRET);
      console.log('\n✅ Decoded Token:');
      console.log(JSON.stringify(decoded, null, 2));
      
      // Test the role checking logic
      const validRoles = ['sales_admin', 'center_admin', 'superadmin', 'auditor'];
      const isValidRole = validRoles.includes(decoded.role);
      console.log('\n🔍 Role Validation:');
      console.log('Role:', decoded.role);
      console.log('Valid roles:', validRoles);
      console.log('Is valid role:', isValidRole);
      
      // Test flag setting logic
      let userType, isSuperAdmin = false, isSalesAdmin = false, isAuditor = false;
      
      if (decoded.role === 'sales_admin') {
        userType = 'sales';
        isSalesAdmin = true;
      } else if (decoded.role === 'center_admin' || decoded.role === 'superadmin' || decoded.role === 'auditor') {
        userType = decoded.role === 'auditor' ? 'auditor' : 'superadmin';
        if (decoded.role === 'auditor') {
          isAuditor = true;
        } else {
          isSuperAdmin = true;
        }
      }
      
      console.log('\n🏷️ Flag Setting Results:');
      console.log('userType:', userType);
      console.log('isSuperAdmin:', isSuperAdmin);
      console.log('isSalesAdmin:', isSalesAdmin);
      console.log('isAuditor:', isAuditor);
      
      // Test permission check logic
      const module = 'upgrades';
      const action = 'view';
      
      console.log('\n🔐 Permission Check Simulation:');
      console.log(`Checking permission: ${module}.${action}`);
      
      if (isSuperAdmin || isAuditor) {
        console.log(`✅ Permission would be GRANTED to ${isAuditor ? 'Auditor' : 'SuperAdmin'}`);
      } else if (isSalesAdmin) {
        console.log('🔍 Would check sales user permissions...');
      } else {
        console.log('❌ Permission would be DENIED - no valid flags set');
      }
      
    } catch (error) {
      console.error('❌ Token generation/verification error:', error.message);
    }
  }
  
  console.log('\n🔍 Possible Issues to Check:');
  console.log('1. Token role field - should be "superadmin" not "center_admin"');
  console.log('2. JWT_SECRET mismatch between frontend and backend');
  console.log('3. Token expiration');
  console.log('4. Database user not found');
  console.log('5. User isActive flag set to false');
  
  console.log('\n📝 Next Steps:');
  console.log('1. Check actual token payload in browser dev tools');
  console.log('2. Verify JWT_SECRET in both frontend and backend .env files');
  console.log('3. Check SuperAdmin user in database');
  console.log('4. Enable backend logging to see exact error');
}

debugToken();