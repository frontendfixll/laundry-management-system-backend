/**
 * Email Service for LaundryLobby
 * Handles all email communications including welcome emails, notifications, etc.
 */

const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    // Configure email transporter based on environment
    if (process.env.EMAIL_SERVICE === 'gmail') {
      this.transporter = nodemailer.createTransporter({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      });
    } else if (process.env.EMAIL_SERVICE === 'smtp') {
      this.transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      });
    } else {
      // For development - log emails instead of sending
      console.log('📧 Email service not configured - emails will be logged only');
    }
  }

  /**
   * Send welcome email to new business owner
   */
  async sendBusinessWelcomeEmail(emailData) {
    const { 
      customerName, 
      customerEmail, 
      businessName, 
      subdomain, 
      tempPassword, 
      planName, 
      loginUrl 
    } = emailData;

    const subject = `🎉 Welcome to LaundryLobby - Your ${planName} account is ready!`;
    
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to LaundryLobby</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .credentials { background: #fff; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .features { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .feature-item { margin: 10px 0; padding: 10px; background: #f0f8ff; border-radius: 5px; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎉 Welcome to LaundryLobby!</h1>
                <p>Your ${planName} plan is now active</p>
            </div>
            
            <div class="content">
                <h2>Hello ${customerName}! 👋</h2>
                
                <p>Congratulations! Your LaundryLobby account for <strong>${businessName}</strong> has been successfully created and is ready to use.</p>
                
                <div class="credentials">
                    <h3>🔐 Your Login Credentials</h3>
                    <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
                    <p><strong>Username:</strong> ${customerEmail}</p>
                    <p><strong>Temporary Password:</strong> <code style="background: #f0f0f0; padding: 5px 10px; border-radius: 3px; font-family: monospace;">${tempPassword}</code></p>
                    
                    <p style="color: #e74c3c; font-size: 14px;">
                        ⚠️ <strong>Important:</strong> Please change your password after your first login for security.
                    </p>
                </div>
                
                <div style="text-align: center;">
                    <a href="${loginUrl}" class="button">🚀 Login to Your Dashboard</a>
                </div>
                
                <div class="features">
                    <h3>✨ What's included in your ${planName} plan:</h3>
                    <div class="feature-item">📊 Complete business dashboard</div>
                    <div class="feature-item">👥 Customer management system</div>
                    <div class="feature-item">📋 Order tracking and management</div>
                    <div class="feature-item">💰 Revenue and analytics</div>
                    <div class="feature-item">📱 Mobile-friendly interface</div>
                    <div class="feature-item">🔧 24/7 customer support</div>
                </div>
                
                <h3>🚀 Getting Started</h3>
                <ol>
                    <li>Click the login button above or visit your dashboard URL</li>
                    <li>Login with your email and temporary password</li>
                    <li>Change your password when prompted</li>
                    <li>Complete your business profile setup</li>
                    <li>Start managing your laundry business!</li>
                </ol>
                
                <h3>📞 Need Help?</h3>
                <p>Our support team is here to help you get started:</p>
                <ul>
                    <li>📧 Email: support@laundrylobby.com</li>
                    <li>💬 Live Chat: Available in your dashboard</li>
                    <li>📚 Help Center: <a href="https://help.laundrylobby.com">help.laundrylobby.com</a></li>
                </ul>
                
                <p>Thank you for choosing LaundryLobby! We're excited to help you grow your business. 🚀</p>
                
                <p>Best regards,<br>
                The LaundryLobby Team</p>
            </div>
            
            <div class="footer">
                <p>© 2026 LaundryLobby. All rights reserved.</p>
                <p>This email was sent to ${customerEmail}</p>
            </div>
        </div>
    </body>
    </html>
    `;

    const textContent = `
Welcome to LaundryLobby!

Hello ${customerName}!

Your LaundryLobby account for ${businessName} has been successfully created.

Login Details:
- URL: ${loginUrl}
- Username: ${customerEmail}
- Temporary Password: ${tempPassword}

Please change your password after your first login.

Visit your dashboard: ${loginUrl}

Need help? Contact us at support@laundrylobby.com

Best regards,
The LaundryLobby Team
    `;

    return this.sendEmail({
      to: customerEmail,
      subject,
      html: htmlContent,
      text: textContent
    });
  }

  /**
   * Send payment confirmation email
   */
  async sendPaymentConfirmationEmail(emailData) {
    const { customerEmail, customerName, businessName, amount, planName, transactionId } = emailData;

    const subject = `✅ Payment Confirmed - LaundryLobby ${planName} Plan`;
    
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Payment Confirmation</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .payment-details { background: #fff; padding: 20px; border-radius: 8px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>✅ Payment Confirmed!</h1>
            </div>
            
            <div class="content">
                <h2>Hello ${customerName}!</h2>
                
                <p>Your payment has been successfully processed. Your LaundryLobby account is being set up and you'll receive login credentials shortly.</p>
                
                <div class="payment-details">
                    <h3>Payment Details</h3>
                    <p><strong>Business:</strong> ${businessName}</p>
                    <p><strong>Plan:</strong> ${planName}</p>
                    <p><strong>Amount:</strong> ₹${amount}</p>
                    <p><strong>Transaction ID:</strong> ${transactionId}</p>
                    <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
                </div>
                
                <p>You'll receive another email with your login credentials within the next few minutes.</p>
                
                <p>Thank you for choosing LaundryLobby!</p>
            </div>
        </div>
    </body>
    </html>
    `;

    return this.sendEmail({
      to: customerEmail,
      subject,
      html: htmlContent
    });
  }

  /**
   * Generic email sending method
   */
  async sendEmail({ to, subject, html, text }) {
    try {
      if (!this.transporter) {
        // Log email for development
        console.log('📧 EMAIL WOULD BE SENT:');
        console.log('='.repeat(50));
        console.log(`To: ${to}`);
        console.log(`Subject: ${subject}`);
        console.log(`Content: ${text || 'HTML content'}`);
        console.log('='.repeat(50));
        return { success: true, message: 'Email logged (development mode)' };
      }

      const mailOptions = {
        from: `"LaundryLobby" <${process.env.EMAIL_FROM || 'noreply@laundrylobby.com'}>`,
        to,
        subject,
        html,
        text
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email sent successfully:', result.messageId);
      
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('❌ Email sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to admin about new signup
   */
  async sendAdminNotification(data) {
    const { businessName, customerEmail, planName, amount } = data;
    
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@laundrylobby.com';
    const subject = `🎉 New Customer Signup - ${businessName}`;
    
    const htmlContent = `
    <h2>New Customer Signup</h2>
    <p><strong>Business:</strong> ${businessName}</p>
    <p><strong>Email:</strong> ${customerEmail}</p>
    <p><strong>Plan:</strong> ${planName}</p>
    <p><strong>Amount:</strong> ₹${amount}</p>
    <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
    `;

    return this.sendEmail({
      to: adminEmail,
      subject,
      html: htmlContent
    });
  }
}

// Export singleton instance
module.exports = new EmailService();