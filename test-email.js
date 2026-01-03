require('dotenv').config();
const { verifyEmailConfig, sendEmail, emailTemplates } = require('./src/config/email');

async function testEmailService() {
  console.log('🧪 Testing email service configuration...\n');
  
  // Check environment variables
  console.log('📧 Email configuration:');
  console.log('EMAIL_USER:', process.env.EMAIL_USER || 'NOT SET');
  console.log('EMAIL_APP_PASSWORD:', process.env.EMAIL_APP_PASSWORD ? '***SET***' : 'NOT SET');
  console.log('FRONTEND_URL:', process.env.FRONTEND_URL || 'NOT SET');
  console.log('');

  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.log('❌ Email configuration incomplete. Please set EMAIL_USER and EMAIL_APP_PASSWORD in .env file');
    console.log('');
    console.log('📝 To set up Gmail SMTP:');
    console.log('1. Go to your Google Account settings');
    console.log('2. Enable 2-Factor Authentication');
    console.log('3. Generate an App Password for "Mail"');
    console.log('4. Update .env file with your email and app password');
    return;
  }

  // Test email configuration
  console.log('🔍 Verifying email configuration...');
  const isConfigValid = await verifyEmailConfig();
  
  if (!isConfigValid) {
    console.log('❌ Email configuration verification failed');
    return;
  }

  console.log('✅ Email configuration verified successfully!');
  console.log('');
  console.log('🎉 Email service is ready for use!');
  console.log('');
  console.log('📋 Next steps:');
  console.log('1. Start the server: npm run dev');
  console.log('2. Test user registration with email verification');
  console.log('3. Check your email for verification messages');
}

testEmailService().catch(console.error);