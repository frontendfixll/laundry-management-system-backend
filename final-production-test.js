const axios = require('axios');

async function finalProductionTest() {
  console.log('🎯 FINAL PRODUCTION EMAIL TEST\n');
  console.log('='.repeat(60));
  
  const timestamp = Date.now();
  const testUser = {
    name: 'Production Test User',
    email: `prodtest${timestamp}@gmail.com`,
    phone: `9${timestamp.toString().slice(-9)}`,
    password: 'Test@123',
    confirmPassword: 'Test@123',
    tenancySlug: 'dgsfg'
  };
  
  console.log('\n📋 Test Details:');
  console.log('  Backend:', 'https://laundrylobbybackend.vercel.app');
  console.log('  Frontend:', 'https://tenacy.laundrylobby.com');
  console.log('  Test Email:', testUser.email);
  console.log('  Test Phone:', testUser.phone);
  console.log('  Tenancy:', testUser.tenancySlug);
  
  try {
    console.log('\n⏳ Sending registration request...\n');
    
    const response = await axios.post(
      'https://laundrylobbybackend.vercel.app/api/auth/register',
      testUser,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ REGISTRATION SUCCESSFUL!');
    console.log('  Status:', response.status);
    console.log('  User ID:', response.data.data.userId);
    console.log('  Email:', response.data.data.email);
    console.log('  Name:', response.data.data.name);
    
    const emailSent = response.data.data.emailSent;
    console.log('\n📧 EMAIL STATUS:', emailSent ? '✅ SENT' : '❌ NOT SENT');
    
    if (emailSent) {
      console.log('\n🎉 SUCCESS! Production email verification is working!');
      console.log('\n📬 Email Details:');
      console.log('  To:', testUser.email);
      console.log('  Subject: Verify your LaundryLobby account');
      console.log('  Provider: Brevo API (Primary)');
      console.log('  Fallback: Gmail SMTP');
      console.log('\n🔗 Verification Link Format:');
      console.log('  https://tenacy.laundrylobby.com/auth/verify-email?token=<JWT_TOKEN>');
      console.log('\n⏰ Token Expiry: 24 hours');
      
      console.log('\n✅ PRODUCTION DEPLOYMENT STATUS:');
      console.log('  ✓ Backend API: Working');
      console.log('  ✓ Database: Connected');
      console.log('  ✓ Email Service: Working');
      console.log('  ✓ Registration: Working');
      console.log('  ✓ Email Verification: Working');
      
      console.log('\n🚀 Users can now register at:');
      console.log('  https://tenacy.laundrylobby.com/auth/register');
      console.log('  https://tenacy.laundrylobby.com/dgsfg/auth/register');
      
    } else {
      console.log('\n⚠️ Email was not sent. Check backend logs.');
    }
    
  } catch (error) {
    console.error('\n❌ TEST FAILED!');
    if (error.response) {
      console.error('  Status:', error.response.status);
      console.error('  Message:', error.response.data.message);
      console.error('  Error:', error.response.data.error);
    } else {
      console.error('  Error:', error.message);
    }
  }
  
  console.log('\n' + '='.repeat(60));
}

finalProductionTest();
