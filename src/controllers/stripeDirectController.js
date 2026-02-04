const { BillingPlan } = require('../models/TenancyBilling');
const Lead = require('../models/Lead');
const Tenancy = require('../models/Tenancy');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { NOTIFICATION_TYPES } = require('../config/constants');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const mongoose = require('mongoose');

// Initialize Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.warn('WARNING: STRIPE_SECRET_KEY is not set. Payment features will not work.');
}
const stripe = require('stripe')(stripeSecretKey || 'sk_test_placeholder');

/**
 * Create direct Stripe checkout session without customer info collection
 * POST /api/public/create-direct-checkout
 */
const createDirectCheckout = async (req, res) => {
  try {
    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured. Please contact support.'
      });
    }

    const { planName, billingCycle, successUrl, cancelUrl, metadata = {} } = req.body;

    // Get plan details from database
    const plan = await BillingPlan.findOne({ name: planName, isActive: true });
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found or not available'
      });
    }

    const amount = billingCycle === 'yearly' ? plan.price.yearly : plan.price.monthly;

    // Handle free plans
    if (amount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Free plans do not require payment. Please use the signup flow.'
      });
    }

    // Calculate tax (18% GST)
    const subtotal = amount;
    const tax = Math.round(subtotal * 0.18);
    const total = subtotal + tax;

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment', // One-time payment, not subscription
      line_items: [
        {
          price_data: {
            currency: 'inr',
            product_data: {
              name: `${plan.displayName} Plan`,
              description: `${billingCycle === 'yearly' ? 'Annual' : 'Monthly'} subscription to LaundryLobby ${plan.displayName} plan`,
              images: ['https://laundrylobby.com/logo.png'], // Add your logo URL
            },
            unit_amount: total * 100, // Stripe expects amount in paise
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: 'direct_checkout',
        planName,
        billingCycle,
        subtotal: subtotal.toString(),
        tax: tax.toString(),
        total: total.toString(),
        source: metadata.source || 'direct_buy_now',
        ...metadata
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      customer_creation: 'always',
      phone_number_collection: {
        enabled: true
      },
      custom_fields: [
        {
          key: 'business_name',
          label: {
            type: 'custom',
            custom: 'Business Name'
          },
          type: 'text',
          text: {
            minimum_length: 2,
            maximum_length: 100
          }
        }
      ]
    });

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
        amount: {
          subtotal,
          tax,
          total
        }
      }
    });
  } catch (error) {
    console.error('Direct checkout error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create checkout session',
      error: process.env.NODE_ENV === 'development' ? error.type : undefined
    });
  }
};

/**
 * Create quick checkout with customer info
 * POST /api/public/create-quick-checkout
 */
const createQuickCheckout = async (req, res) => {
  try {
    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured. Please contact support.'
      });
    }

    const { planName, billingCycle, customerInfo, successUrl, cancelUrl, metadata = {} } = req.body;

    // Get plan details
    const plan = await BillingPlan.findOne({ name: planName, isActive: true });
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found or not available'
      });
    }

    const amount = billingCycle === 'yearly' ? plan.price.yearly : plan.price.monthly;

    // Handle free plans
    if (amount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Free plans do not require payment. Please use the signup flow.'
      });
    }

    // Calculate pricing
    const subtotal = amount;
    const tax = Math.round(subtotal * 0.18);
    const total = subtotal + tax;

    // Create or find customer in Stripe
    let customer;
    const existingCustomers = await stripe.customers.list({
      email: customerInfo.email,
      limit: 1
    });

    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      // Update customer info
      await stripe.customers.update(customer.id, {
        name: customerInfo.name,
        metadata: {
          businessName: customerInfo.businessName,
          source: 'quick_checkout'
        }
      });
    } else {
      customer = await stripe.customers.create({
        email: customerInfo.email,
        name: customerInfo.name,
        metadata: {
          businessName: customerInfo.businessName,
          source: 'quick_checkout'
        }
      });
    }

    // Create checkout session with customer
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'inr',
            product_data: {
              name: `${plan.displayName} Plan`,
              description: `${billingCycle === 'yearly' ? 'Annual' : 'Monthly'} subscription for ${customerInfo.businessName}`,
              images: ['https://laundrylobby.com/logo.png'],
            },
            unit_amount: total * 100,
          },
          quantity: 1,
        },
      ],
      metadata: {
        type: 'quick_checkout',
        planName,
        billingCycle,
        subtotal: subtotal.toString(),
        tax: tax.toString(),
        total: total.toString(),
        customerName: customerInfo.name,
        customerEmail: customerInfo.email,
        businessName: customerInfo.businessName,
        source: metadata.source || 'quick_buy_modal',
        ...metadata
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
      phone_number_collection: {
        enabled: true
      }
    });

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
        customerId: customer.id,
        amount: {
          subtotal,
          tax,
          total
        }
      }
    });
  } catch (error) {
    console.error('Quick checkout error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create checkout session',
      error: process.env.NODE_ENV === 'development' ? error.type : undefined
    });
  }
};

/**
 * Get payment success details
 * GET /api/public/payment-success/:sessionId
 */
const getPaymentSuccess = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'customer']
    });

    if (session.payment_status !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Payment not completed'
      });
    }

    // Extract details
    const lineItem = session.line_items.data[0];
    const customer = session.customer;

    res.json({
      success: true,
      data: {
        orderId: session.id.slice(-8).toUpperCase(),
        planName: session.metadata.planName || 'Unknown',
        planDisplayName: lineItem.description,
        billingCycle: session.metadata.billingCycle || 'monthly',
        amount: parseInt(session.metadata.total) || (session.amount_total / 100),
        subtotal: parseInt(session.metadata.subtotal) || 0,
        tax: parseInt(session.metadata.tax) || 0,
        customerEmail: customer?.email || session.metadata.customerEmail,
        customerName: customer?.name || session.metadata.customerName,
        businessName: session.metadata.businessName || customer?.metadata?.businessName,
        paymentStatus: session.payment_status,
        paymentIntent: session.payment_intent,
        sessionId: session.id
      }
    });
  } catch (error) {
    console.error('Payment success error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve payment details'
    });
  }
};

/**
 * Stripe Webhook Handler for direct payments with enhanced logging
 * POST /api/public/stripe-webhook
 */
const handleDirectStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const timestamp = new Date().toISOString();
  
  console.log(`🔔 [${timestamp}] Webhook received from Stripe`);
  console.log(`📋 Headers:`, {
    'stripe-signature': sig ? 'Present' : 'Missing',
    'content-type': req.headers['content-type'],
    'user-agent': req.headers['user-agent']
  });
  console.log(`📦 Body length:`, req.body ? req.body.length : 0);
  
  let event;

  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      console.error(`❌ [${timestamp}] STRIPE_WEBHOOK_SECRET not configured`);
      return res.status(500).send('Webhook secret not configured');
    }

    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    
    console.log(`✅ [${timestamp}] Webhook signature verified successfully`);
    console.log(`🎯 Event type: ${event.type}`);
    console.log(`🆔 Event ID: ${event.id}`);
    console.log(`📅 Event created: ${new Date(event.created * 1000).toISOString()}`);
    
  } catch (err) {
    console.error(`❌ [${timestamp}] Webhook signature verification failed:`, err.message);
    console.error(`🔑 Expected secret starts with: ${process.env.STRIPE_WEBHOOK_SECRET?.substring(0, 10)}...`);
    console.error(`📝 Received signature: ${sig?.substring(0, 50)}...`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event with enhanced logging and retry logic
  try {
    console.log(`🔄 [${timestamp}] Processing event: ${event.type}`);
    
    switch (event.type) {
      case 'checkout.session.completed':
        console.log(`💳 Processing checkout completion for session: ${event.data.object.id}`);
        console.log(`💰 Amount: ₹${event.data.object.amount_total ? (event.data.object.amount_total / 100).toLocaleString() : 'N/A'}`);
        console.log(`📧 Customer: ${event.data.object.customer_details?.email || 'N/A'}`);
        
        await processWebhookWithRetry(event.data.object, 'checkout_completed');
        console.log(`✅ Checkout completion processed successfully`);
        break;
      
      case 'payment_intent.succeeded':
        console.log(`✅ Processing successful payment: ${event.data.object.id}`);
        console.log(`💰 Amount: ₹${event.data.object.amount ? (event.data.object.amount / 100).toLocaleString() : 'N/A'}`);
        
        await handlePaymentSucceeded(event.data.object);
        console.log(`✅ Payment success processed`);
        break;
      
      case 'payment_intent.payment_failed':
        console.log(`❌ Processing failed payment: ${event.data.object.id}`);
        console.log(`💸 Amount: ₹${event.data.object.amount ? (event.data.object.amount / 100).toLocaleString() : 'N/A'}`);
        console.log(`🚫 Failure reason: ${event.data.object.last_payment_error?.message || 'Unknown'}`);
        
        await handlePaymentFailed(event.data.object);
        console.log(`✅ Payment failure processed`);
        break;
      
      default:
        console.log(`ℹ️  Unhandled event type: ${event.type} - Event ID: ${event.id}`);
    }
    
    console.log(`🎉 [${timestamp}] Event processed successfully`);
    
    // Log successful webhook processing
    await logWebhookEvent(event, 'success', null);
    
  } catch (error) {
    console.error(`❌ [${timestamp}] Webhook processing error:`, error.message);
    console.error(`📋 Error details:`, {
      message: error.message,
      stack: error.stack?.substring(0, 500),
      eventType: event.type,
      eventId: event.id
    });
    
    // Log failed webhook processing
    await logWebhookEvent(event, 'failed', error.message);
    
    // Send error notification to admins
    await notifyWebhookError(error, event);
    
    return res.status(500).json({ 
      error: 'Webhook processing failed',
      eventId: event.id,
      eventType: event.type,
      timestamp 
    });
  }

  res.json({ 
    received: true, 
    eventId: event.id,
    eventType: event.type,
    timestamp,
    status: 'processed'
  });
};

/**
 * Handle successful checkout completion
 */
async function handleCheckoutCompleted(session) {
  try {
    console.log('🔄 Processing checkout completion:', session.id);

    // Extract customer and payment details
    const customer = await stripe.customers.retrieve(session.customer);
    const metadata = session.metadata;

    // Extract customer info from session
    const customerName = customer.name || session.customer_details?.name || metadata.customerName || 'Direct Customer';
    const customerEmail = customer.email || session.customer_details?.email || metadata.customerEmail;
    const customerPhone = session.customer_details?.phone || '';
    const businessName = metadata.businessName || session.custom_fields?.find(f => f.key === 'business_name')?.text?.value || customer.metadata?.businessName || `${customerName}'s Business`;

    console.log('📋 Customer Details:', {
      name: customerName,
      email: customerEmail,
      business: businessName,
      plan: metadata.planName
    });

    // Skip lead creation for direct purchases - create tenancy directly
    console.log('🏢 Creating business account directly (skipping lead creation)...');

    // Create tenancy and admin user immediately for paid plans
    if (metadata.planName !== 'free') {
      const tenancy = await createBusinessAccountWithPlanPermissions({
        customerName,
        customerEmail,
        customerPhone,
        businessName,
        planName: metadata.planName,
        billingCycle: metadata.billingCycle,
        stripeSessionId: session.id,
        stripeCustomerId: customer.id,
        paymentIntent: session.payment_intent,
        amount: parseInt(metadata.total) || (session.amount_total / 100),
        source: metadata.source || 'direct_checkout'
      });

      console.log('✅ Business account created:', tenancy.slug);

      // Record this as a direct conversion in sales analytics
      await recordDirectConversion(tenancy, metadata);
    }

    // Notify superadmins about direct purchase
    await notifyDirectPurchaseReceived(customerEmail, businessName, metadata);

    console.log('✅ Direct purchase processed successfully for:', customerEmail);
  } catch (error) {
    console.error('❌ Error handling checkout completion:', error);
    throw error;
  }
}

/**
 * Create business account with plan-based permissions
 */
async function createBusinessAccountWithPlanPermissions(customerData) {
  try {
    const { 
      customerName, 
      customerEmail, 
      customerPhone, 
      businessName, 
      planName, 
      billingCycle,
      stripeSessionId,
      stripeCustomerId,
      paymentIntent,
      amount,
      source
    } = customerData;

    console.log('🏗️ Creating business account for plan:', planName);

    // Get billing plan details from database
    const { BillingPlan } = require('../models/TenancyBilling');
    const billingPlan = await BillingPlan.findOne({ name: planName, isActive: true });
    
    if (!billingPlan) {
      throw new Error(`Billing plan '${planName}' not found`);
    }

    console.log('📋 Plan features:', billingPlan.features);

    // Generate unique subdomain
    const subdomain = generateUniqueSubdomain(businessName);
    
    // Check if tenancy already exists
    const existingTenancy = await Tenancy.findOne({ 
      $or: [
        { slug: subdomain },
        { 'settings.contactEmail': customerEmail }
      ]
    });
    
    if (existingTenancy) {
      console.log('⚠️ Tenancy already exists, updating payment details...');
      existingTenancy.paymentDetails = {
        stripeCustomerId,
        stripeSessionId,
        lastPayment: {
          amount,
          date: new Date(),
          method: 'stripe',
          paymentIntent
        }
      };
      await existingTenancy.save();
      return existingTenancy;
    }

    // Create a temporary ObjectId for owner (will be updated after user creation)
    const tempOwnerId = new mongoose.Types.ObjectId();
    
    // Create tenancy with plan-specific settings
    const tenancy = await Tenancy.create({
      name: businessName,
      slug: subdomain,
      plan: planName,
      billingCycle: billingCycle || 'monthly',
      status: 'active',
      owner: tempOwnerId, // Temporary owner, will be updated after user creation
      subscription: {
        status: 'active',
        plan: planName,
        billingCycle: billingCycle || 'monthly',
        startDate: new Date(),
        nextBillingDate: calculateNextBillingDate(billingCycle),
        features: billingPlan.features || new Map(),
        limits: {
          maxOrders: billingPlan.legacyFeatures?.maxOrders || 1000,
          maxStaff: billingPlan.legacyFeatures?.maxStaff || 10,
          maxCustomers: billingPlan.legacyFeatures?.maxCustomers || 1000,
          maxBranches: billingPlan.legacyFeatures?.maxBranches || 1
        }
      },
      paymentDetails: {
        stripeCustomerId,
        stripeSessionId,
        lastPayment: {
          amount,
          date: new Date(),
          method: 'stripe',
          paymentIntent
        }
      },
      settings: {
        businessName,
        contactEmail: customerEmail,
        contactPhone: customerPhone,
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        language: 'en'
      },
      createdBy: 'stripe_direct_purchase',
      source: source || 'direct_checkout'
    });

    console.log('✅ Tenancy created:', tenancy.slug);

    // Generate secure temporary password
    const tempPassword = generateSecureTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    // Map plan features to user permissions
    const userPermissions = mapPlanToUserPermissions(billingPlan);

    // Create admin user with plan-based permissions
    const adminUser = await User.create({
      name: customerName,
      email: customerEmail,
      password: hashedPassword,
      phone: customerPhone || '9999999999', // Default valid phone number if not provided
      role: 'admin',
      tenancy: tenancy._id,
      isActive: true,
      isEmailVerified: true,
      permissions: userPermissions,
      profile: {
        firstName: customerName.split(' ')[0] || customerName,
        lastName: customerName.split(' ').slice(1).join(' ') || '',
        designation: 'Business Owner',
        avatar: null
      },
      settings: {
        notifications: {
          email: true,
          sms: false,
          push: true
        },
        theme: 'light',
        language: 'en'
      },
      loginCredentials: {
        tempPassword,
        mustChangePassword: true,
        firstLogin: true
      },
      createdBy: 'stripe_direct_purchase'
    });

    // Update tenancy with owner reference
    tenancy.owner = adminUser._id;
    await tenancy.save();

    console.log('✅ Admin user created:', adminUser.email);

    // Record payment in TenancyPayment collection
    const { TenancyPayment } = require('../models/TenancyBilling');
    await TenancyPayment.create({
      tenancy: tenancy._id,
      amount,
      currency: 'INR',
      status: 'completed',
      paymentMethod: 'card',
      transactionId: paymentIntent,
      gateway: 'stripe',
      gatewayResponse: {
        sessionId: stripeSessionId,
        customerId: stripeCustomerId
      },
      notes: `Direct plan purchase: ${planName} (${billingCycle})`
    });

    // Send welcome email with login credentials
    await sendBusinessWelcomeEmail({
      customerName,
      customerEmail,
      businessName,
      subdomain: tenancy.slug,
      tempPassword,
      planName: billingPlan.displayName,
      loginUrl: `https://${tenancy.slug}.laundrylobby.com`
    });

    console.log('🎉 Business account setup complete:', {
      business: businessName,
      subdomain: tenancy.slug,
      admin: adminUser.email,
      plan: planName
    });

    return tenancy;
  } catch (error) {
    console.error('❌ Error creating business account:', error);
    throw error;
  }
}

/**
 * Map billing plan features to user permissions
 */
function mapPlanToUserPermissions(billingPlan) {
  const features = billingPlan.features || new Map();
  const legacy = billingPlan.legacyFeatures || {};

  // Convert Map to object if needed
  const planFeatures = features instanceof Map ? Object.fromEntries(features) : features;

  return {
    // Core permissions - always available
    dashboard: { view: true },
    profile: { view: true, update: true },
    
    // Orders management
    orders: {
      view: true,
      create: true,
      update: true,
      delete: planFeatures.advanced_management || legacy.advancedAnalytics || false,
      assign: true,
      cancel: true,
      process: true,
      export: planFeatures.data_export || legacy.apiAccess || false
    },
    
    // Customer management
    customers: {
      view: true,
      create: true,
      update: true,
      delete: planFeatures.advanced_management || false,
      export: planFeatures.data_export || false,
      maxCustomers: legacy.maxCustomers || 500
    },
    
    // Staff management
    staff: {
      view: true,
      create: planFeatures.staff_management || legacy.maxStaff > 5,
      update: planFeatures.staff_management || legacy.maxStaff > 5,
      delete: planFeatures.advanced_management || false,
      assignShift: planFeatures.staff_management || false,
      manageAttendance: planFeatures.staff_management || false,
      export: planFeatures.data_export || false,
      maxStaff: legacy.maxStaff || 5
    },
    
    // Inventory management
    inventory: {
      view: true,
      create: true,
      update: true,
      delete: planFeatures.advanced_management || false,
      restock: true,
      writeOff: planFeatures.advanced_management || false,
      export: planFeatures.data_export || false
    },
    
    // Services management
    services: {
      view: true,
      create: true,
      update: true,
      delete: planFeatures.advanced_management || false,
      toggle: true,
      updatePricing: true,
      export: planFeatures.data_export || false
    },
    
    // Analytics and reports
    analytics: {
      view: true,
      basic: true,
      advanced: planFeatures.advanced_analytics || legacy.advancedAnalytics || false,
      export: planFeatures.data_export || legacy.apiAccess || false,
      customReports: planFeatures.custom_reports || false
    },
    
    // Financial management
    financial: {
      view: true,
      viewReports: planFeatures.financial_reports || legacy.advancedAnalytics || false,
      export: planFeatures.data_export || false
    },
    
    // Settings and configuration
    settings: {
      view: true,
      update: true,
      branding: planFeatures.custom_branding || legacy.customBranding || false,
      domain: planFeatures.custom_domain || legacy.customDomain || false,
      api: planFeatures.api_access || legacy.apiAccess || false
    },
    
    // Support and help
    support: {
      basic: true,
      priority: planFeatures.priority_support || legacy.prioritySupport || false,
      phone: planFeatures.phone_support || false,
      dedicated: planFeatures.dedicated_support || false
    }
  };
}

/**
 * Generate unique subdomain
 */
function generateUniqueSubdomain(businessName) {
  let subdomain = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 15);
  
  // Add random suffix for uniqueness
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `${subdomain}${randomSuffix}`;
}

/**
 * Generate secure temporary password
 */
function generateSecureTempPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Calculate next billing date
 */
function calculateNextBillingDate(billingCycle) {
  const now = new Date();
  if (billingCycle === 'yearly') {
    return new Date(now.setFullYear(now.getFullYear() + 1));
  } else {
    return new Date(now.setMonth(now.getMonth() + 1));
  }
}

/**
 * Send business welcome email
 */
async function sendBusinessWelcomeEmail(emailData) {
  try {
    const emailService = require('../services/emailService');
    const result = await emailService.sendBusinessWelcomeEmail(emailData);
    
    if (result.success) {
      console.log('✅ Welcome email sent successfully');
    } else {
      console.error('❌ Welcome email failed:', result.error);
    }
    
    // Also send admin notification
    await emailService.sendAdminNotification({
      businessName: emailData.businessName,
      customerEmail: emailData.customerEmail,
      planName: emailData.planName,
      amount: 'N/A' // Will be updated with actual amount
    });
    
  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
  }
}

/**
 * Record direct conversion for sales analytics
 */
async function recordDirectConversion(tenancy, metadata) {
  try {
    // Create a lead record for sales tracking
    const lead = await Lead.create({
      businessName: tenancy.name,
      businessType: 'laundry',
      contactPerson: {
        name: tenancy.owner?.name || 'Direct Customer',
        email: tenancy.settings.contactEmail,
        phone: tenancy.settings.contactPhone || ''
      },
      source: metadata.source || 'direct_checkout',
      status: 'converted',
      interestedPlan: metadata.planName,
      estimatedRevenue: parseInt(metadata.total) || 0,
      isConverted: true,
      convertedDate: new Date(),
      tenancyId: tenancy._id,
      paymentDetails: {
        stripeSessionId: metadata.stripeSessionId,
        amount: parseInt(metadata.total) || 0,
        paidAt: new Date()
      }
    });

    console.log('📊 Direct conversion recorded for sales analytics:', lead._id);
    return lead;
  } catch (error) {
    console.error('❌ Error recording direct conversion:', error);
  }
}

/**
 * Notify about direct purchase
 */
async function notifyDirectPurchaseReceived(customerEmail, businessName, metadata) {
  try {
    const SuperAdmin = require('../models/SuperAdmin');
    const superadmins = await SuperAdmin.find({ isActive: true }).select('_id');

    const notifications = superadmins.map(admin => ({
      recipient: admin._id,
      type: NOTIFICATION_TYPES.PAYMENT_RECEIVED || 'payment_received',
      title: '🎉 Direct Plan Purchase',
      message: `${businessName} purchased ${metadata.planName} plan (₹${metadata.total}) via direct checkout`,
      data: {
        additionalData: {
          customerEmail,
          businessName,
          planName: metadata.planName,
          amount: metadata.total,
          source: metadata.source || 'direct_checkout'
        }
      },
      channels: { inApp: true, email: false }
    }));

    await Promise.all(
      notifications.map(notif => Notification.createNotification(notif))
    );

    console.log('🔔 Direct purchase notifications sent to superadmins');
  } catch (error) {
    console.error('❌ Failed to create direct purchase notifications:', error);
  }
}
/**
 * Process webhook with retry mechanism
 */
async function processWebhookWithRetry(eventData, eventType, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Processing attempt ${attempt}/${maxRetries} for ${eventType}`);
      
      if (eventType === 'checkout_completed') {
        await handleCheckoutCompleted(eventData);
      }
      
      console.log(`✅ Processing successful on attempt ${attempt}`);
      return { success: true, attempt };
      
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        console.error(`🚨 All ${maxRetries} attempts failed for ${eventType}`);
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Log webhook events for monitoring
 */
async function logWebhookEvent(event, status, errorMessage = null) {
  try {
    // Create a simple webhook log collection
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_URI);
    
    await client.connect();
    const db = client.db();
    
    await db.collection('webhook_logs').insertOne({
      eventId: event.id,
      eventType: event.type,
      status, // 'success' or 'failed'
      errorMessage,
      eventData: {
        amount: event.data.object.amount_total || event.data.object.amount,
        customerEmail: event.data.object.customer_details?.email || event.data.object.receipt_email,
        sessionId: event.data.object.id
      },
      createdAt: new Date(),
      processedAt: new Date()
    });
    
    await client.close();
    console.log(`📝 Webhook event logged: ${event.id} - ${status}`);
    
  } catch (error) {
    console.error('❌ Failed to log webhook event:', error.message);
    // Don't throw error here to avoid breaking webhook processing
  }
}

/**
 * Notify admins about webhook errors
 */
async function notifyWebhookError(error, event) {
  try {
    const SuperAdmin = require('../models/SuperAdmin');
    const Notification = require('../models/Notification');
    const { NOTIFICATION_TYPES } = require('../config/constants');
    
    const superadmins = await SuperAdmin.find({ isActive: true }).select('_id');
    
    if (superadmins.length === 0) {
      console.log('⚠️ No active superadmins found for webhook error notification');
      return;
    }
    
    const notifications = superadmins.map(admin => ({
      recipient: admin._id,
      type: NOTIFICATION_TYPES.SYSTEM_ERROR || 'system_error',
      title: '🚨 Webhook Processing Failed',
      message: `Payment webhook failed for ${event.type}: ${error.message}. Manual processing may be required.`,
      data: {
        additionalData: {
          eventType: event.type,
          eventId: event.id,
          error: error.message,
          timestamp: new Date().toISOString(),
          sessionId: event.data.object.id,
          amount: event.data.object.amount_total || event.data.object.amount,
          customerEmail: event.data.object.customer_details?.email || 'N/A'
        }
      },
      channels: { inApp: true, email: true }
    }));

    await Promise.all(
      notifications.map(notif => Notification.createNotification(notif))
    );
    
    console.log('🔔 Webhook error notifications sent to superadmins');
  } catch (notifError) {
    console.error('❌ Failed to send webhook error notifications:', notifError);
  }
}

module.exports = {
  createDirectCheckout,
  createQuickCheckout,
  getPaymentSuccess,
  handleDirectStripeWebhook
};

/**
 * Handle successful payment intent with enhanced logging
 */
async function handlePaymentSucceeded(paymentIntent) {
  console.log('✅ Payment succeeded:', paymentIntent.id);
  console.log(`💰 Amount: ₹${paymentIntent.amount ? (paymentIntent.amount / 100).toLocaleString() : 'N/A'}`);
  console.log(`📧 Receipt email: ${paymentIntent.receipt_email || 'N/A'}`);
  console.log(`🏦 Payment method: ${paymentIntent.payment_method_types?.join(', ') || 'N/A'}`);
  
  // Additional processing if needed
  // This is usually handled by checkout.session.completed
  // but we can add backup processing here if needed
}

/**
 * Handle failed payment intent with enhanced logging
 */
async function handlePaymentFailed(paymentIntent) {
  console.log('❌ Payment failed:', paymentIntent.id);
  console.log(`💸 Amount: ₹${paymentIntent.amount ? (paymentIntent.amount / 100).toLocaleString() : 'N/A'}`);
  console.log(`🚫 Failure reason: ${paymentIntent.last_payment_error?.message || 'Unknown'}`);
  console.log(`📧 Customer email: ${paymentIntent.receipt_email || 'N/A'}`);
  
  // Handle payment failure - notify customer or create support ticket
  try {
    // Create a support ticket for failed payment
    const Ticket = require('../models/Ticket');
    
    await Ticket.create({
      title: `Payment Failed - ${paymentIntent.id}`,
      description: `Payment of ₹${paymentIntent.amount ? (paymentIntent.amount / 100).toLocaleString() : 'N/A'} failed. Reason: ${paymentIntent.last_payment_error?.message || 'Unknown error'}`,
      priority: 'high',
      status: 'open',
      category: 'payment',
      source: 'webhook_payment_failed',
      metadata: {
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        failureReason: paymentIntent.last_payment_error?.message,
        customerEmail: paymentIntent.receipt_email
      }
    });
    
    console.log('🎫 Support ticket created for failed payment');
    
  } catch (error) {
    console.error('❌ Failed to create support ticket for failed payment:', error.message);
  }
}