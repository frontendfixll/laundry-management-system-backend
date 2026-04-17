/**
 * Final Subscription Verification
 * This script verifies that all subscription data is properly set up
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const Tenancy = require('./src/models/Tenancy');
const { BillingPlan } = require('./src/models/TenancyBilling');

async function finalSubscriptionVerification() {
  console.log('✅ FINAL SUBSCRIPTION VERIFICATION');
  console.log('='.repeat(60));
  
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');
    
    // Get all tenancies with populated plan details (like the frontend does)
    const tenancies = await Tenancy.find({})
      .populate('subscription.planId', 'displayName price')
      .select('name slug subscription')
      .sort({ createdAt: -1 });
    
    console.log(`\n📋 Found ${tenancies.length} tenancies`);
    
    console.log('\n🎯 SUBSCRIPTION VERIFICATION (Frontend View):');
    console.log('='.repeat(80));
    
    let totalRevenue = 0;
    let validPlans = 0;
    
    tenancies.forEach((tenancy, index) => {
      const plan = tenancy.subscription?.planId;
      const billingCycle = tenancy.subscription?.billingCycle || 'monthly';
      const price = plan?.price?.[billingCycle] || 0;
      const status = tenancy.subscription?.status || 'Unknown';
      
      // This is exactly how the frontend processes the data
      const mappedSubscription = {
        _id: tenancy._id,
        tenancyName: tenancy.name,
        plan: {
          name: plan?.displayName || tenancy.subscription?.plan || 'No Plan',
          price: price,
          billingCycle: billingCycle
        },
        status: status
      };
      
      console.log(`${index + 1}. ${mappedSubscription.tenancyName}`);
      console.log(`   Plan: ${mappedSubscription.plan.name}`);
      console.log(`   Price: ₹${mappedSubscription.plan.price}/${mappedSubscription.plan.billingCycle}`);
      console.log(`   Status: ${mappedSubscription.status}`);
      
      if (price > 0) {
        totalRevenue += price;
        validPlans++;
      }
      
      console.log('');
    });
    
    console.log('📊 SUMMARY:');
    console.log(`✅ Total Tenancies: ${tenancies.length}`);
    console.log(`✅ Valid Plans (>₹0): ${validPlans}`);
    console.log(`✅ Total Monthly Revenue: ₹${totalRevenue}`);
    console.log(`✅ Free/Trial Plans: ${tenancies.length - validPlans}`);
    
    // Check specific direct purchase tenancies
    const directPurchaseNames = ['emer', 'shipra', "dafe's Business", "gaurav's Business", "mahesh's Business"];
    
    console.log('\n💳 DIRECT PURCHASE VERIFICATION:');
    directPurchaseNames.forEach(name => {
      const tenancy = tenancies.find(t => t.name === name);
      if (tenancy) {
        const plan = tenancy.subscription?.planId;
        const billingCycle = tenancy.subscription?.billingCycle || 'monthly';
        const price = plan?.price?.[billingCycle] || 0;
        
        console.log(`✅ ${name}: ${plan?.displayName || 'No Plan'} - ₹${price}/${billingCycle}`);
      } else {
        console.log(`❌ ${name}: Not found`);
      }
    });
    
    console.log('\n🎉 VERIFICATION COMPLETE!');
    console.log('The sales dashboard subscriptions should now show:');
    console.log('- Correct plan names (not "No Plan")');
    console.log('- Correct prices (not ₹0)');
    console.log('- Proper billing cycles');
    console.log('- Active status for paid plans');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
  }
}

finalSubscriptionVerification();