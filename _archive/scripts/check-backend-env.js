const axios = require('axios');

async function checkBackendEnv() {
  console.log('🔍 Checking Production Backend Environment Variables\n');
  
  try {
    const response = await axios.get('https://laundrylobbybackend.vercel.app/api/health');
    
    console.log('✅ Backend Status:', response.data.message);
    console.log('📊 Environment:', response.data.environment);
    console.log('🔢 Version:', response.data.version);
    console.log('🚀 Platform:', response.data.platform);
    console.log('\n📧 Email Configuration Check:');
    console.log('  env_check:', JSON.stringify(response.data.env_check, null, 2));
    
    const envCheck = response.data.env_check;
    
    console.log('\n🔍 Detailed Check:');
    console.log('  MONGODB_URI:', envCheck.mongodb_uri ? '✅' : '❌');
    console.log('  JWT_SECRET:', envCheck.jwt_secret ? '✅' : '❌');
    console.log('  FRONTEND_URL:', envCheck.frontend_url ? '✅' : '❌');
    console.log('  BREVO_API_KEY:', envCheck.brevo_api_key ? '✅' : '❌');
    console.log('  EMAIL_USER:', envCheck.email_user ? '✅' : '❌');
    console.log('  EMAIL_APP_PASSWORD:', envCheck.email_app_password ? '✅' : '❌');
    
    console.log('\n📝 Missing Variables:');
    const missing = [];
    if (!envCheck.brevo_api_key) missing.push('BREVO_API_KEY');
    if (!envCheck.email_user) missing.push('EMAIL_USER');
    if (!envCheck.email_app_password) missing.push('EMAIL_APP_PASSWORD');
    
    if (missing.length > 0) {
      console.log('  ❌', missing.join(', '));
      console.log('\n💡 Action Required:');
      console.log('  1. Go to Vercel Dashboard');
      console.log('  2. Select backend project (laundrylobbybackend)');
      console.log('  3. Settings → Environment Variables');
      console.log('  4. Add missing variables');
      console.log('  5. Redeploy the project');
    } else {
      console.log('  ✅ All email variables are set!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkBackendEnv();
