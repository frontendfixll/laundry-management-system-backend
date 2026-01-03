const SibApiV3Sdk = require('@getbrevo/brevo');
const nodemailer = require('nodemailer');

// ============================================
// BREVO (PRIMARY) + GMAIL (FALLBACK) EMAIL CONFIG
// ============================================

// Brevo API Client Setup
let brevoClient = null;
const getBrevoClient = () => {
  if (brevoClient) return brevoClient;
  
  brevoClient = new SibApiV3Sdk.TransactionalEmailsApi();
  brevoClient.setApiKey(
    SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey,
    process.env.BREVO_API_KEY
  );
  return brevoClient;
};

// Gmail Fallback Transporter (if Brevo fails)
let gmailTransporter = null;
const getGmailTransporter = () => {
  if (gmailTransporter) return gmailTransporter;
  
  gmailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD
    },
    pool: true,
    maxConnections: 3
  });
  return gmailTransporter;
};

// ============================================
// SEND EMAIL VIA BREVO (FAST!)
// ============================================

const sendViaBrevo = async (emailOptions) => {
  const api = getBrevoClient();
  
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  sendSmtpEmail.sender = { 
    email: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    name: 'LaundryPro'
  };
  sendSmtpEmail.to = [{ email: emailOptions.to }];
  sendSmtpEmail.subject = emailOptions.subject;
  sendSmtpEmail.htmlContent = emailOptions.html;
  
  const result = await api.sendTransacEmail(sendSmtpEmail);
  return { success: true, messageId: result.messageId };
};

// ============================================
// SEND EMAIL VIA GMAIL (FALLBACK)
// ============================================

const sendViaGmail = async (emailOptions) => {
  const transporter = getGmailTransporter();
  const result = await transporter.sendMail(emailOptions);
  return { success: true, messageId: result.messageId };
};

// ============================================
// MAIN SEND EMAIL FUNCTION (BREVO FIRST, GMAIL FALLBACK)
// ============================================

const sendEmail = async (emailOptions) => {
  // Try Brevo first (faster)
  if (process.env.BREVO_API_KEY) {
    try {
      const result = await sendViaBrevo(emailOptions);
      console.log('✅ Email sent via Brevo:', result.messageId);
      return result;
    } catch (error) {
      console.log('⚠️ Brevo failed, trying Gmail:', error.message);
    }
  }
  
  // Fallback to Gmail
  if (process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) {
    try {
      const result = await sendViaGmail(emailOptions);
      console.log('✅ Email sent via Gmail:', result.messageId);
      return result;
    } catch (error) {
      console.error('❌ Gmail also failed:', error.message);
      return { success: false, error: error.message };
    }
  }
  
  return { success: false, error: 'No email provider configured' };
};

// ============================================
// FIRE-AND-FORGET (NON-BLOCKING)
// ============================================

const sendEmailAsync = (emailOptions) => {
  setImmediate(async () => {
    try {
      await sendEmail(emailOptions);
    } catch (error) {
      console.error('❌ Async email failed:', error.message);
    }
  });
  return { success: true, message: 'Email queued' };
};

// ============================================
// VERIFY CONFIG
// ============================================

const verifyEmailConfig = async () => {
  if (process.env.BREVO_API_KEY) {
    console.log('✅ Brevo API configured');
    return true;
  }
  if (process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) {
    try {
      const transporter = getGmailTransporter();
      await transporter.verify();
      console.log('✅ Gmail SMTP configured');
      return true;
    } catch (error) {
      console.error('❌ Gmail verification failed:', error);
      return false;
    }
  }
  return false;
};

// ============================================
// EMAIL TEMPLATES
// ============================================

const emailTemplates = {
  verification: (token, userEmail) => ({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: userEmail,
    subject: 'Verify your LaundryPro account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #14b8a6; margin: 0;">LaundryPro</h1>
          <p style="color: #6b7280; margin: 5px 0;">Premium Laundry & Dry Cleaning Service</p>
        </div>
        
        <div style="background: #f8fafc; padding: 30px; border-radius: 10px; margin-bottom: 20px;">
          <h2 style="color: #1f2937; margin-bottom: 20px;">Welcome to LaundryPro!</h2>
          <p style="color: #4b5563; line-height: 1.6; margin-bottom: 25px;">
            Thank you for registering with LaundryPro. Please verify your email address by clicking the button below.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/auth/verify-email?token=${token}" 
               style="background: linear-gradient(135deg, #14b8a6, #06b6d4); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin-top: 25px;">
            Or copy this link:<br>
            <a href="${process.env.FRONTEND_URL}/auth/verify-email?token=${token}" style="color: #14b8a6; word-break: break-all;">
              ${process.env.FRONTEND_URL}/auth/verify-email?token=${token}
            </a>
          </p>
        </div>
        
        <div style="text-align: center; color: #9ca3af; font-size: 12px;">
          <p>This link expires in 24 hours.</p>
        </div>
      </div>
    `
  }),

  orderConfirmation: (order, user, items = []) => ({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: user.email,
    subject: `✅ Order Confirmed - ${order.orderNumber} | LaundryPro`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #14b8a6, #06b6d4); padding: 25px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0;">LaundryPro</h1>
        </div>
        
        <div style="background: #10b981; padding: 20px; text-align: center;">
          <h2 style="color: white; margin: 0;">✓ Order Confirmed!</h2>
        </div>
        
        <div style="background: white; padding: 25px; border: 1px solid #e5e7eb;">
          <p style="color: #374151;">Hi <strong>${user.name || 'Customer'}</strong>,</p>
          <p style="color: #4b5563;">Your order has been placed successfully!</p>
          
          <div style="background: #f0fdfa; border: 2px dashed #14b8a6; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <p style="color: #6b7280; margin: 0; font-size: 12px;">ORDER NUMBER</p>
            <p style="color: #0d9488; margin: 5px 0 0; font-size: 22px; font-weight: bold;">${order.orderNumber}</p>
          </div>
          
          <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
            <tr><td style="padding: 8px 0; color: #6b7280;">📅 Pickup</td><td style="text-align: right; color: #1f2937;">${new Date(order.pickupDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} - ${order.pickupTimeSlot}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280;">💳 Payment</td><td style="text-align: right; color: #1f2937;">${order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online'}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b7280; font-weight: bold;">💰 Total</td><td style="text-align: right; color: #0d9488; font-weight: bold; font-size: 18px;">₹${order.pricing?.total || order.totalAmount || '0'}</td></tr>
          </table>
          
          <div style="text-align: center; margin-top: 20px;">
            <a href="${process.env.FRONTEND_URL}/customer/orders" style="background: #14b8a6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Track Order</a>
          </div>
        </div>
        
        <div style="text-align: center; padding: 15px; color: #9ca3af; font-size: 12px;">
          © ${new Date().getFullYear()} LaundryPro
        </div>
      </div>
    `
  }),

  statusUpdate: (order, user, newStatus) => ({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: user.email,
    subject: `Order Update - ${order.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #14b8a6; margin: 0;">LaundryPro</h1>
        </div>
        
        <div style="background: #f8fafc; padding: 25px; border-radius: 10px;">
          <p style="color: #4b5563;">Hi ${user.name}, your order <strong>${order.orderNumber}</strong> status:</p>
          
          <div style="background: linear-gradient(135deg, #14b8a6, #06b6d4); color: white; padding: 15px; border-radius: 8px; text-align: center; font-size: 18px; font-weight: bold; text-transform: capitalize; margin: 15px 0;">
            ${newStatus.replace('-', ' ')}
          </div>
          
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL}/customer/orders/${order._id}" style="background: #14b8a6; color: white; padding: 10px 25px; text-decoration: none; border-radius: 6px; display: inline-block;">View Details</a>
          </div>
        </div>
      </div>
    `
  }),

  adminInvitation: (invitation, inviterName) => ({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: invitation.email,
    subject: "You're invited to join LaundryPro as Admin",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #14b8a6; margin: 0;">LaundryPro</h1>
        </div>
        
        <div style="background: #f8fafc; padding: 25px; border-radius: 10px;">
          <h2 style="color: #1f2937;">You've Been Invited!</h2>
          <p style="color: #4b5563;">${inviterName} invited you as <strong>${invitation.role === 'center_admin' ? 'Center Admin' : 'Admin'}</strong>.</p>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${process.env.FRONTEND_URL}/auth/accept-invitation?token=${invitation.invitationToken}" 
               style="background: linear-gradient(135deg, #14b8a6, #06b6d4); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Accept Invitation
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 13px;">Link expires in 48 hours.</p>
        </div>
      </div>
    `
  })
};

module.exports = {
  sendEmail,
  sendEmailAsync,
  emailTemplates,
  verifyEmailConfig
};
