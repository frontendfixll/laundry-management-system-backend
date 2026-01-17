const mongoose = require('mongoose');
require('dotenv').config();

const Tenancy = require('./src/models/Tenancy');
const { BillingPlan } = require('./src/models/TenancyBilling');

async function assignPlans() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Get or create a basic plan
    let basicPlan = await BillingPlan.findOne({ name: 'basic' });
    
    if (!basicPlan) {
      console.log('📦 Creating Basic Plan...');
      basicPlan = await BillingPlan.create({
        name: 'basic',
        displayName: 'Basic Plan',
        description: 'Basic features for small businesses',
        price: 999,
        billingCycle: 'monthly',
        features: [
          'Up to 2 branches',
          'Basic order management',
          'Customer management',
          'Basic reports',
          'Email support'
        ],
        limits: {
          branches: 2,
          staff: 10,
          orders: 1000,
          storage: 1024 // 1GB
        },
        isActive: true
      });
      console.log('✅ Created Basic Plan:', basicPlan.displayName);
      console.log('   Price: ₹', basicPlan.price, '/', basicPlan.billingCycle);
    } else {
      console.log('✅ Found existing Basic Plan:', basicPlan.displayName);
    }
    
    // Get or create a pro plan
    let proPlan = await BillingPlan.findOne({ name: 'pro' });
    
    if (!proPlan) {
      console.log('\n📦 Creating Pro Plan...');
      proPlan = await BillingPlan.create({
        name: 'pro',
        displayName: 'Pro Plan',
        description: 'Advanced features for growing businesses',
        price: 2999,
        billingCycle: 'monthly',
        features: [
          'Up to 5 branches',
          'Advanced order management',
          'Customer loyalty program',
          'Advanced analytics',
          'SMS notifications',
          'Priority support',
          'Custom branding'
        ],
        limits: {
          branches: 5,
          staff: 50,
          orders: 10000,
          storage: 10240 // 10GB
        },
        isActive: true
      });
      console.log('✅ Created Pro Plan:', proPlan.displayName);
      console.log('   Price: ₹', proPlan.price, '/', proPlan.billingCycle);
    } else {
      console.log('✅ Found existing Pro Plan:', proPlan.displayName);
    }
    
    // Get or create an enterprise plan
    let enterprisePlan = await BillingPlan.findOne({ name: 'enterprise' });
    
    if (!enterprisePlan) {
      console.log('\n📦 Creating Enterprise Plan...');
      enterprisePlan = await BillingPlan.create({
        name: 'enterprise',
        displayName: 'Enterprise Plan',
        description: 'Complete solution for large enterprises',
        price: 9999,
        billingCycle: 'monthly',
        features: [
          'Unlimited branches',
          'Full feature access',
          'Advanced loyalty & campaigns',
          'Real-time analytics',
          'SMS & Email notifications',
          'Dedicated support',
          'Custom branding',
          'API access',
          'White-label solution'
        ],
        limits: {
          branches: -1, // Unlimited
          staff: -1,
          orders: -1,
          storage: -1
        },
        isActive: true
      });
      console.log('✅ Created Enterprise Plan:', enterprisePlan.displayName);
      console.log('   Price: ₹', enterprisePlan.price, '/', enterprisePlan.billingCycle);
    } else {
      console.log('✅ Found existing Enterprise Plan:', enterprisePlan.displayName);
    }
    
    // Find tenancies without a plan
    const tenancies = await Tenancy.find({
      $or: [
        { 'subscription.planId': null },
        { 'subscription.planId': { $exists: false } }
      ]
    });
    
    console.log(`\n📊 Found ${tenancies.length} tenancies without plans\n`);
    
    if (tenancies.length === 0) {
      console.log('✅ All tenancies already have plans assigned!');
    } else {
      // Assign basic plan to all tenancies without a plan
      for (let i = 0; i < tenancies.length; i++) {
        const tenancy = tenancies[i];
        
        // Initialize subscription object if it doesn't exist
        if (!tenancy.subscription) {
          tenancy.subscription = {};
        }
        
        // Assign plan
        tenancy.subscription.planId = basicPlan._id;
        tenancy.subscription.status = 'active';
        tenancy.subscription.billingCycle = 'monthly';
        tenancy.subscription.startDate = new Date();
        tenancy.subscription.nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        
        // Add trial if not exists
        if (!tenancy.subscription.trial) {
          tenancy.subscription.trial = {
            isActive: false,
            daysRemaining: 0
          };
        }
        
        await tenancy.save();
        
        console.log(`${i + 1}. ✅ Assigned ${basicPlan.displayName} to: ${tenancy.name || tenancy.businessName || 'Unnamed'}`);
        console.log(`   Tenancy ID: ${tenancy._id}`);
        console.log(`   Status: ${tenancy.subscription.status}`);
        console.log(`   Next Billing: ${tenancy.subscription.nextBillingDate.toLocaleDateString()}\n`);
      }
    }
    
    // Summary
    console.log('\n📊 Summary:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const allTenancies = await Tenancy.find()
      .populate('subscription.planId', 'name displayName price');
    
    console.log(`Total Tenancies: ${allTenancies.length}`);
    
    const withPlans = allTenancies.filter(t => t.subscription?.planId);
    const withoutPlans = allTenancies.filter(t => !t.subscription?.planId);
    
    console.log(`With Plans: ${withPlans.length}`);
    console.log(`Without Plans: ${withoutPlans.length}`);
    
    if (withPlans.length > 0) {
      console.log('\n✅ Tenancies with Plans:');
      withPlans.forEach((t, i) => {
        console.log(`   ${i + 1}. ${t.name || t.businessName} → ${t.subscription.planId?.displayName || 'Unknown Plan'}`);
      });
    }
    
    console.log('\n✅ Plans are now assigned!');
    console.log('🚀 You can now view subscriptions in the Sales Portal');
    console.log('   URL: http://localhost:3005/subscriptions');
    
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

assignPlans();
