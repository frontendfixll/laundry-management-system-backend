const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/laundrylobby');

const SuperAdmin = require('./src/models/SuperAdmin');
const CenterAdmin = require('./src/models/CenterAdmin');

async function testLoginFlow() {
  try {
    console.log('🔍 Testing Login Flow...\n');
    
    // Test with available emails
    const testEmails = [
      'superadmin@laundrypro.com',
      'superadmin@LaundryLobby.com',
      'admin@laundrypro.com'
    ];
    
    for (const email of testEmails) {
      console.log(`\n🔐 Testing login for: ${email}`);
      
      // Try SuperAdmin first
      let user = await SuperAdmin.findOne({ email });
      let userType = 'SuperAdmin';
      
      if (!user) {
        // Try CenterAdmin
        user = await CenterAdmin.findOne({ email });
        userType = 'CenterAdmin';
      }
      
      if (user) {
        console.log(`✅ Found ${userType}: ${user.name}`);
        console.log(`   ID: ${user._id}`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Active: ${user.isActive}`);
        console.log(`   Has Password: ${!!user.password}`);
        
        // Test password (assuming common passwords)
        const testPasswords = ['admin123', 'password', '123456', 'admin'];
        
        for (const testPassword of testPasswords) {
          try {
            const isMatch = await bcrypt.compare(testPassword, user.password);
            if (isMatch) {
              console.log(`   🔑 Password match found: ${testPassword}`);
              
              // Generate token like the login endpoint would
              const tokenPayload = {
                adminId: user._id,
                email: user.email,
                role: user.role,
                sessionId: 'test-session-' + Date.now(),
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60)
              };
              
              const token = jwt.sign(tokenPayload, process.env.JWT_SECRET);
              console.log(`   🎫 Generated Token: ${token.substring(0, 50)}...`);
              
              // Test token verification
              const decoded = jwt.verify(token, process.env.JWT_SECRET);
              console.log(`   ✅ Token verified successfully`);
              console.log(`   📋 Token payload:`, {
                adminId: decoded.adminId,
                email: decoded.email,
                role: decoded.role
              });
              
              // Test the auth middleware logic
              const validRoles = ['sales_admin', 'center_admin', 'superadmin', 'auditor'];
              const isValidRole = validRoles.includes(decoded.role);
              console.log(`   🏷️ Role validation: ${isValidRole ? 'PASS' : 'FAIL'}`);
              
              if (isValidRole) {
                let isSuperAdmin = false, isSalesAdmin = false, isAuditor = false;
                
                if (decoded.role === 'sales_admin') {
                  isSalesAdmin = true;
                } else if (decoded.role === 'center_admin' || decoded.role === 'superadmin' || decoded.role === 'auditor') {
                  if (decoded.role === 'auditor') {
                    isAuditor = true;
                  } else {
                    isSuperAdmin = true;
                  }
                }
                
                console.log(`   🚩 Flags: isSuperAdmin=${isSuperAdmin}, isSalesAdmin=${isSalesAdmin}, isAuditor=${isAuditor}`);
                
                // Test permission check
                if (isSuperAdmin || isAuditor) {
                  console.log(`   ✅ Would have access to sales routes`);
                } else {
                  console.log(`   ❌ Would NOT have access to sales routes`);
                }
              }
              
              break; // Found working password
            }
          } catch (error) {
            // Password comparison failed, continue
          }
        }
      } else {
        console.log(`❌ No user found with email: ${email}`);
      }
    }
    
    console.log('\n📝 Recommendations:');
    console.log('1. Use one of the existing emails for login');
    console.log('2. Check if the frontend is using the correct login endpoint');
    console.log('3. Verify the JWT_SECRET matches between frontend and backend');
    console.log('4. Check browser network tab for actual request/response');
    
  } catch (error) {
    console.error('❌ Error testing login flow:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the test
testLoginFlow();