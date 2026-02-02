const cron = require('node-cron');
const TenantAddOn = require('../models/TenantAddOn');
const AddOnTransaction = require('../models/AddOnTransaction');
const Tenancy = require('../models/Tenancy');
const stripeService = require('./stripeService');
const notificationServiceIntegration = require('./notificationServiceIntegration');
// const emailService = require('./emailService'); // TEMPORARILY DISABLED

class AddOnBillingService {
  constructor() {
    this.isRunning = false;
    this.setupCronJobs();
  }

  /**
   * Setup cron jobs for billing automation
   */
  setupCronJobs() {
    // Process billing every hour
    cron.schedule('0 * * * *', () => {
      this.processDueBilling();
    });

    // Check for expiring trials daily at 9 AM
    cron.schedule('0 9 * * *', () => {
      this.checkExpiringTrials();
    });

    // Send low balance alerts daily at 10 AM
    cron.schedule('0 10 * * *', () => {
      this.checkLowBalanceAlerts();
    });

    // Process failed payments retry every 6 hours
    cron.schedule('0 */6 * * *', () => {
      this.retryFailedPayments();
    });

    // Clean up expired add-ons daily at midnight
    cron.schedule('0 0 * * *', () => {
      this.cleanupExpiredAddOns();
    });

    console.log('✅ Add-on billing cron jobs scheduled');
  }

  /**
   * Process due billing for recurring add-ons
   */
  async processDueBilling() {
    if (this.isRunning) {
      console.log('⏳ Billing process already running, skipping...');
      return;
    }

    try {
      this.isRunning = true;
      console.log('🔄 Starting add-on billing process...');

      const dueAddOns = await TenantAddOn.findDueForBilling();
      console.log(`📋 Found ${dueAddOns.length} add-ons due for billing`);

      const results = {
        processed: 0,
        successful: 0,
        failed: 0,
        errors: []
      };

      for (const tenantAddOn of dueAddOns) {
        try {
          results.processed++;
          await this.processAddOnBilling(tenantAddOn);
          results.successful++;
          
          console.log(`✅ Billed add-on ${tenantAddOn.addOn.name} for tenant ${tenantAddOn.tenant._id}`);
        } catch (error) {
          results.failed++;
          results.errors.push({
            tenantAddOnId: tenantAddOn._id,
            error: error.message
          });
          
          console.error(`❌ Failed to bill add-on ${tenantAddOn.addOn.name}:`, error.message);
          
          // Handle billing failure
          await this.handleBillingFailure(tenantAddOn, error);
        }
      }

      console.log('📊 Billing process completed:', results);
    } catch (error) {
      console.error('💥 Billing process error:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process billing for a single add-on
   */
  async processAddOnBilling(tenantAddOn) {
    const addOn = tenantAddOn.addOn;
    const tenant = tenantAddOn.tenant;

    // Calculate billing amount
    const amount = this.calculateBillingAmount(tenantAddOn);
    
    if (amount <= 0) {
      console.log(`⚠️ Skipping billing for ${addOn.name} - amount is ${amount}`);
      return;
    }

    // Create transaction record
    const transaction = new AddOnTransaction({
      tenant: tenant._id,
      tenantAddOn: tenantAddOn._id,
      type: 'renewal',
      status: 'pending',
      amount: {
        subtotal: amount,
        tax: Math.round(amount * 0.18), // 18% GST
        discount: 0,
        total: amount + Math.round(amount * 0.18),
        currency: 'INR'
      },
      billingPeriod: {
        start: new Date(),
        end: this.getNextBillingDate(tenantAddOn)
      },
      source: 'auto_renewal',
      initiatedByModel: 'System'
    });

    // Add line items
    transaction.addLineItem({
      type: 'addon',
      description: `${addOn.displayName} - ${tenantAddOn.billingCycle} renewal`,
      unitPrice: amount,
      quantity: tenantAddOn.quantity,
      amount: amount,
      addOn: addOn._id,
      billingPeriod: transaction.billingPeriod
    });

    transaction.addLineItem({
      type: 'tax',
      description: 'GST (18%)',
      unitPrice: Math.round(amount * 0.18),
      quantity: 1,
      amount: Math.round(amount * 0.18),
      taxDetails: {
        rate: 18,
        amount: Math.round(amount * 0.18),
        type: 'GST'
      }
    });

    await transaction.save();

    try {
      // Process payment
      const paymentResult = await stripeService.processAddOnPayment({
        amount: transaction.amount.total,
        currency: 'inr',
        customerId: tenant.stripeCustomerId,
        metadata: {
          transactionId: transaction.transactionId,
          tenantId: tenant._id.toString(),
          addOnId: addOn._id.toString(),
          type: 'renewal'
        }
      });

      if (paymentResult.status === 'succeeded') {
        // Mark transaction as completed
        transaction.markCompleted({
          gatewayTransactionId: paymentResult.paymentIntentId,
          gatewayResponse: paymentResult
        });

        // Update tenant add-on billing
        tenantAddOn.addBillingRecord({
          transactionId: transaction.transactionId,
          amount: transaction.amount.total,
          billingPeriod: transaction.billingPeriod,
          paymentMethod: 'card',
          paymentStatus: 'completed',
          stripePaymentIntentId: paymentResult.paymentIntentId
        });

        // Reset auto-renewal failure count
        tenantAddOn.autoRenewal.failedAttempts = 0;
        tenantAddOn.autoRenewal.lastFailedAt = null;
        tenantAddOn.autoRenewal.nextRetryAt = null;

        await tenantAddOn.save();
        await transaction.save();

        // Send success notification
        await this.sendBillingSuccessNotification(tenantAddOn, transaction);

        // Emit real-time update via Socket.IO
        await notificationServiceIntegration.emitToTenant(tenant._id, 'addOnBilled', {
          addOn: {
            id: addOn._id,
            name: addOn.name,
            displayName: addOn.displayName
          },
          transaction: {
            id: transaction._id,
            transactionId: transaction.transactionId,
            amount: transaction.amount.total
          },
          nextBillingDate: tenantAddOn.nextBillingDate
        });

      } else {
        throw new Error(paymentResult.error || 'Payment failed');
      }

    } catch (paymentError) {
      // Mark transaction as failed
      transaction.markFailed(paymentError.message);
      await transaction.save();
      
      throw paymentError;
    }
  }

  /**
   * Handle billing failure
   */
  async handleBillingFailure(tenantAddOn, error) {
    try {
      // Increment failure count
      tenantAddOn.autoRenewal.failedAttempts += 1;
      tenantAddOn.autoRenewal.lastFailedAt = new Date();

      const maxRetries = 3;
      
      if (tenantAddOn.autoRenewal.failedAttempts >= maxRetries) {
        // Suspend add-on after max retries
        await tenantAddOn.suspend(
          `Payment failed after ${maxRetries} attempts: ${error.message}`,
          null,
          'System'
        );

        // Send suspension notification
        await this.sendSuspensionNotification(tenantAddOn, error);

        console.log(`🚫 Suspended add-on ${tenantAddOn.addOn.name} after ${maxRetries} failed payment attempts`);
      } else {
        // Schedule retry
        const retryDelay = Math.pow(2, tenantAddOn.autoRenewal.failedAttempts) * 24 * 60 * 60 * 1000; // Exponential backoff in days
        tenantAddOn.autoRenewal.nextRetryAt = new Date(Date.now() + retryDelay);

        // Send payment failure notification
        await this.sendPaymentFailureNotification(tenantAddOn, error);

        console.log(`⏰ Scheduled retry for add-on ${tenantAddOn.addOn.name} in ${retryDelay / (24 * 60 * 60 * 1000)} days`);
      }

      await tenantAddOn.save();

      // Emit real-time update via Socket.IO
      await notificationServiceIntegration.emitToTenant(tenantAddOn.tenant, 'addOnPaymentFailed', {
        addOn: {
          id: tenantAddOn.addOn._id,
          name: tenantAddOn.addOn.name,
          displayName: tenantAddOn.addOn.displayName
        },
        error: error.message,
        failedAttempts: tenantAddOn.autoRenewal.failedAttempts,
        nextRetryAt: tenantAddOn.autoRenewal.nextRetryAt,
        suspended: tenantAddOn.status === 'suspended'
      });

    } catch (updateError) {
      console.error('Error handling billing failure:', updateError);
    }
  }

  /**
   * Check for expiring trials
   */
  async checkExpiringTrials() {
    try {
      console.log('🔍 Checking for expiring trials...');

      // Find trials expiring in 3 days
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

      const expiringTrials = await TenantAddOn.find({
        status: 'trial',
        trialEndsAt: { $lte: threeDaysFromNow, $gte: new Date() },
        isDeleted: false
      }).populate(['tenant', 'addOn']);

      console.log(`📋 Found ${expiringTrials.length} trials expiring soon`);

      for (const tenantAddOn of expiringTrials) {
        await this.sendTrialExpiringNotification(tenantAddOn);
      }

      // Find expired trials
      const expiredTrials = await TenantAddOn.find({
        status: 'trial',
        trialEndsAt: { $lt: new Date() },
        isDeleted: false
      }).populate(['tenant', 'addOn']);

      console.log(`📋 Found ${expiredTrials.length} expired trials`);

      for (const tenantAddOn of expiredTrials) {
        // Convert to paid subscription or cancel
        if (tenantAddOn.autoRenewal.enabled) {
          try {
            await this.processAddOnBilling(tenantAddOn);
            tenantAddOn.status = 'active';
            await tenantAddOn.save();
            
            console.log(`✅ Converted trial to paid subscription: ${tenantAddOn.addOn.name}`);
          } catch (error) {
            // Cancel if payment fails
            await tenantAddOn.cancel(
              'Trial expired and payment failed',
              null,
              'System'
            );
            
            console.log(`❌ Cancelled expired trial: ${tenantAddOn.addOn.name}`);
          }
        } else {
          // Cancel trial
          await tenantAddOn.cancel(
            'Trial expired',
            null,
            'System'
          );
          
          console.log(`⏰ Cancelled expired trial: ${tenantAddOn.addOn.name}`);
        }
      }

    } catch (error) {
      console.error('Error checking expiring trials:', error);
    }
  }

  /**
   * Check for low balance alerts
   */
  async checkLowBalanceAlerts() {
    try {
      console.log('🔍 Checking for low balance alerts...');

      const usageAddOns = await TenantAddOn.find({
        billingCycle: 'usage-based',
        status: { $in: ['active', 'trial'] },
        'usageTracking.lowBalanceAlerted': false,
        isDeleted: false
      }).populate(['tenant', 'addOn']);

      let alertsSent = 0;

      for (const tenantAddOn of usageAddOns) {
        const threshold = tenantAddOn.usageTracking.renewalThreshold || 10;
        const remaining = tenantAddOn.usageTracking.remainingCredits || 0;

        if (remaining <= threshold) {
          await this.sendLowBalanceAlert(tenantAddOn);
          
          // Mark as alerted
          tenantAddOn.usageTracking.lowBalanceAlerted = true;
          tenantAddOn.usageTracking.lastAlertSent = new Date();
          await tenantAddOn.save();

          alertsSent++;
        }
      }

      console.log(`📧 Sent ${alertsSent} low balance alerts`);

    } catch (error) {
      console.error('Error checking low balance alerts:', error);
    }
  }

  /**
   * Retry failed payments
   */
  async retryFailedPayments() {
    try {
      console.log('🔄 Retrying failed payments...');

      const failedAddOns = await TenantAddOn.find({
        status: 'active',
        'autoRenewal.failedAttempts': { $gt: 0, $lt: 3 },
        'autoRenewal.nextRetryAt': { $lte: new Date() },
        isDeleted: false
      }).populate(['tenant', 'addOn']);

      console.log(`📋 Found ${failedAddOns.length} add-ons to retry`);

      for (const tenantAddOn of failedAddOns) {
        try {
          await this.processAddOnBilling(tenantAddOn);
          console.log(`✅ Retry successful for ${tenantAddOn.addOn.name}`);
        } catch (error) {
          await this.handleBillingFailure(tenantAddOn, error);
          console.log(`❌ Retry failed for ${tenantAddOn.addOn.name}: ${error.message}`);
        }
      }

    } catch (error) {
      console.error('Error retrying failed payments:', error);
    }
  }

  /**
   * Clean up expired add-ons
   */
  async cleanupExpiredAddOns() {
    try {
      console.log('🧹 Cleaning up expired add-ons...');

      const expiredAddOns = await TenantAddOn.find({
        status: { $in: ['cancelled', 'expired'] },
        expiresAt: { $lt: new Date() },
        isDeleted: false
      });

      for (const tenantAddOn of expiredAddOns) {
        // Archive old add-ons (soft delete after 90 days)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        if (tenantAddOn.cancelledAt && tenantAddOn.cancelledAt < ninetyDaysAgo) {
          tenantAddOn.isDeleted = true;
          tenantAddOn.deletedAt = new Date();
          tenantAddOn.deletedByModel = 'System';
          await tenantAddOn.save();
          
          console.log(`🗑️ Archived old add-on: ${tenantAddOn.addOn.name}`);
        }
      }

    } catch (error) {
      console.error('Error cleaning up expired add-ons:', error);
    }
  }

  /**
   * Calculate billing amount for add-on
   */
  calculateBillingAmount(tenantAddOn) {
    const pricing = tenantAddOn.effectivePricing;
    const quantity = tenantAddOn.quantity || 1;

    switch (tenantAddOn.billingCycle) {
      case 'monthly':
        return (pricing.monthly || 0) * quantity;
      case 'yearly':
        return (pricing.yearly || 0) * quantity;
      case 'one-time':
        return 0; // One-time add-ons don't have recurring billing
      case 'usage-based':
        return 0; // Usage-based add-ons are charged separately
      default:
        return 0;
    }
  }

  /**
   * Get next billing date
   */
  getNextBillingDate(tenantAddOn) {
    const current = tenantAddOn.nextBillingDate || new Date();
    const next = new Date(current);

    switch (tenantAddOn.billingCycle) {
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        break;
      case 'yearly':
        next.setFullYear(next.getFullYear() + 1);
        break;
      default:
        // For one-time and usage-based, no next billing date
        return null;
    }

    return next;
  }

  /**
   * Send billing success notification
   */
  async sendBillingSuccessNotification(tenantAddOn, transaction) {
    try {
      const tenant = tenantAddOn.tenant;
      const addOn = tenantAddOn.addOn;

      // Send email notification - TEMPORARILY DISABLED
      // await emailService.sendEmail({
      //   to: tenant.email,
      //   subject: `Payment Successful - ${addOn.displayName}`,
      //   template: 'addon-billing-success',
      //   data: {
      //     tenantName: tenant.businessName || tenant.name,
      //     addOnName: addOn.displayName,
      //     amount: transaction.formattedAmount.total,
      //     transactionId: transaction.transactionId,
      //     nextBillingDate: tenantAddOn.nextBillingDate,
      //     invoiceUrl: `${process.env.FRONTEND_URL}/billing/invoices/${transaction.invoiceNumber}`
      //   }
      // });
      console.log('📧 Email notification skipped (temporarily disabled):', `Payment Successful - ${addOn.displayName}`);

      // Send in-app notification via Socket.IO
      await notificationServiceIntegration.emitToTenant(tenant._id, 'notification', {
        type: 'billing_success',
        title: 'Payment Successful',
        message: `Your payment for ${addOn.displayName} has been processed successfully.`,
        data: {
          addOnId: addOn._id,
          transactionId: transaction.transactionId,
          amount: transaction.amount.total
        }
      });

    } catch (error) {
      console.error('Error sending billing success notification:', error);
    }
  }

  /**
   * Send payment failure notification
   */
  async sendPaymentFailureNotification(tenantAddOn, error) {
    try {
      const tenant = tenantAddOn.tenant;
      const addOn = tenantAddOn.addOn;

      // await emailService.sendEmail({
      //   to: tenant.email,
      //   subject: `Payment Failed - ${addOn.displayName}`,
      //   template: 'addon-payment-failed',
      //   data: {
      //     tenantName: tenant.businessName || tenant.name,
      //     addOnName: addOn.displayName,
      //     error: error.message,
      //     failedAttempts: tenantAddOn.autoRenewal.failedAttempts,
      //     nextRetryAt: tenantAddOn.autoRenewal.nextRetryAt,
      //     updatePaymentUrl: `${process.env.FRONTEND_URL}/billing/payment-methods`
      //   }
      // });
      console.log('📧 Email notification skipped (temporarily disabled):', `Payment Failed - ${addOn.displayName}`);

      await notificationServiceIntegration.emitToTenant(tenant._id, 'notification', {
        type: 'payment_failed',
        title: 'Payment Failed',
        message: `Payment for ${addOn.displayName} failed. Please update your payment method.`,
        data: {
          addOnId: addOn._id,
          error: error.message,
          failedAttempts: tenantAddOn.autoRenewal.failedAttempts
        }
      });

    } catch (error) {
      console.error('Error sending payment failure notification:', error);
    }
  }

  /**
   * Send suspension notification
   */
  async sendSuspensionNotification(tenantAddOn, error) {
    try {
      const tenant = tenantAddOn.tenant;
      const addOn = tenantAddOn.addOn;

      // await emailService.sendEmail({
      //   to: tenant.email,
      //   subject: `Add-on Suspended - ${addOn.displayName}`,
      //   template: 'addon-suspended',
      //   data: {
      //     tenantName: tenant.businessName || tenant.name,
      //     addOnName: addOn.displayName,
      //     reason: error.message,
      //     reactivateUrl: `${process.env.FRONTEND_URL}/addons/my-addons`
      //   }
      // });
      console.log('📧 Email notification skipped (temporarily disabled):', `Add-on Suspended - ${addOn.displayName}`);

      await notificationServiceIntegration.emitToTenant(tenant._id, 'notification', {
        type: 'addon_suspended',
        title: 'Add-on Suspended',
        message: `${addOn.displayName} has been suspended due to payment failure.`,
        data: {
          addOnId: addOn._id,
          reason: error.message
        }
      });

    } catch (error) {
      console.error('Error sending suspension notification:', error);
    }
  }

  /**
   * Send trial expiring notification
   */
  async sendTrialExpiringNotification(tenantAddOn) {
    try {
      const tenant = tenantAddOn.tenant;
      const addOn = tenantAddOn.addOn;
      const daysLeft = Math.ceil((tenantAddOn.trialEndsAt - new Date()) / (1000 * 60 * 60 * 24));

      // await emailService.sendEmail({
      //   to: tenant.email,
      //   subject: `Trial Expiring Soon - ${addOn.displayName}`,
      //   template: 'addon-trial-expiring',
      //   data: {
      //     tenantName: tenant.businessName || tenant.name,
      //     addOnName: addOn.displayName,
      //     daysLeft,
      //     trialEndsAt: tenantAddOn.trialEndsAt,
      //     purchaseUrl: `${process.env.FRONTEND_URL}/addons/marketplace/${addOn._id}`
      //   }
      // });
      console.log('📧 Email notification skipped (temporarily disabled):', `Trial Expiring Soon - ${addOn.displayName}`);

      await notificationServiceIntegration.emitToTenant(tenant._id, 'notification', {
        type: 'trial_expiring',
        title: 'Trial Expiring Soon',
        message: `Your trial for ${addOn.displayName} expires in ${daysLeft} days.`,
        data: {
          addOnId: addOn._id,
          daysLeft,
          trialEndsAt: tenantAddOn.trialEndsAt
        }
      });

    } catch (error) {
      console.error('Error sending trial expiring notification:', error);
    }
  }

  /**
   * Send low balance alert
   */
  async sendLowBalanceAlert(tenantAddOn) {
    try {
      const tenant = tenantAddOn.tenant;
      const addOn = tenantAddOn.addOn;
      const remaining = tenantAddOn.usageTracking.remainingCredits;

      // await emailService.sendEmail({
      //   to: tenant.email,
      //   subject: `Low Balance Alert - ${addOn.displayName}`,
      //   template: 'addon-low-balance',
      //   data: {
      //     tenantName: tenant.businessName || tenant.name,
      //     addOnName: addOn.displayName,
      //     remainingCredits: remaining,
      //     threshold: tenantAddOn.usageTracking.renewalThreshold,
      //     autoRenew: tenantAddOn.usageTracking.autoRenew,
      //     purchaseUrl: `${process.env.FRONTEND_URL}/addons/marketplace/${addOn._id}`
      //   }
      // });
      console.log('📧 Email notification skipped (temporarily disabled):', `Low Balance Alert - ${addOn.displayName}`);

      await notificationServiceIntegration.emitToTenant(tenant._id, 'notification', {
        type: 'low_balance',
        title: 'Low Balance Alert',
        message: `Your ${addOn.displayName} balance is running low (${remaining} credits remaining).`,
        data: {
          addOnId: addOn._id,
          remainingCredits: remaining,
          threshold: tenantAddOn.usageTracking.renewalThreshold
        }
      });

    } catch (error) {
      console.error('Error sending low balance alert:', error);
    }
  }

  /**
   * Manual billing trigger (for testing or admin use)
   */
  async triggerBilling(tenantAddOnId) {
    try {
      const tenantAddOn = await TenantAddOn.findById(tenantAddOnId).populate(['tenant', 'addOn']);
      
      if (!tenantAddOn) {
        throw new Error('Tenant add-on not found');
      }

      await this.processAddOnBilling(tenantAddOn);
      return { success: true, message: 'Billing processed successfully' };
    } catch (error) {
      console.error('Manual billing trigger error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get billing statistics
   */
  async getBillingStats(period = '30d') {
    try {
      const endDate = new Date();
      let startDate = new Date();
      
      switch (period) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
      }

      const stats = await AddOnTransaction.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
            type: { $in: ['purchase', 'renewal'] },
            status: 'completed'
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$amount.total' },
            totalTransactions: { $sum: 1 },
            averageTransaction: { $avg: '$amount.total' },
            renewals: {
              $sum: { $cond: [{ $eq: ['$type', 'renewal'] }, 1, 0] }
            },
            newPurchases: {
              $sum: { $cond: [{ $eq: ['$type', 'purchase'] }, 1, 0] }
            }
          }
        }
      ]);

      return stats[0] || {
        totalRevenue: 0,
        totalTransactions: 0,
        averageTransaction: 0,
        renewals: 0,
        newPurchases: 0
      };
    } catch (error) {
      console.error('Error getting billing stats:', error);
      return null;
    }
  }
}

// Create singleton instance
const addOnBillingService = new AddOnBillingService();

module.exports = addOnBillingService;