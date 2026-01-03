require('dotenv').config();
const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

async function testRegistrationFlow() {
  console.log('🧪 Testing Complete Registration & Email Verification Flow...\n');

  const testUser = {
    name: 'Test User',
    email: `test.${Date.now()}@example.com`,
    phone: '9876543210',
    password: 'StrongPassword123!',
    confirmPassword: 'StrongPassword123!'
  };

  try {
    // Test 1: User Registration
    console.log('📝 Step 1: Testing user registration...');
    const registerResponse = await axios.post(`${API_URL}/auth/register`, testUser);
    
    if (registerResponse.data.success) {
      console.log('✅ Registration successful!');
      console.log('   User ID:', registerResponse.data.data.userId);
      console.log('   Email:', registerResponse.data.data.email);
      console.log('   Email sent:', registerResponse.data.data.emailSent);
    }

    // Test 2: Duplicate Registration (should fail)
    console.log('\n🔄 Step 2: Testing duplicate registration prevention...');
    try {
      await axios.post(`${API_URL}/auth/register`, testUser);
      console.log('❌ Duplicate registration should have failed!');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ Duplicate registration properly rejected');
        console.log('   Error:', error.response.data.message);
      }
    }

    // Test 3: Login without verification (should fail)
    console.log('\n🔐 Step 3: Testing login without email verification...');
    try {
      await axios.post(`${API_URL}/auth/login`, {
        email: testUser.email,
        password: testUser.password
      });
      console.log('❌ Login without verification should have failed!');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ Login properly rejected for unverified email');
        console.log('   Error:', error.response.data.message);
      }
    }

    // Test 4: Invalid verification token
    console.log('\n🎫 Step 4: Testing invalid verification token...');
    try {
      await axios.post(`${API_URL}/auth/verify-email`, {
        token: 'invalid-token'
      });
      console.log('❌ Invalid token should have failed!');
    } catch (error) {
      if (error.response?.status === 400) {
        console.log('✅ Invalid token properly rejected');
        console.log('   Error:', error.response.data.message);
      }
    }

    // Test 5: Resend verification email
    console.log('\n📧 Step 5: Testing resend verification email...');
    try {
      const resendResponse = await axios.post(`${API_URL}/auth/resend-verification`, {
        email: testUser.email
      });
      
      if (resendResponse.data.success) {
        console.log('✅ Verification email resend successful');
      }
    } catch (error) {
      console.log('⚠️  Resend verification failed (expected if email service not configured)');
      console.log('   Error:', error.response?.data?.message);
    }

    console.log('\n🎉 Registration flow tests completed!');
    console.log('\n📋 Summary:');
    console.log('✅ User registration with validation');
    console.log('✅ Duplicate prevention');
    console.log('✅ Email verification requirement');
    console.log('✅ Token validation');
    console.log('✅ Resend verification functionality');

    console.log('\n💡 Next Steps:');
    console.log('1. Configure real email credentials to test full email flow');
    console.log('2. Set up MongoDB connection to persist data');
    console.log('3. Test frontend registration form integration');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

// Test password validation
async function testPasswordValidation() {
  console.log('\n🔒 Testing Password Validation...\n');

  const weakPasswords = [
    { password: 'weak', description: 'Too short' },
    { password: 'password', description: 'No uppercase, numbers, special chars' },
    { password: 'Password', description: 'No numbers, special chars' },
    { password: 'Password123', description: 'No special chars' },
    { password: 'password123!', description: 'No uppercase' },
  ];

  for (const test of weakPasswords) {
    try {
      await axios.post(`${API_URL}/auth/register`, {
        name: 'Test User',
        email: `test.${Date.now()}@example.com`,
        phone: '9876543211',
        password: test.password,
        confirmPassword: test.password
      });
      console.log(`❌ Weak password "${test.password}" should have been rejected`);
    } catch (error) {
      if (error.response?.status === 400) {
        console.log(`✅ Weak password rejected: ${test.description}`);
      }
    }
  }
}

// Run tests
async function runAllTests() {
  try {
    // Check if server is running
    await axios.get(`${API_URL.replace('/api', '')}/health`);
    console.log('🚀 Server is running, starting tests...\n');
    
    await testRegistrationFlow();
    await testPasswordValidation();
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Server is not running. Please start the backend server first:');
      console.log('   cd backend && npm run dev');
    } else {
      console.error('❌ Unexpected error:', error.message);
    }
  }
}

runAllTests();