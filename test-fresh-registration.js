require('dotenv').config();
const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

async function testFreshRegistration() {
  console.log('🧪 Testing Fresh User Registration with Email...\n');

  const timestamp = Date.now();
  const testUser = {
    name: 'Test User',
    email: `test.${timestamp}@example.com`,
    phone: `98765${timestamp.toString().slice(-5)}`, // Generate unique phone
    password: 'StrongPassword123!',
    confirmPassword: 'StrongPassword123!'
  };

  try {
    console.log('📝 Testing registration with fresh user...');
    console.log('Email:', testUser.email);
    console.log('Phone:', testUser.phone);

    const registerResponse = await axios.post(`${API_URL}/auth/register`, testUser);
    
    if (registerResponse.data.success) {
      console.log('✅ Registration successful!');
      console.log('   User ID:', registerResponse.data.data.userId);
      console.log('   Email:', registerResponse.data.data.email);
      console.log('   Email sent:', registerResponse.data.data.emailSent);
      console.log('   Message:', registerResponse.data.message);

      if (registerResponse.data.data.emailSent) {
        console.log('\n📧 EMAIL VERIFICATION:');
        console.log('✅ Verification email sent successfully!');
        console.log('📬 Check your inbox at:', testUser.email);
        console.log('📱 Check spam folder if not in inbox');
        console.log('🔗 Click the verification link in the email');
      } else {
        console.log('\n⚠️  Email sending failed, but registration succeeded');
      }

      // Test resend verification
      console.log('\n📧 Testing resend verification email...');
      try {
        const resendResponse = await axios.post(`${API_URL}/auth/resend-verification`, {
          email: testUser.email
        });
        
        if (resendResponse.data.success) {
          console.log('✅ Resend verification successful');
          console.log('   Message:', resendResponse.data.message);
        }
      } catch (error) {
        console.log('⚠️  Resend failed:', error.response?.data?.message);
      }

      console.log('\n🎯 NEXT STEPS:');
      console.log('1. Check email inbox for verification link');
      console.log('2. Click the verification link');
      console.log('3. You\'ll be automatically logged in');
      console.log('4. Access customer dashboard');
      
      console.log('\n🌐 OR TEST IN BROWSER:');
      console.log('1. Go to: http://localhost:3002/auth/register');
      console.log('2. Register with a real email address');
      console.log('3. Check your email for verification');
      console.log('4. Complete the flow!');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

testFreshRegistration();