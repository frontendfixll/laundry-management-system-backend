/**
 * Complete Direct Payment Processing Script
 * This script processes Stripe payments and creates complete business accounts
 */

const path = require('path');
require('dotenv').config();

const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Import models
const Lead = require('./src/models/Lead');
const Tenancy = require('./src/models/Tenancy');
const User = require('./src/models/User');
const { BillingPlan, TenancyPayment } = require('./src/models/TenancyBilling');

async function processDirectPaymentComplete() {
  console.log('🚀 COMPLETE DIRECT PAYMENT PROCESSING');
  console.log('='.repeat(60));
  
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');
    
    // Get recent Stripe sessions
    console.log('\n📋 Recent Stripe Sessions:');
    const sessions = await stripe.checkout.sessions.list({ limit: 10 });
    
    // Find the most recent paid session
    const paidSessions = sessions.data.filter(s => s.payment_status === 'paid');
    
    if (paidSessions.length === 0) {
      console.log('❌ No paid sessions found to process');
      return;
    }
    
    console.log(`\n🔍 Found ${paidSessions.length} paid sessions:`);
    paidSessions.forEach((session, index) => {
      console.log(`${index + 1}. Session: ${session.id}`);
      console.log(`   Amount: ₹${session.amount_total / 100}`);
      console.log(`   Customer: ${session.customer_details?.email || 'N/A'}`);
      console.log(`   Plan: ${session.metadata?.planName || 'N/A'}`);
      console.log(`   Created: ${new Date(session.created * 1000).toLocaleString()}`);
      console.log('');
    });
    
    // Process the most recent session
    const sessionToProcess = paidSessions[0];
    console.log(`🔄 Processing session: ${sessionToProcess.id}`);
    
    // Extract customer and plan details
    const customerEmail = sessionToProcess.customer_details?.email;
    const customerName = sessionToProcess.customer_details?.name || 'Customer';
    const customerPhone = sessionToProcess.customer_details?.phone || '';
    const businessName = sessionToProcess.metadata?.businessName || 
                        sessionToProcess.custom_fields?.find(f => f.key === 'business_name')?.text?.value ||
                        `${customerName}'s Business`;
    const planName = sessionToProcess.metadata?.planName || 'basic';
    const billingCycle = sessionToProcess.metadata?.billingCycle || 'monthly';
    const amount = sessionToProcess.amount_total / 100;
    
    console.log('\n📋 Customer Details:');
    console.log(`Name: ${customerName}`);
    console.log(`Email: ${customerEmail}`);
    console.log(`Business: ${businessName}`);
    console.log(`Plan: ${planName}`);
    console.log(`Amount: ₹${amount}`);
    
    if (!customerEmail) {
      console.log('❌ No customer email found in session');
      return;
    }
    
    // Get billing plan details
    console.log('\n🔍 Getting billing plan details...');
    const billingPlan = await BillingPlan.findOne({ name: planName, isActive: true });
    
    if (!billingPlan) {
      console.log(`❌ Billing plan '${planName}' not found`);
      return;
    }
    
    console.log(`✅ Plan found: ${billingPlan.displayName}`);
    console.log(`Features:`, billingPlan.features);
    
    // Check if business already exists
    const existingTenancy = await Tenancy.findOne({
      $or: [
        { 'settings.contactEmail': customerEmail },
        { name: businessName }
      ]
    });
    
    if (existingTenancy) {
      console.log('⚠️ Business already exists:', existingTenancy.slug);
      console.log('Updating payment details...');
      
      existingTenancy.paymentDetails = {
        stripeSessionId: sessionToProcess.id,
        lastPayment: {
          amount,
          date: new Date(),
          method: 'stripe'
        }
      };
      await existingTenancy.save();
      
      // Record payment
      await TenancyPayment.create({
        tenancy: existingTenancy._id,
        amount,
        currency: 'INR',
        status: 'completed',
        paymentMethod: 'card',
        transactionId: sessionToProcess.payment_intent,
        gateway: 'stripe',
        notes: `Plan purchase: ${planName} (${billingCycle})`
      });
      
      console.log('✅ Existing business updated with new payment');
      return;
    }
    
    // Generate unique subdomain
    const subdomain = generateUniqueSubdomain(businessName);
    console.log(`\n🏗️ Creating business account with subdomain: ${subdomain}`);
    
    // Create a temporary ObjectId for owner (will be updated after user creation)
    const tempOwnerId = new mongoose.Types.ObjectId();
    
    // Create tenancy with plan-specific settings
    const tenancy = await Tenancy.create({
      name: businessName,
      slug: subdomain,
      plan: planName,
      billingCycle: billingCycle,
      status: 'active',
      owner: tempOwnerId, // Temporary owner, will be updated after user creation
      subscription: {
        status: 'active',
        plan: planName,
        billingCycle: billingCycle,
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
        stripeSessionId: sessionToProcess.id,
        lastPayment: {
          amount,
          date: new Date(),
          method: 'stripe',
          paymentIntent: sessionToProcess.payment_intent
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
      source: 'direct_checkout'
    });
    
    console.log('✅ Tenancy created:', tenancy.slug);
    
    // Generate secure temporary password
    const tempPassword = generateSecureTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    
    // Map plan features to user permissions
    const userPermissions = mapPlanToUserPermissions(billingPlan);
    console.log('\n🔐 User permissions based on plan:');
    console.log('Orders:', userPermissions.orders);
    console.log('Staff:', userPermissions.staff);
    console.log('Analytics:', userPermissions.analytics);
    
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
      createdBy: 'system'
    });
    
    // Update tenancy with owner reference
    tenancy.owner = adminUser._id;
    await tenancy.save();
    
    console.log('✅ Admin user created:', adminUser.email);
    
    // Record payment in TenancyPayment collection
    await TenancyPayment.create({
      tenancy: tenancy._id,
      amount,
      currency: 'INR',
      status: 'completed',
      paymentMethod: 'card',
      transactionId: sessionToProcess.payment_intent,
      gateway: 'stripe',
      gatewayResponse: {
        sessionId: sessionToProcess.id,
        customerId: sessionToProcess.customer
      },
      notes: `Direct plan purchase: ${planName} (${billingCycle})`
    });
    
    console.log('✅ Payment recorded in database');
    
    // Create lead record for sales tracking
    const lead = await Lead.create({
      businessName,
      businessType: 'laundry',
      contactPerson: {
        name: customerName,
        email: customerEmail,
        phone: customerPhone
      },
      source: 'direct_checkout',
      status: 'converted',
      interestedPlan: planName,
      estimatedRevenue: amount,
      isConverted: true,
      convertedDate: new Date(),
      tenancyId: tenancy._id,
      paymentDetails: {
        stripeSessionId: sessionToProcess.id,
        amount,
        paidAt: new Date()
      },
      tags: ['direct_purchase', 'auto_converted']
    });
    
    console.log('✅ Lead created for sales tracking:', lead._id);
    
    // Display completion summary
    console.log('\n🎉 DIRECT PAYMENT PROCESSING COMPLETE!');
    console.log('='.repeat(60));
    console.log(`🏢 Business: ${businessName}`);
    console.log(`🌐 Subdomain: ${subdomain}.laundrylobby.com`);
    console.log(`👤 Admin Email: ${customerEmail}`);
    console.log(`🔑 Temp Password: ${tempPassword}`);
    console.log(`💰 Amount Paid: ₹${amount}`);
    console.log(`📋 Plan: ${billingPlan.displayName} (${billingCycle})`);
    console.log(`🔗 Login URL: https://${subdomain}.laundrylobby.com`);
    
    console.log('\n📧 Welcome Email Details:');
    console.log(`To: ${customerEmail}`);
    console.log(`Subject: Welcome to LaundryLobby - Your ${billingPlan.displayName} account is ready!`);
    console.log(`Login URL: https://${subdomain}.laundrylobby.com`);
    console.log(`Username: ${customerEmail}`);
    console.log(`Temporary Password: ${tempPassword}`);
    
    console.log('\n✅ Customer can now login immediately!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    mongoose.disconnect();
  }
}

// Helper functions
function generateUniqueSubdomain(businessName) {
  let subdomain = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 15);
  
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `${subdomain}${randomSuffix}`;
}

function generateSecureTempPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

function calculateNextBillingDate(billingCycle) {
  const now = new Date();
  if (billingCycle === 'yearly') {
    return new Date(now.setFullYear(now.getFullYear() + 1));
  } else {
    return new Date(now.setMonth(now.getMonth() + 1));
  }
}

function mapPlanToUserPermissions(billingPlan) {
  const features = billingPlan.features || new Map();
  const legacy = billingPlan.legacyFeatures || {};
  const planFeatures = features instanceof Map ? Object.fromEntries(features) : features;

  return {
    dashboard: { view: true },
    profile: { view: true, update: true },
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
    customers: {
      view: true,
      create: true,
      update: true,
      delete: planFeatures.advanced_management || false,
      export: planFeatures.data_export || false,
      maxCustomers: legacy.maxCustomers || 500
    },
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
    inventory: {
      view: true,
      create: true,
      update: true,
      delete: planFeatures.advanced_management || false,
      restock: true,
      writeOff: planFeatures.advanced_management || false,
      export: planFeatures.data_export || false
    },
    services: {
      view: true,
      create: true,
      update: true,
      delete: planFeatures.advanced_management || false,
      toggle: true,
      updatePricing: true,
      export: planFeatures.data_export || false
    },
    analytics: {
      view: true,
      basic: true,
      advanced: planFeatures.advanced_analytics || legacy.advancedAnalytics || false,
      export: planFeatures.data_export || legacy.apiAccess || false,
      customReports: planFeatures.custom_reports || false
    },
    financial: {
      view: true,
      viewReports: planFeatures.financial_reports || legacy.advancedAnalytics || false,
      export: planFeatures.data_export || false
    },
    settings: {
      view: true,
      update: true,
      branding: planFeatures.custom_branding || legacy.customBranding || false,
      domain: planFeatures.custom_domain || legacy.customDomain || false,
      api: planFeatures.api_access || legacy.apiAccess || false
    },
    support: {
      basic: true,
      priority: planFeatures.priority_support || legacy.prioritySupport || false,
      phone: planFeatures.phone_support || false,
      dedicated: planFeatures.dedicated_support || false
    }
  };
}

processDirectPaymentComplete();