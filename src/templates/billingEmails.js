/**
 * Billing Email Templates for Multi-Tenancy PaaS
 */

const billingEmailTemplates = {
  // Invoice Generated
  invoiceGenerated: (data) => ({
    subject: `Invoice #${data.invoiceNumber} - LaundryLobby Platform`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #3B82F6; margin: 0;">LaundryLobby</h1>
          <p style="color: #666; margin: 5px 0;">Platform Invoice</p>
        </div>
        
        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <h2 style="color: #333; margin-top: 0;">Invoice #${data.invoiceNumber}</h2>
          <p style="color: #666; margin: 5px 0;"><strong>Tenancy:</strong> ${data.tenancyName}</p>
          <p style="color: #666; margin: 5px 0;"><strong>Plan:</strong> ${data.plan}</p>
          <p style="color: #666; margin: 5px 0;"><strong>Billing Period:</strong> ${data.billingPeriod}</p>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px 0; color: #666;">Subtotal</td>
            <td style="padding: 10px 0; text-align: right;">₹${data.subtotal}</td>
          </tr>
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px 0; color: #666;">Tax (GST 18%)</td>
            <td style="padding: 10px 0; text-align: right;">₹${data.tax}</td>
          </tr>
          ${data.discount > 0 ? `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px 0; color: #22C55E;">Discount</td>
            <td style="padding: 10px 0; text-align: right; color: #22C55E;">-₹${data.discount}</td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 15px 0; font-weight: bold; font-size: 18px;">Total</td>
            <td style="padding: 15px 0; text-align: right; font-weight: bold; font-size: 18px; color: #3B82F6;">₹${data.total}</td>
          </tr>
        </table>
        
        <div style="background: #FEF3C7; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
          <p style="margin: 0; color: #92400E;"><strong>Due Date:</strong> ${data.dueDate}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.paymentUrl}" style="background: #3B82F6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Pay Now</a>
        </div>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          LaundryLobby Platform | Questions? Contact support@LaundryLobby.com
        </p>
      </div>
    `
  }),

  // Payment Received
  paymentReceived: (data) => ({
    subject: `Payment Received - Invoice #${data.invoiceNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="width: 60px; height: 60px; background: #22C55E; border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center;">
            <span style="color: white; font-size: 30px;">✓</span>
          </div>
          <h1 style="color: #22C55E; margin: 0;">Payment Received!</h1>
        </div>
        
        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <p style="margin: 5px 0;"><strong>Invoice:</strong> #${data.invoiceNumber}</p>
          <p style="margin: 5px 0;"><strong>Amount:</strong> ₹${data.amount}</p>
          <p style="margin: 5px 0;"><strong>Payment Method:</strong> ${data.paymentMethod}</p>
          <p style="margin: 5px 0;"><strong>Transaction ID:</strong> ${data.transactionId || 'N/A'}</p>
          <p style="margin: 5px 0;"><strong>Date:</strong> ${data.paidAt}</p>
        </div>
        
        <p style="color: #666;">Thank you for your payment! Your subscription for <strong>${data.tenancyName}</strong> is now active until <strong>${data.subscriptionEndDate}</strong>.</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          LaundryLobby Platform | Questions? Contact support@LaundryLobby.com
        </p>
      </div>
    `
  }),

  // Payment Overdue
  paymentOverdue: (data) => ({
    subject: `⚠️ Payment Overdue - Invoice #${data.invoiceNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="width: 60px; height: 60px; background: #EF4444; border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center;">
            <span style="color: white; font-size: 30px;">!</span>
          </div>
          <h1 style="color: #EF4444; margin: 0;">Payment Overdue</h1>
        </div>
        
        <p style="color: #666;">Your invoice for <strong>${data.tenancyName}</strong> is now overdue.</p>
        
        <div style="background: #FEE2E2; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Invoice:</strong> #${data.invoiceNumber}</p>
          <p style="margin: 5px 0;"><strong>Amount Due:</strong> ₹${data.amount}</p>
          <p style="margin: 5px 0;"><strong>Due Date:</strong> ${data.dueDate}</p>
          <p style="margin: 5px 0; color: #EF4444;"><strong>Days Overdue:</strong> ${data.daysOverdue} days</p>
        </div>
        
        <p style="color: #666;">Please make the payment immediately to avoid service interruption.</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.paymentUrl}" style="background: #EF4444; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Pay Now</a>
        </div>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          LaundryLobby Platform | Questions? Contact support@LaundryLobby.com
        </p>
      </div>
    `
  }),

  // Subscription Expiring Soon
  subscriptionExpiring: (data) => ({
    subject: `Your LaundryLobby subscription expires in ${data.daysRemaining} days`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #3B82F6; margin: 0;">LaundryLobby</h1>
        </div>
        
        <div style="background: #FEF3C7; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <h2 style="color: #92400E; margin-top: 0;">⏰ Subscription Expiring Soon</h2>
          <p style="color: #92400E; margin: 0;">Your subscription for <strong>${data.tenancyName}</strong> expires on <strong>${data.expiryDate}</strong>.</p>
        </div>
        
        <p style="color: #666;">Renew now to continue enjoying uninterrupted service:</p>
        
        <ul style="color: #666;">
          <li>Keep your branded customer portal active</li>
          <li>Continue receiving orders</li>
          <li>Maintain access to analytics and reports</li>
        </ul>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.renewUrl}" style="background: #3B82F6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Renew Subscription</a>
        </div>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          LaundryLobby Platform | Questions? Contact support@LaundryLobby.com
        </p>
      </div>
    `
  }),

  // Plan Upgraded
  planUpgraded: (data) => ({
    subject: `🎉 Plan Upgraded to ${data.newPlan}!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="width: 60px; height: 60px; background: #8B5CF6; border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center;">
            <span style="color: white; font-size: 30px;">🚀</span>
          </div>
          <h1 style="color: #8B5CF6; margin: 0;">Plan Upgraded!</h1>
        </div>
        
        <p style="color: #666; text-align: center;">Congratulations! Your <strong>${data.tenancyName}</strong> has been upgraded to the <strong>${data.newPlan}</strong> plan.</p>
        
        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #333;">New Features Unlocked:</h3>
          <ul style="color: #666; margin: 0; padding-left: 20px;">
            ${data.features.map(f => `<li>${f}</li>`).join('')}
          </ul>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.dashboardUrl}" style="background: #8B5CF6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Go to Dashboard</a>
        </div>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">
          LaundryLobby Platform | Questions? Contact support@LaundryLobby.com
        </p>
      </div>
    `
  })
};

module.exports = billingEmailTemplates;
