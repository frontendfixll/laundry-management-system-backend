/**
 * Fix Subscription Plan Details
 * This script fixes the missing plan details in tenancy subscriptions
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const Tenancy = require('./src/models/Tenancy');
const { BillingPlan } = require('./src/models/TenancyBilling');

async function fixSubscriptionPlanDetails() {
  console.log('🔧 FIXING SUBSCRIPTION PLAN DETAILS');
  console.log('='.repeat(60));
  
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');
    
    // Get all tenancies that might be from direct purchases
    const tenancies = await Tenancy.find({
      $or: [
        { source: 'direct_checkout' },
        { 'paymentDetails.stripeSessionId': { $exists: true } },
        { createdAt: { $gte: new Date('2026-01-01') } } // Recent tenancies
      ]
    });
    console.log(`\n📋 Found ${tenancies.length} direct purchase tenancies to fix`);
    
    let fixedCount = 0;
    
    for (let i = 0; i < tenancies.length; i++) {
      const tenancy = tenancies[i];
      
      try {
        console.log(`\n🔄 Fixing tenancy ${i + 1}/${tenancies.length}: ${tenancy.name}`);
        console.log(`📋 Current plan: ${tenancy.subscription?.plan || 'None'}`);
        console.log(`💰 Current planId: ${tenancy.subscription?.planId || 'None'}`);
        
        // Get the plan name from tenancy
        const planName = tenancy.subscription?.plan || tenancy.plan;
        
        if (!planName) {
          console.log('❌ No plan name found - skipping');
          continue;
        }
        
        // Find the billing plan
        const billingPlan = await BillingPlan.findOne({ 
          $or: [
            { name: planName },
            { name: planName.toLowerCase() }
          ],
          isActive: true 
        });
        
        if (!billingPlan) {
          console.log(`❌ Billing plan '${planName}' not found - skipping`);
          continue;
        }
        
        console.log(`✅ Found billing plan: ${billingPlan.displayName}`);
        console.log(`💰 Plan price: Monthly ₹${billingPlan.price.monthly}, Yearly ₹${billingPlan.price.yearly}`);
        
        // Update tenancy subscription with proper plan details
        tenancy.subscription = tenancy.subscription || {};
        tenancy.subscription.plan = billingPlan.name;
        tenancy.subscription.planId = billingPlan._id;
        tenancy.subscription.status = tenancy.subscription.status || 'active';
        tenancy.subscription.billingCycle = tenancy.subscription.billingCycle || 'monthly';
        tenancy.subscription.startDate = tenancy.subscription.startDate || tenancy.createdAt;
        
        // Set next billing date
        const nextBillingDate = new Date(tenancy.subscription.startDate);
        if (tenancy.subscription.billingCycle === 'yearly') {
          nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
        } else {
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        }
        tenancy.subscription.nextBillingDate = nextBillingDate;
        
        // Set features from plan
        tenancy.subscription.features = billingPlan.features instanceof Map 
          ? Object.fromEntries(billingPlan.features) 
          : billingPlan.features || {};
        
        // Set limits from plan
        tenancy.subscription.limits = {
          maxOrders: billingPlan.legacyFeatures?.maxOrders || 1000,
          maxStaff: billingPlan.legacyFeatures?.maxStaff || 10,
          maxCustomers: billingPlan.legacyFeatures?.maxCustomers || 1000,
          maxBranches: billingPlan.legacyFeatures?.maxBranches || 1
        };
        
        await tenancy.save();
        
        console.log('✅ Tenancy subscription updated successfully');
        console.log(`📋 Plan: ${billingPlan.displayName}`);
        console.log(`💰 Price: ₹${billingPlan.price[tenancy.subscription.billingCycle]}/${tenancy.subscription.billingCycle}`);
        console.log(`📅 Next billing: ${nextBillingDate.toLocaleDateString()}`);
        
        fixedCount++;
        
      } catch (error) {
        console.error(`❌ Error fixing tenancy ${tenancy.name}:`, error.message);
      }
    }
    
    // Summary
    console.log('\n🎉 FIXING COMPLETE!');
    console.log('='.repeat(40));
    console.log(`✅ Fixed: ${fixedCount}`);
    console.log(`📊 Total: ${tenancies.length}`);
    
    // Show updated tenancies
    console.log('\n📈 UPDATED TENANCIES:');
    const updatedTenancies = await Tenancy.find({ source: 'direct_checkout' })
      .populate('subscription.planId', 'displayName price')
      .select('name subscription.plan subscription.planId subscription.billingCycle subscription.status');
    
    updatedTenancies.forEach((tenancy, index) => {
      const plan = tenancy.subscription?.planId;
      const billingCycle = tenancy.subscription?.billingCycle || 'monthly';
      const price = plan?.price?.[billingCycle] || 0;
      
      console.log(`${index + 1}. ${tenancy.name}`);
      console.log(`   Plan: ${plan?.displayName || 'No Plan'}`);
      console.log(`   Price: ₹${price}/${billingCycle}`);
      console.log(`   Status: ${tenancy.subscription?.status || 'Unknown'}`);
      console.log('');
    });
    
    console.log('✅ All subscription plan details fixed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
  }
}

fixSubscriptionPlanDetails();