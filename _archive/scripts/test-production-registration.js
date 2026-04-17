const axios = require('axios');

async function testProductionRegistration() {
  console.log('🧪 Testing Production Registration Email\n');
  console.log('Backend: https://laundrylobbybackend.vercel.app');
  console.log('Email: workshop53738@gmail.com\n');
  
  const timestamp = Date.now();
  const testUser = {
    name: 'Production Test User',
    email: `prodtest${timestamp}@example.com`,
    phone: `9${timestamp.toString().slice(-9)}`,
    password: 'Test@123',
    confirmPassword: 'Test@123'
  };
  
  console.log('Test Email:', testUser.email);
  console.log('Test Phone:', testUser.phone);
  
  try {
    console.log('⏳ Sending registration request...\n');
    
    const response = await axios.post(
      'https://laundrylobbybackend.vercel.app/api/auth/register',
      testUser,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Response Status:', response.status);
    console.log('✅ Success:', response.data.success);
    console.log('📧 Email Sent:', response.data.data.emailSent ? '✅ YES' : '❌ NO');
    console.log('\nFull Response:', JSON.stringify(response.data, null, 2));
    
    if (!response.data.data.emailSent) {
      console.log('\n⚠️ EMAIL NOT SENT!');
      console.log('\n🔍 Possible Reasons:');
      console.log('1. BREVO_API_KEY not set in Vercel environment variables');
      console.log('2. EMAIL_USER not set in Vercel environment variables');
      console.log('3. EMAIL_APP_PASSWORD not set in Vercel environment variables');
      console.log('4. EMAIL_FROM not set in Vercel environment variables');
      console.log('\n💡 Solution: Add these to Vercel backend environment variables');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testProductionRegistration();
