/**
 * Process All Direct Payments
 * This script processes all unprocessed Stripe payments and creates complete business accounts
 */

require('dotenv').config();
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bcrypt = require('bcryptjs');

// Import models
const Lead = require('./src/models/Lead');
const Tenancy = require('./src/models/Tenancy');
const User = require('./src/models/User');
const { BillingPlan, TenancyPayment } = require('./src/models/TenancyBilling');

async function processAllDirectPayments() {
  console.log('🚀 PROCESS ALL DIRECT PAYMENTS');
  console.log('='.repeat(60));
  
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');
    
    // Get recent Stripe sessions
    const sessions = await stripe.checkout.sessions.list({ limit: 20 });
    const paidSessions = sessions.data.filter(s => s.payment_status === 'paid');
    
    console.log(`\n📋 Found ${paidSessions.length} paid sessions to check`);
    
    let processedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < paidSessions.length; i++) {
      const session = paidSessions[i];
      
      try {
        console.log(`\n🔄 Processing session ${i + 1}/${paidSessions.length}: ${session.id.slice(-8)}`);
        
        // Extract customer details
        const customerEmail = session.customer_details?.email;
        const customerName = session.customer_details?.name || 'Customer';
        const customerPhone = session.customer_details?.phone || '';
        const businessName = session.metadata?.businessName || 
                            session.custom_fields?.find(f => f.key === 'business_name')?.text?.value ||
                            `${customerName}'s Business`;
        const planName = session.metadata?.planName || 'basic';
        const billingCycle = session.metadata?.billingCycle || 'monthly';
        const amount = session.amount_total / 100;
        
        console.log(`📋 Customer: ${customerName} (${customerEmail})`);
        console.log(`🏢 Business: ${businessName}`);
        console.log(`📋 Plan: ${planName} (${billingCycle})`);
        console.log(`💰 Amount: ₹${amount}`);
        
        if (!customerEmail) {
          console.log('❌ No customer email - skipping');
          skippedCount++;
          continue;
        }
        
        // Check if already processed
        const existingTenancy = await Tenancy.findOne({
          $or: [
            { 'settings.contactEmail': customerEmail },
            { name: businessName }
          ]
        });
        
        if (existingTenancy) {
          // Check if admin user exists
          const adminUser = await User.findOne({ 
            email: customerEmail, 
            tenancy: existingTenancy._id 
          });
          
          if (adminUser) {
            console.log('✅ Already processed - skipping');
            skippedCount++;
            continue;
          } else {
            console.log('⚠️ Tenancy exists but no admin user - creating admin user');
            await createAdminUserForTenancy(existingTenancy, {
              customerName,
              customerEmail,
              customerPhone,
              planName
            });
            processedCount++;
            continue;
          }
        }
        
        // Get billing plan
        const billingPlan = await BillingPlan.findOne({ name: planName, isActive: true });
        if (!billingPlan) {
          console.log(`❌ Plan '${planName}' not found - skipping`);
          skippedCount++;
          continue;
        }
        
        console.log(`✅ Plan found: ${billingPlan.displayName}`);
        
        // Create complete business account
        await createCompleteBusinessAccount({
          customerName,
          customerEmail,
          customerPhone,
          businessName,
          planName,
          billingCycle,
          stripeSessionId: session.id,
          stripeCustomerId: session.customer,
          paymentIntent: session.payment_intent,
          amount,
          billingPlan
        });
        
        processedCount++;
        console.log('✅ Business account created successfully');
        
      } catch (error) {
        console.error(`❌ Error processing session ${session.id.slice(-8)}:`, error.message);
        errorCount++;
      }
    }
    
    // Summary
    console.log('\n🎉 PROCESSING COMPLETE!');
    console.log('='.repeat(40));
    console.log(`✅ Processed: ${processedCount}`);
    console.log(`⏭️ Skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Total: ${paidSessions.length}`);
    
    // Show final statistics
    const totalDirectLeads = await Lead.countDocuments({ source: 'direct_checkout' });
    const totalDirectTenancies = await Tenancy.countDocuments({ source: 'direct_checkout' });
    const totalDirectPayments = await TenancyPayment.countDocuments({ 
      notes: { $regex: /direct.*purchase/i }
    });
    
    console.log('\n📈 FINAL STATISTICS:');
    console.log(`Direct Purchase Leads: ${totalDirectLeads}`);
    console.log(`Direct Purchase Tenancies: ${totalDirectTenancies}`);
    console.log(`Direct Purchase Payments: ${totalDirectPayments}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
  }
}

async function createCompleteBusinessAccount(data) {
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
    billingPlan
  } = data;
  
  // Check if user already exists
  const existingUser = await User.findOne({ email: customerEmail });
  if (existingUser && existingUser.tenancy) {
    console.log(`⚠️ User ${customerEmail} already has a tenancy - skipping`);
    return null;
  }
  
  // Generate unique subdomain
  const subdomain = generateUniqueSubdomain(businessName);
  
  // Create a temporary ObjectId for owner
  const tempOwnerId = new mongoose.Types.ObjectId();
  
  // Create tenancy
  const tenancy = await Tenancy.create({
    name: businessName,
    slug: subdomain,
    plan: planName,
    billingCycle: billingCycle,
    status: 'active',
    owner: tempOwnerId,
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
      stripeSessionId,
      stripeCustomerId,
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
    source: 'direct_checkout'
  });
  
  // Generate secure password
  const tempPassword = generateSecureTempPassword();
  const hashedPassword = await bcrypt.hash(tempPassword, 12);
  
  // Map plan features to user permissions
  const userPermissions = mapPlanToUserPermissions(billingPlan);
  
  // Ensure valid phone number
  const validPhone = customerPhone && customerPhone.length >= 10 ? 
    customerPhone.replace(/\D/g, '').slice(-10) : '9999999999';
  
  let adminUser;
  
  if (existingUser) {
    // Update existing user
    existingUser.tenancy = tenancy._id;
    // Only update role if it's not already admin or a higher role
    if (!['admin', 'superadmin'].includes(existingUser.role)) {
      existingUser.role = 'admin';
    }
    existingUser.permissions = userPermissions;
    await existingUser.save();
    adminUser = existingUser;
    console.log(`✅ Updated existing user: ${customerEmail}`);
  } else {
    // Create new admin user
    adminUser = await User.create({
      name: customerName,
      email: customerEmail,
      password: hashedPassword,
      phone: validPhone,
      role: 'admin',
      tenancy: tenancy._id,
      isActive: true,
      isEmailVerified: true,
      permissions: userPermissions,
      profile: {
        firstName: customerName.split(' ')[0] || customerName,
        lastName: customerName.split(' ').slice(1).join(' ') || '',
        designation: 'Business Owner'
      },
      settings: {
        notifications: { email: true, sms: false, push: true },
        theme: 'light',
        language: 'en'
      },
      loginCredentials: {
        tempPassword,
        mustChangePassword: true,
        firstLogin: true
      }
    });
    console.log(`✅ Created new user: ${customerEmail} (Password: ${tempPassword})`);
  }
  
  // Update tenancy with real owner
  tenancy.owner = adminUser._id;
  await tenancy.save();
  
  // Record payment
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
  
  // Create lead record for sales tracking
  await Lead.create({
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
      stripeSessionId,
      amount,
      paidAt: new Date()
    },
    tags: ['direct_purchase', 'auto_converted']
  });
  
  console.log(`🎉 Complete account created:`);
  console.log(`   Subdomain: ${subdomain}.laundrylobby.com`);
  console.log(`   Admin: ${customerEmail}`);
  if (!existingUser) {
    console.log(`   Password: ${tempPassword}`);
  }
  
  return { tenancy, adminUser, tempPassword: existingUser ? null : tempPassword };
}

async function createAdminUserForTenancy(tenancy, customerData) {
  const { customerName, customerEmail, customerPhone, planName } = customerData;
  
  // Check if user already exists
  const existingUser = await User.findOne({ email: customerEmail });
  if (existingUser) {
    console.log(`⚠️ User ${customerEmail} already exists - updating tenancy reference`);
    
    // Update existing user's tenancy if needed
    if (!existingUser.tenancy || existingUser.tenancy.toString() !== tenancy._id.toString()) {
      existingUser.tenancy = tenancy._id;
      // Only update role if it's not already admin or a higher role
      if (!['admin', 'superadmin'].includes(existingUser.role)) {
        existingUser.role = 'admin';
      }
      await existingUser.save();
    }
    
    // Update tenancy owner
    if (!tenancy.owner || tenancy.owner.toString() === '000000000000000000000000') {
      tenancy.owner = existingUser._id;
      await tenancy.save();
    }
    
    console.log(`✅ Existing user linked to tenancy: ${customerEmail}`);
    return existingUser;
  }
  
  // Get billing plan for permissions
  const billingPlan = await BillingPlan.findOne({ name: planName, isActive: true });
  if (!billingPlan) {
    throw new Error(`Billing plan '${planName}' not found`);
  }
  
  // Generate secure password
  const tempPassword = generateSecureTempPassword();
  const hashedPassword = await bcrypt.hash(tempPassword, 12);
  
  // Map plan features to user permissions
  const userPermissions = mapPlanToUserPermissions(billingPlan);
  
  // Ensure valid phone number
  const validPhone = customerPhone && customerPhone.length >= 10 ? 
    customerPhone.replace(/\D/g, '').slice(-10) : '9999999999';
  
  // Create admin user
  const adminUser = await User.create({
    name: customerName,
    email: customerEmail,
    password: hashedPassword,
    phone: validPhone,
    role: 'admin',
    tenancy: tenancy._id,
    isActive: true,
    isEmailVerified: true,
    permissions: userPermissions,
    profile: {
      firstName: customerName.split(' ')[0] || customerName,
      lastName: customerName.split(' ').slice(1).join(' ') || '',
      designation: 'Business Owner'
    },
    settings: {
      notifications: { email: true, sms: false, push: true },
      theme: 'light',
      language: 'en'
    },
    loginCredentials: {
      tempPassword,
      mustChangePassword: true,
      firstLogin: true
    }
  });
  
  // Update tenancy owner if not set
  if (!tenancy.owner || tenancy.owner.toString() === '000000000000000000000000') {
    tenancy.owner = adminUser._id;
    await tenancy.save();
  }
  
  console.log(`✅ Admin user created: ${customerEmail} (Password: ${tempPassword})`);
  
  return adminUser;
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

processAllDirectPayments();