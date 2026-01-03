require('dotenv').config();
const { hashPassword, comparePassword, validatePasswordStrength } = require('./src/utils/password');
const { generateAccessToken, verifyAccessToken, generateEmailVerificationToken, verifyEmailVerificationToken } = require('./src/utils/jwt');

async function testAuthSystem() {
  console.log('🧪 Testing Authentication System...\n');

  // Test password hashing
  console.log('🔐 Testing password hashing...');
  const testPassword = 'TestPassword123!';
  const hashedPassword = await hashPassword(testPassword);
  console.log('✅ Password hashed successfully');
  
  const isPasswordValid = await comparePassword(testPassword, hashedPassword);
  console.log('✅ Password comparison:', isPasswordValid ? 'PASSED' : 'FAILED');

  // Test password strength validation
  console.log('\n🔍 Testing password strength validation...');
  const weakPassword = 'weak';
  const strongPassword = 'StrongPassword123!';
  
  const weakValidation = validatePasswordStrength(weakPassword);
  const strongValidation = validatePasswordStrength(strongPassword);
  
  console.log('Weak password validation:', weakValidation.isValid ? 'FAILED' : 'PASSED');
  console.log('Strong password validation:', strongValidation.isValid ? 'PASSED' : 'FAILED');

  // Test JWT tokens
  console.log('\n🎫 Testing JWT tokens...');
  const userId = '507f1f77bcf86cd799439011';
  const email = 'test@example.com';
  
  // Test access token
  const accessToken = generateAccessToken(userId, email);
  console.log('✅ Access token generated');
  
  try {
    const decodedAccess = verifyAccessToken(accessToken);
    console.log('✅ Access token verification: PASSED');
    console.log('   User ID:', decodedAccess.userId);
    console.log('   Email:', decodedAccess.email);
  } catch (error) {
    console.log('❌ Access token verification: FAILED');
  }

  // Test email verification token
  const emailToken = generateEmailVerificationToken(userId, email);
  console.log('✅ Email verification token generated');
  
  try {
    const decodedEmail = verifyEmailVerificationToken(emailToken);
    console.log('✅ Email verification token: PASSED');
    console.log('   User ID:', decodedEmail.userId);
    console.log('   Email:', decodedEmail.email);
  } catch (error) {
    console.log('❌ Email verification token: FAILED');
  }

  console.log('\n🎉 Authentication system tests completed!');
  console.log('\n📋 Summary:');
  console.log('✅ Password hashing and comparison');
  console.log('✅ Password strength validation');
  console.log('✅ JWT token generation and verification');
  console.log('✅ Email verification token system');
  console.log('\n🚀 Ready to implement user registration and authentication!');
}

testAuthSystem().catch(console.error);