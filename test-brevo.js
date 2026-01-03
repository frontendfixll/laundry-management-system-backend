require('dotenv').config();
const { sendEmail, verifyEmailConfig } = require('./src/config/email');

const testBrevoEmail = async () => {
  console.log('🧪 Testing Brevo Email...\n');
  
  // Check config
  console.log('BREVO_API_KEY:', process.env.BREVO_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('EMAIL_FROM:', process.env.EMAIL_FROM || '❌ Missing');
  console.log('');

  // Verify config
  const isConfigured = await verifyEmailConfig();
  if (!isConfigured) {
    console.log('❌ Email not configured properly');
    return;
  }

  // Send test email
  const testEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  console.log(`📧 Sending test email to: ${testEmail}\n`);
  
  const startTime = Date.now();
  
  const result = await sendEmail({
    to: testEmail,
    subject: '🧪 Brevo Test - LaundryPro',
    html: `
      <div style="font-family: Arial; padding: 20px; text-align: center;">
        <h1 style="color: #14b8a6;">✅ Brevo Working!</h1>
        <p>Email sent at: ${new Date().toLocaleString()}</p>
        <p style="color: #6b7280;">This confirms your Brevo integration is working.</p>
      </div>
    `
  });

  const timeTaken = Date.now() - startTime;
  
  console.log('');
  if (result.success) {
    console.log(`✅ Email sent successfully!`);
    console.log(`⏱️  Time taken: ${timeTaken}ms`);
    console.log(`📬 Check inbox: ${testEmail}`);
  } else {
    console.log('❌ Failed:', result.error);
  }
};

testBrevoEmail();
