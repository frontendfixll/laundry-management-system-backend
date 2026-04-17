/**
 * Check Subscription Details
 * This script checks the current subscription details for all tenancies
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const Tenancy = require('./src/models/Tenancy');
const { BillingPlan } = require('./src/models/TenancyBilling');

async function checkSubscriptionDetails() {
  console.log('🔍 CHECKING SUBSCRIPTION DETAILS');
  console.log('='.repeat(60));
  
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');
    
    // Get all tenancies with subscription details
    const tenancies = await Tenancy.find({})
      .populate('subscription.planId', 'displayName price')
      .select('name slug subscription source paymentDetails createdAt')
      .sort({ createdAt: -1 });
    
    console.log(`\n📋 Found ${tenancies.length} tenancies`);
    
    console.log('\n📊 SUBSCRIPTION DETAILS:');
    console.log('='.repeat(80));
    
    tenancies.forEach((tenancy, index) => {
      const plan = tenancy.subscription?.planId;
      const billingCycle = tenancy.subscription?.billingCycle || 'monthly';
      const price = plan?.price?.[billingCycle] || 0;
      const hasStripePayment = tenancy.paymentDetails?.stripeSessionId ? '💳' : '  ';
      
      console.log(`${index + 1}. ${hasStripePayment} ${tenancy.name} (${tenancy.slug})`);
      console.log(`   Plan: ${plan?.displayName || tenancy.subscription?.plan || 'No Plan'}`);
      console.log(`   Price: ₹${price}/${billingCycle}`);
      console.log(`   Status: ${tenancy.subscription?.status || 'Unknown'}`);
      console.log(`   Source: ${tenancy.source || 'Not set'}`);
      console.log(`   Created: ${tenancy.createdAt.toLocaleDateString()}`);
      if (tenancy.paymentDetails?.stripeSessionId) {
        console.log(`   Stripe Session: ${tenancy.paymentDetails.stripeSessionId.slice(-8)}`);
        console.log(`   Paid Amount: ₹${tenancy.paymentDetails.lastPayment?.amount || 0}`);
      }
      console.log('');
    });
    
    // Summary by plan
    console.log('\n📈 PLAN DISTRIBUTION:');
    const planCounts = {};
    let totalRevenue = 0;
    
    tenancies.forEach(tenancy => {
      const plan = tenancy.subscription?.planId;
      const planName = plan?.displayName || tenancy.subscription?.plan || 'No Plan';
      const billingCycle = tenancy.subscription?.billingCycle || 'monthly';
      const price = plan?.price?.[billingCycle] || 0;
      
      planCounts[planName] = (planCounts[planName] || 0) + 1;
      totalRevenue += price;
    });
    
    Object.entries(planCounts).forEach(([plan, count]) => {
      console.log(`${plan}: ${count} tenancies`);
    });
    
    console.log(`\nTotal Monthly Revenue Potential: ₹${totalRevenue}`);
    
    // Direct purchase tenancies
    const directPurchases = tenancies.filter(t => 
      t.paymentDetails?.stripeSessionId || 
      t.source === 'direct_checkout'
    );
    
    console.log(`\n💳 DIRECT PURCHASES: ${directPurchases.length}`);
    directPurchases.forEach((tenancy, index) => {
      const plan = tenancy.subscription?.planId;
      const billingCycle = tenancy.subscription?.billingCycle || 'monthly';
      const price = plan?.price?.[billingCycle] || 0;
      
      console.log(`${index + 1}. ${tenancy.name}`);
      console.log(`   Plan: ${plan?.displayName || 'No Plan'} - ₹${price}/${billingCycle}`);
      console.log(`   Session: ${tenancy.paymentDetails?.stripeSessionId?.slice(-8) || 'None'}`);
    });
    
    console.log('\n✅ Subscription details check complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
  }
}

checkSubscriptionDetails();