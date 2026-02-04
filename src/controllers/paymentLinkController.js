const PaymentLink = require('../models/PaymentLink');
const Lead = require('../models/Lead');
const { BillingPlan } = require('../models/TenancyBilling');
const Notification = require('../models/Notification');
const { NOTIFICATION_TYPES } = require('../config/constants');
const permissionSyncService = require('../services/permissionSyncService');

// Initialize Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.warn('WARNING: STRIPE_SECRET_KEY is not set. Payment features will not work.');
}
const stripe = require('stripe')(stripeSecretKey || 'sk_test_placeholder');

/**
 * Create a payment link for a lead (superadmin only)
 * POST /api/superadmin/payment-links
 * Supports custom pricing per tenant
 */
const createPaymentLink = async (req, res) => {
  try {
    const { leadId, plan, billingCycle = 'monthly', discount = 0, notes, customAmount } = req.body;

    const lead = await Lead.findById(leadId);
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    const billingPlan = await BillingPlan.findOne({ name: plan, isActive: true });
    if (!billingPlan) {
      return res.status(400).json({
        success: false,
        message: 'Invalid plan selected'
      });
    }

    // Use custom amount if provided, otherwise use plan price
    let subtotal;
    if (customAmount && customAmount > 0) {
      subtotal = customAmount;
    } else {
      subtotal = billingCycle === 'yearly'
        ? billingPlan.price.yearly
        : billingPlan.price.monthly;
    }

    if (subtotal <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot create payment link for free plan'
      });
    }

    const discountAmount = Math.min(discount, subtotal);
    const tax = Math.round((subtotal - discountAmount) * 0.18);
    const total = subtotal - discountAmount + tax;

    const paymentLink = await PaymentLink.create({
      lead: leadId,
      plan,
      billingCycle,
      amount: {
        subtotal,
        tax,
        discount: discountAmount,
        total
      },
      notes,
      isCustomPricing: customAmount && customAmount > 0,
      createdBy: req.admin._id || req.admin.id
    });

    if (lead.status === 'new') {
      lead.status = 'contacted';
      await lead.save();
    }

    res.status(201).json({
      success: true,
      message: 'Payment link created successfully',
      data: {
        paymentLink,
        paymentUrl: `${process.env.MARKETING_URL || 'http://localhost:3004'}/pay/${paymentLink.token}`
      }
    });
  } catch (error) {
    console.error('Create payment link error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment link'
    });
  }
};

/**
 * Get all payment links (superadmin only)
 */
const getPaymentLinks = async (req, res) => {
  try {
    const { status, leadId, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (leadId) query.lead = leadId;

    const total = await PaymentLink.countDocuments(query);
    const paymentLinks = await PaymentLink.find(query)
      .populate('lead', 'name email businessName')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: {
        paymentLinks,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get payment links error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment links'
    });
  }
};

/**
 * Get payment link by ID (superadmin only)
 */
const getPaymentLinkById = async (req, res) => {
  try {
    const paymentLink = await PaymentLink.findById(req.params.id)
      .populate('lead')
      .populate('createdBy', 'name email')
      .lean();

    if (!paymentLink) {
      return res.status(404).json({
        success: false,
        message: 'Payment link not found'
      });
    }

    res.json({
      success: true,
      data: paymentLink
    });
  } catch (error) {
    console.error('Get payment link error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment link'
    });
  }
};

/**
 * Cancel a payment link (superadmin only)
 */
const cancelPaymentLink = async (req, res) => {
  try {
    const paymentLink = await PaymentLink.findById(req.params.id);

    if (!paymentLink) {
      return res.status(404).json({
        success: false,
        message: 'Payment link not found'
      });
    }

    if (paymentLink.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending payment links can be cancelled'
      });
    }

    paymentLink.status = 'cancelled';
    await paymentLink.save();

    res.json({
      success: true,
      message: 'Payment link cancelled',
      data: paymentLink
    });
  } catch (error) {
    console.error('Cancel payment link error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel payment link'
    });
  }
};

/**
 * Get payment links for a specific lead (superadmin only)
 */
const getPaymentLinksForLead = async (req, res) => {
  try {
    const paymentLinks = await PaymentLink.find({ lead: req.params.leadId })
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: paymentLinks
    });
  } catch (error) {
    console.error('Get payment links for lead error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment links'
    });
  }
};

/**
 * Mark payment as paid offline (superadmin only)
 * POST /api/superadmin/payment-links/:id/mark-paid
 * For cash, bank transfer, UPI, or other offline payments
 */
const markPaymentAsPaid = async (req, res) => {
  try {
    const { paymentMethod, transactionId, notes } = req.body;

    const paymentLink = await PaymentLink.findById(req.params.id).populate('lead');

    if (!paymentLink) {
      return res.status(404).json({
        success: false,
        message: 'Payment link not found'
      });
    }

    if (paymentLink.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Payment link is already ${paymentLink.status}`
      });
    }

    // Mark as paid with offline payment details
    await paymentLink.markAsPaid({
      method: paymentMethod || 'manual',
      transactionId: transactionId || `OFFLINE-${Date.now()}`,
      gatewayResponse: {
        type: 'offline',
        markedBy: req.admin._id || req.admin.id,
        notes: notes,
        markedAt: new Date()
      }
    });

    // Update lead status to converted
    const lead = await Lead.findById(paymentLink.lead._id || paymentLink.lead);
    if (lead) {
      lead.status = 'converted';
      await lead.save();
    }

    // Notify about payment
    await notifyPaymentReceived(paymentLink, lead);

    res.json({
      success: true,
      message: 'Payment marked as paid successfully',
      data: paymentLink
    });
  } catch (error) {
    console.error('Mark payment as paid error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark payment as paid'
    });
  }
};

// ============ PUBLIC ENDPOINTS ============

/**
 * Get payment link details by token (public)
 */
const getPaymentLinkByToken = async (req, res) => {
  try {
    const paymentLink = await PaymentLink.findByToken(req.params.token);

    if (!paymentLink) {
      return res.status(404).json({
        success: false,
        message: 'Payment link not found'
      });
    }

    if (paymentLink.isExpired) {
      paymentLink.status = 'expired';
      await paymentLink.save();
    }

    const billingPlan = await BillingPlan.findOne({ name: paymentLink.plan });

    res.json({
      success: true,
      data: {
        token: paymentLink.token,
        status: paymentLink.status,
        plan: {
          name: paymentLink.plan,
          displayName: billingPlan?.displayName || paymentLink.plan,
          features: billingPlan?.features
        },
        billingCycle: paymentLink.billingCycle,
        amount: paymentLink.amount,
        currency: paymentLink.currency,
        expiresAt: paymentLink.expiresAt,
        lead: {
          name: paymentLink.lead.name,
          email: paymentLink.lead.email,
          businessName: paymentLink.lead.businessName
        }
      }
    });
  } catch (error) {
    console.error('Get payment link by token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment details'
    });
  }
};

/**
 * Create Stripe Checkout Session (public)
 * POST /api/public/pay/:token/create-checkout
 */
const createStripeCheckout = async (req, res) => {
  try {
    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured. Please contact support.'
      });
    }

    const paymentLink = await PaymentLink.findByToken(req.params.token);

    if (!paymentLink) {
      return res.status(404).json({
        success: false,
        message: 'Payment link not found'
      });
    }

    if (paymentLink.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Payment link is ${paymentLink.status}`
      });
    }

    if (paymentLink.isExpired) {
      paymentLink.status = 'expired';
      await paymentLink.save();
      return res.status(400).json({
        success: false,
        message: 'Payment link has expired'
      });
    }

    const billingPlan = await BillingPlan.findOne({ name: paymentLink.plan });
    const marketingUrl = process.env.MARKETING_URL || 'http://localhost:3002';

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: paymentLink.lead.email,
      line_items: [
        {
          price_data: {
            currency: 'inr',
            product_data: {
              name: `${billingPlan?.displayName || paymentLink.plan} Plan`,
              description: `${paymentLink.billingCycle === 'yearly' ? 'Annual' : 'Monthly'} subscription for LaundryLobby`,
            },
            unit_amount: paymentLink.amount.total * 100, // Stripe uses paise
          },
          quantity: 1,
        },
      ],
      metadata: {
        paymentLinkToken: paymentLink.token,
        leadId: paymentLink.lead._id.toString(),
        plan: paymentLink.plan,
        billingCycle: paymentLink.billingCycle
      },
      success_url: `${marketingUrl}/pay/${paymentLink.token}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${marketingUrl}/pay/${paymentLink.token}?cancelled=true`,
    });

    // Store Stripe session ID
    paymentLink.stripeSessionId = session.id;
    await paymentLink.save();

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url
      }
    });
  } catch (error) {
    console.error('Create Stripe checkout error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create checkout session',
      error: process.env.NODE_ENV === 'development' ? error.type : undefined
    });
  }
};

/**
 * Verify Stripe payment and mark as paid (public)
 * POST /api/public/pay/:token/verify
 */
const verifyStripePayment = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const paymentLink = await PaymentLink.findByToken(req.params.token);

    if (!paymentLink) {
      return res.status(404).json({
        success: false,
        message: 'Payment link not found'
      });
    }

    // Verify with Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Payment not completed'
      });
    }

    // Mark as paid
    await paymentLink.markAsPaid({
      method: 'card',
      transactionId: session.payment_intent,
      gatewayResponse: {
        sessionId: session.id,
        paymentIntent: session.payment_intent,
        customerEmail: session.customer_email,
        amountTotal: session.amount_total
      }
    });

    // Update lead status
    const lead = await Lead.findById(paymentLink.lead);
    if (lead) {
      lead.status = 'converted';
      await lead.save();
    }

    // Notify superadmins
    await notifyPaymentReceived(paymentLink, lead);

    res.json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        transactionId: session.payment_intent,
        amount: paymentLink.amount.total,
        plan: paymentLink.plan
      }
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify payment'
    });
  }
};

/**
 * Stripe Webhook Handler
 * POST /api/public/pay/webhook
 */
const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      const paymentLink = await PaymentLink.findOne({
        token: session.metadata.paymentLinkToken
      });

      if (paymentLink && paymentLink.status === 'pending') {
        await paymentLink.markAsPaid({
          method: 'card',
          transactionId: session.payment_intent,
          gatewayResponse: {
            sessionId: session.id,
            paymentIntent: session.payment_intent,
            webhookEvent: event.id
          }
        });

        const lead = await Lead.findById(paymentLink.lead);
        if (lead) {
          lead.status = 'converted';
          await lead.save();
        }

        await notifyPaymentReceived(paymentLink, lead);

        // Sync permissions if it's a tenancy payment (requires tenancy reference)
        if (lead && lead.tenancy) {
          await permissionSyncService.syncTenancyPermissions(lead.tenancy);
        }
      }
    } catch (error) {
      console.error('Webhook processing error:', error);
    }
  }

  res.json({ received: true });
};

/**
 * Helper to notify superadmins about payment
 */
async function notifyPaymentReceived(paymentLink, lead) {
  try {
    const NotificationService = require('../services/notificationService');
    await NotificationService.notifyAllSuperAdmins({
      type: 'tenancy_payment_received',
      title: 'Payment Received! 💳',
      message: `${lead?.businessName || 'A business'} has paid ₹${paymentLink.amount.total} for ${paymentLink.plan} plan`,
      icon: 'credit-card',
      severity: 'success',
      data: {
        paymentLinkId: paymentLink._id,
        leadId: paymentLink.lead,
        amount: paymentLink.amount.total,
        plan: paymentLink.plan,
        link: '/billing'
      }
    });
  } catch (error) {
    console.error('Failed to create payment notifications:', error);
  }
}

module.exports = {
  createPaymentLink,
  getPaymentLinks,
  getPaymentLinkById,
  cancelPaymentLink,
  getPaymentLinksForLead,
  markPaymentAsPaid,
  getPaymentLinkByToken,
  createStripeCheckout,
  verifyStripePayment,
  handleStripeWebhook
};
