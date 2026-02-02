const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const AddOnTransaction = require('../models/AddOnTransaction');
const TenantAddOn = require('../models/TenantAddOn');
const AddOn = require('../models/AddOn');
const Tenancy = require('../models/Tenancy');

/**
 * Process add-on payment with Stripe
 */
const processAddOnPayment = async (paymentData) => {
  try {
    const {
      amount,
      currency = 'inr',
      paymentMethodId,
      customerId,
      metadata = {},
      description
    } = paymentData;

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to paise/cents
      currency: currency.toLowerCase(),
      payment_method: paymentMethodId,
      customer: customerId,
      confirmation_method: 'manual',
      confirm: true,
      description: description || 'Add-on purchase',
      metadata: {
        type: 'addon_payment',
        ...metadata
      },
      return_url: `${process.env.FRONTEND_URL}/admin/billing/success`
    });

    return {
      success: true,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      clientSecret: paymentIntent.client_secret,
      requiresAction: paymentIntent.status === 'requires_action',
      nextAction: paymentIntent.next_action
    };
  } catch (error) {
    console.error('Stripe payment processing error:', error);
    return {
      success: false,
      error: error.message,
      code: error.code,
      type: error.type
    };
  }
};

/**
 * Create Stripe subscription for recurring add-ons
 */
const createAddOnSubscription = async (subscriptionData) => {
  try {
    const {
      customerId,
      priceId,
      quantity = 1,
      trialPeriodDays = 0,
      metadata = {},
      prorationBehavior = 'create_prorations'
    } = subscriptionData;

    const subscriptionParams = {
      customer: customerId,
      items: [{
        price: priceId,
        quantity
      }],
      metadata: {
        type: 'addon_subscription',
        ...metadata
      },
      proration_behavior: prorationBehavior,
      expand: ['latest_invoice.payment_intent']
    };

    if (trialPeriodDays > 0) {
      subscriptionParams.trial_period_days = trialPeriodDays;
    }

    const subscription = await stripe.subscriptions.create(subscriptionParams);

    return {
      success: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
      latestInvoice: subscription.latest_invoice
    };
  } catch (error) {
    console.error('Stripe subscription creation error:', error);
    return {
      success: false,
      error: error.message,
      code: error.code,
      type: error.type
    };
  }
};

/**
 * Create or retrieve Stripe price for add-on
 */
const createAddOnPrice = async (addOn, billingCycle) => {
  try {
    let unitAmount;
    let recurring = null;

    switch (billingCycle) {
      case 'monthly':
        unitAmount = addOn.pricing.monthly * 100; // Convert to paise
        recurring = { interval: 'month' };
        break;
      case 'yearly':
        unitAmount = addOn.pricing.yearly * 100;
        recurring = { interval: 'year' };
        break;
      case 'one-time':
        unitAmount = addOn.pricing.oneTime * 100;
        break;
      default:
        throw new Error('Invalid billing cycle');
    }

    // Check if price already exists
    const existingPrices = await stripe.prices.list({
      product: addOn.stripeProductId,
      unit_amount: unitAmount,
      currency: 'inr',
      recurring: recurring,
      active: true,
      limit: 1
    });

    if (existingPrices.data.length > 0) {
      return {
        success: true,
        priceId: existingPrices.data[0].id,
        existing: true
      };
    }

    // Create new price
    const priceParams = {
      unit_amount: unitAmount,
      currency: 'inr',
      product: addOn.stripeProductId,
      metadata: {
        addOnId: addOn._id.toString(),
        billingCycle
      }
    };

    if (recurring) {
      priceParams.recurring = recurring;
    }

    const price = await stripe.prices.create(priceParams);

    return {
      success: true,
      priceId: price.id,
      existing: false
    };
  } catch (error) {
    console.error('Stripe price creation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Create Stripe product for add-on
 */
const createAddOnProduct = async (addOn) => {
  try {
    // Check if product already exists
    if (addOn.stripeProductId) {
      try {
        const existingProduct = await stripe.products.retrieve(addOn.stripeProductId);
        if (existingProduct && existingProduct.active) {
          return {
            success: true,
            productId: existingProduct.id,
            existing: true
          };
        }
      } catch (error) {
        // Product doesn't exist, create new one
        console.log('Existing product not found, creating new one');
      }
    }

    const product = await stripe.products.create({
      name: addOn.displayName,
      description: addOn.description,
      metadata: {
        addOnId: addOn._id.toString(),
        category: addOn.category,
        type: 'addon'
      },
      images: addOn.images?.filter(img => img.type === 'thumbnail').map(img => img.url) || []
    });

    // Update add-on with Stripe product ID
    await AddOn.findByIdAndUpdate(addOn._id, {
      stripeProductId: product.id
    });

    return {
      success: true,
      productId: product.id,
      existing: false
    };
  } catch (error) {
    console.error('Stripe product creation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Handle Stripe webhook for add-on payments
 */
const handleAddOnWebhook = async (event) => {
  try {
    console.log(`Processing Stripe webhook: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;
      
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object);
        break;
      
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
      
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      
      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
    }

    return { success: true };
  } catch (error) {
    console.error('Webhook handling error:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Handle successful payment intent
 */
const handlePaymentIntentSucceeded = async (paymentIntent) => {
  try {
    const transactionId = paymentIntent.metadata?.transactionId;
    if (!transactionId) {
      console.log('No transaction ID in payment intent metadata');
      return;
    }

    const transaction = await AddOnTransaction.findOne({ transactionId });
    if (!transaction) {
      console.log(`Transaction not found: ${transactionId}`);
      return;
    }

    // Update transaction status
    transaction.markCompleted({
      gatewayTransactionId: paymentIntent.id,
      gatewayResponse: paymentIntent
    });

    await transaction.save();

    // Activate tenant add-on if not already active
    if (transaction.tenantAddOn) {
      const tenantAddOn = await TenantAddOn.findById(transaction.tenantAddOn);
      if (tenantAddOn && tenantAddOn.status === 'pending_payment') {
        tenantAddOn.status = 'active';
        await tenantAddOn.save();

        // Emit real-time update
        const socketService = require('./socketService');
        socketService.emitToTenant(tenantAddOn.tenant, 'addOnActivated', {
          tenantAddOnId: tenantAddOn._id,
          status: 'active'
        });
      }
    }

    console.log(`Payment succeeded for transaction: ${transactionId}`);
  } catch (error) {
    console.error('Error handling payment intent succeeded:', error);
  }
};

/**
 * Handle failed payment intent
 */
const handlePaymentIntentFailed = async (paymentIntent) => {
  try {
    const transactionId = paymentIntent.metadata?.transactionId;
    if (!transactionId) return;

    const transaction = await AddOnTransaction.findOne({ transactionId });
    if (!transaction) return;

    // Update transaction status
    transaction.markFailed(
      paymentIntent.last_payment_error?.message || 'Payment failed',
      paymentIntent.last_payment_error?.code
    );

    await transaction.save();

    console.log(`Payment failed for transaction: ${transactionId}`);
  } catch (error) {
    console.error('Error handling payment intent failed:', error);
  }
};

/**
 * Handle successful invoice payment (for subscriptions)
 */
const handleInvoicePaymentSucceeded = async (invoice) => {
  try {
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) return;

    // Find tenant add-on by subscription ID
    const tenantAddOn = await TenantAddOn.findOne({
      'billingHistory.stripeSubscriptionId': subscriptionId
    }).populate('addOn');

    if (!tenantAddOn) {
      console.log(`Tenant add-on not found for subscription: ${subscriptionId}`);
      return;
    }

    // Create transaction record for the payment
    const transaction = new AddOnTransaction({
      tenant: tenantAddOn.tenant,
      tenantAddOn: tenantAddOn._id,
      type: 'renewal',
      status: 'completed',
      amount: {
        subtotal: invoice.subtotal / 100,
        tax: invoice.tax / 100,
        total: invoice.total / 100,
        currency: invoice.currency.toUpperCase()
      },
      billingPeriod: {
        start: new Date(invoice.period_start * 1000),
        end: new Date(invoice.period_end * 1000)
      },
      paymentDetails: {
        method: 'card',
        gateway: 'stripe',
        gatewayTransactionId: invoice.payment_intent,
        gatewayResponse: invoice
      },
      source: 'auto_renewal',
      initiatedByModel: 'System'
    });

    await transaction.save();

    // Update tenant add-on billing history
    tenantAddOn.addBillingRecord({
      transactionId: transaction.transactionId,
      amount: invoice.total / 100,
      billingPeriod: {
        start: new Date(invoice.period_start * 1000),
        end: new Date(invoice.period_end * 1000)
      },
      paymentMethod: 'card',
      paymentStatus: 'completed',
      stripeSubscriptionId: subscriptionId
    });

    await tenantAddOn.save();

    console.log(`Subscription payment succeeded for tenant add-on: ${tenantAddOn._id}`);
  } catch (error) {
    console.error('Error handling invoice payment succeeded:', error);
  }
};

/**
 * Handle failed invoice payment
 */
const handleInvoicePaymentFailed = async (invoice) => {
  try {
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) return;

    const tenantAddOn = await TenantAddOn.findOne({
      'billingHistory.stripeSubscriptionId': subscriptionId
    });

    if (!tenantAddOn) return;

    // Update retry information
    tenantAddOn.autoRenewal.failedAttempts += 1;
    tenantAddOn.autoRenewal.lastFailedAt = new Date();

    // Suspend add-on after 3 failed attempts
    if (tenantAddOn.autoRenewal.failedAttempts >= 3) {
      await tenantAddOn.suspend(
        'Payment failed after 3 attempts',
        null,
        'System'
      );

      // Emit real-time update
      const socketService = require('./socketService');
      socketService.emitToTenant(tenantAddOn.tenant, 'addOnSuspended', {
        tenantAddOnId: tenantAddOn._id,
        reason: 'payment_failed'
      });
    } else {
      // Schedule next retry
      const retryDelay = Math.pow(2, tenantAddOn.autoRenewal.failedAttempts) * 24 * 60 * 60 * 1000; // Exponential backoff in days
      tenantAddOn.autoRenewal.nextRetryAt = new Date(Date.now() + retryDelay);
    }

    await tenantAddOn.save();

    console.log(`Subscription payment failed for tenant add-on: ${tenantAddOn._id}`);
  } catch (error) {
    console.error('Error handling invoice payment failed:', error);
  }
};

/**
 * Handle subscription updates
 */
const handleSubscriptionUpdated = async (subscription) => {
  try {
    const tenantAddOn = await TenantAddOn.findOne({
      'billingHistory.stripeSubscriptionId': subscription.id
    });

    if (!tenantAddOn) return;

    // Update next billing date
    tenantAddOn.nextBillingDate = new Date(subscription.current_period_end * 1000);

    // Update status based on subscription status
    switch (subscription.status) {
      case 'active':
        if (tenantAddOn.status !== 'active') {
          tenantAddOn.status = 'active';
          tenantAddOn.autoRenewal.failedAttempts = 0; // Reset failed attempts
        }
        break;
      case 'past_due':
        tenantAddOn.status = 'suspended';
        break;
      case 'canceled':
      case 'unpaid':
        tenantAddOn.status = 'cancelled';
        break;
    }

    await tenantAddOn.save();

    console.log(`Subscription updated for tenant add-on: ${tenantAddOn._id}`);
  } catch (error) {
    console.error('Error handling subscription updated:', error);
  }
};

/**
 * Handle subscription deletion
 */
const handleSubscriptionDeleted = async (subscription) => {
  try {
    const tenantAddOn = await TenantAddOn.findOne({
      'billingHistory.stripeSubscriptionId': subscription.id
    });

    if (!tenantAddOn) return;

    // Cancel the add-on
    await tenantAddOn.cancel(
      'Subscription cancelled in Stripe',
      null,
      'System'
    );

    console.log(`Subscription deleted for tenant add-on: ${tenantAddOn._id}`);
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
  }
};

/**
 * Cancel Stripe subscription
 */
const cancelAddOnSubscription = async (subscriptionId, cancelAtPeriodEnd = true) => {
  try {
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: cancelAtPeriodEnd
    });

    return {
      success: true,
      subscriptionId: subscription.id,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000)
    };
  } catch (error) {
    console.error('Error cancelling Stripe subscription:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Create refund for add-on payment
 */
const createAddOnRefund = async (paymentIntentId, amount, reason) => {
  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amount ? Math.round(amount * 100) : undefined, // Partial refund if amount specified
      reason: reason || 'requested_by_customer',
      metadata: {
        type: 'addon_refund'
      }
    });

    return {
      success: true,
      refundId: refund.id,
      amount: refund.amount / 100,
      status: refund.status
    };
  } catch (error) {
    console.error('Error creating Stripe refund:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  processAddOnPayment,
  createAddOnSubscription,
  createAddOnPrice,
  createAddOnProduct,
  handleAddOnWebhook,
  cancelAddOnSubscription,
  createAddOnRefund
};