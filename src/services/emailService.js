const nodemailer = require('nodemailer');

// Email service for sending upgrade notifications
class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  async sendUpgradePaymentLink(upgradeRequest, paymentLink) {
    const { tenancy, toPlan, pricing } = upgradeRequest;
    
    const emailTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
          .plan-comparison { display: flex; justify-content: space-between; margin: 20px 0; }
          .plan-box { background: white; padding: 20px; border-radius: 8px; flex: 1; margin: 0 10px; border: 2px solid #ddd; }
          .upgrade-box { border-color: #4CAF50; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚀 Plan Upgrade Available!</h1>
            <p>Your laundry management system is ready for an upgrade</p>
          </div>
          
          <div class="content">
            <h2>Hi ${tenancy.contactPerson?.name || 'there'},</h2>
            
            <p>Great news! Your <strong>${tenancy.name}</strong> account is eligible for a plan upgrade with special pricing.</p>
            
            <div class="plan-comparison">
              <div class="plan-box">
                <h3>Current Plan</h3>
                <p><strong>${upgradeRequest.fromPlan.displayName}</strong></p>
                <p>₹${upgradeRequest.fromPlan.price.monthly}/month</p>
              </div>
              <div class="plan-box upgrade-box">
                <h3>🎯 Upgrade To</h3>
                <p><strong>${toPlan.displayName}</strong></p>
                <p>₹${toPlan.price.monthly}/month</p>
                <p style="color: #4CAF50; font-weight: bold;">Save ₹${pricing.discount}!</p>
              </div>
            </div>
            
            <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #4CAF50;">
              <h3>💰 Upgrade Details</h3>
              <p><strong>Total Amount:</strong> ₹${pricing.customPrice}</p>
              <p><strong>Due Date:</strong> ${new Date(upgradeRequest.paymentTerms.dueDate).toLocaleDateString()}</p>
              ${pricing.discountReason ? `<p><strong>Special Offer:</strong> ${pricing.discountReason}</p>` : ''}
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${paymentLink}" class="button">💳 Pay Securely Now</a>
            </div>
            
            <div style="background: #e3f2fd; padding: 15px; border-radius: 8px;">
              <h4>🔒 Secure Payment Process</h4>
              <ul>
                <li>✅ Bank-level security encryption</li>
                <li>✅ Multiple payment methods available</li>
                <li>✅ Instant plan activation after payment</li>
                <li>✅ 24/7 customer support</li>
              </ul>
            </div>
            
            <p><strong>Questions?</strong> Reply to this email or contact your sales representative.</p>
            
            <p>Best regards,<br>
            <strong>LaundryPro Team</strong></p>
          </div>
          
          <div class="footer">
            <p>This is an automated message. Please do not reply to this email.</p>
            <p>If you have any questions, contact us at support@laundrypro.com</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"LaundryPro Upgrades" <${process.env.SMTP_USER}>`,
      to: tenancy.contactPerson?.email,
      subject: `🚀 Plan Upgrade Available - Save ₹${pricing.discount}!`,
      html: emailTemplate
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log('Upgrade email sent:', result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Email sending failed:', error);
      return { success: false, error: error.message };
    }
  }

  async sendCustomerUpgradeConfirmation(upgradeRequest) {
    const { tenancy } = upgradeRequest;
    
    const emailTemplate = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Upgrade Request Submitted!</h1>
            <p>We've received your upgrade request</p>
          </div>
          
          <div class="content">
            <h2>Hi ${tenancy.contactPerson?.name || 'there'},</h2>
            
            <p>Thank you for your upgrade request for <strong>${tenancy.name}</strong>.</p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #4CAF50;">
              <h3>📋 What happens next?</h3>
              <ol>
                <li>Our sales team will review your request within 24 hours</li>
                <li>You'll receive a secure payment link via email</li>
                <li>Complete payment to activate your upgrade</li>
                <li>Enjoy your new features immediately!</li>
              </ol>
            </div>
            
            <p>We'll keep you updated on the progress of your request.</p>
            
            <p>Best regards,<br>
            <strong>LaundryPro Team</strong></p>
          </div>
        </div>
      </body>
      </html>
    `;

    const mailOptions = {
      from: `"LaundryPro Support" <${process.env.SMTP_USER}>`,
      to: tenancy.contactPerson?.email,
      subject: '✅ Upgrade Request Received - LaundryPro',
      html: emailTemplate
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('Confirmation email failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();