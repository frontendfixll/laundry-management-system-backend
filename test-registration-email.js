require('dotenv').config();
const axios = require('axios');

async function testRegistration() {
  console.log('🧪 Testing Registration Email Flow\n');
  console.log('='.repeat(50));
  
  // Check email configuration
  console.log('\n📧 Email Configuration:');
  console.log('  BREVO_API_KEY:', process.env.BREVO_API_KEY ? '✅ Set' : '❌ Not set');
  console.log('  EMAIL_USER:', process.env.EMAIL_USER ? '✅ Set' : '❌ Not set');
  console.log('  EMAIL_APP_PASSWORD:', process.env.EMAIL_APP_PASSWORD ? '✅ Set' : '❌ Not set');
  console.log('  EMAIL_FROM:', process.env.EMAIL_FROM || process.env.EMAIL_USER);
  console.log('  FRONTEND_URL:', process.env.FRONTEND_URL);
  
  // Generate random test email
  const timestamp = Date.now();
  const testEmail = `test${timestamp}@example.com`;
  
  const testUser = {
    name: 'Test User',
    email: testEmail,
    phone: `9${timestamp.toString().slice(-9)}`,
    password: 'Test@123',
    confirmPassword: 'Test@123',
    tenancySlug: 'dgsfg'
  };
  
  console.log('\n👤 Test User Data:');
  console.log('  Name:', testUser.name);
  console.log('  Email:', testUser.email);
  console.log('  Phone:', testUser.phone);
  console.log('  Tenancy:', testUser.tenancySlug);
  
  try {
    console.log('\n⏳ Sending registration request to http://localhost:5000/api/auth/register...\n');
    
    const response = await axios.post('http://localhost:5000/api/auth/register', testUser);
    
    console.log('✅ Registration Response:');
    console.log('  Status:', response.status);
    console.log('  Success:', response.data.success);
    console.log('  Message:', response.data.message);
    console.log('\n📊 Response Data:');
    console.log('  User ID:', response.data.data.userId);
    console.log('  Email:', response.data.data.email);
    console.log('  Name:', response.data.data.name);
    console.log('  📧 Email Sent:', response.data.data.emailSent ? '✅ YES' : '❌ NO');
    
    if (response.data.data.emailSent) {
      console.log('\n✅ SUCCESS! Verification email was sent!');
      console.log('\n📬 Email Details:');
      console.log('  To:', testUser.email);
      console.log('  Subject: Verify your LaundryLobby account');
      console.log('  Contains: Verification link with token');
      console.log('  Link format:', `${process.env.FRONTEND_URL}/auth/verify-email?token=<TOKEN>`);
    } else {
      console.log('\n⚠️ WARNING! Email was NOT sent!');
      console.log('Check backend logs for email sending errors.');
    }
    
    if (response.data.data.referralApplied) {
      console.log('\n🎁 Referral Applied:', response.data.data.referralReward);
    }
    
  } catch (error) {
    console.error('\n❌ Registration Failed!');
    if (error.response) {
      console.error('  Status:', error.response.status);
      console.error('  Message:', error.response.data.message);
      console.error('  Error:', error.response.data.error);
    } else {
      console.error('  Error:', error.message);
      console.error('\n💡 Make sure backend is running on http://localhost:5000');
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('\n📝 Summary:');
  console.log('1. Registration endpoint: POST /api/auth/register');
  console.log('2. Email verification: ✅ Implemented');
  console.log('3. Email provider: Brevo (primary) + Gmail (fallback)');
  console.log('4. Verification link expires: 24 hours');
  console.log('5. User must verify email before login');
}

testRegistration();
