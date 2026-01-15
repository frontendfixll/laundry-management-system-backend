/**
 * Quick Email Test Script
 * Tests if email sending is working in your local setup
 */

require('dotenv').config();
const { sendEmail } = require('./src/config/email');

async function testEmail() {
  console.log('\n🔍 Email Configuration Check:');
  console.log('================================');
  console.log('BREVO_API_KEY:', process.env.BREVO_API_KEY ? '✅ Set' : '❌ Not set');
  console.log('EMAIL_FROM:', process.env.EMAIL_FROM || 'Not set');
  console.log('EMAIL_USER:', process.env.EMAIL_USER || 'Not set');
  console.log('EMAIL_APP_PASSWORD:', process.env.EMAIL_APP_PASSWORD ? '✅ Set' : '❌ Not set');
  console.log('================================\n');

  // Test email - change this to your email to receive the test
  const testEmailAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;
  
  console.log(`📧 Sending test email to: ${testEmailAddress}`);
  
  try {
    const result = await sendEmail({
      to: testEmailAddress,
      subject: 'LaundryLobby - Email Test ✅',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #4CAF50;">✅ Email is Working!</h2>
          <p>This is a test email from your LaundryLobby local setup.</p>
          <p>Sent at: ${new Date().toLocaleString()}</p>
          <hr>
          <p style="color: #666; font-size: 12px;">
            If you received this email, your email configuration is correct.
          </p>
        </div>
      `
    });

    if (result.success) {
      console.log('\n✅ SUCCESS! Email sent successfully!');
      console.log('Message ID:', result.messageId);
      console.log('\n📬 Check your inbox at:', testEmailAddress);
    } else {
      console.log('\n❌ FAILED to send email');
      console.log('Error:', result.error);
    }
  } catch (error) {
    console.log('\n❌ ERROR sending email:');
    console.log(error.message);
  }

  process.exit(0);
}

testEmail();
