const mongoose = require('mongoose');
require('dotenv').config();

const Tenancy = require('./src/models/Tenancy');
const { BillingPlan } = require('./src/models/TenancyBilling');

async function checkSubscriptions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get all tenancies
    const tenancies = await Tenancy.find()
      .populate('subscription.planId', 'name displayName price')
      .select('name businessName slug subscription createdAt');

    console.log('\n📊 Total Tenancies:', tenancies.length);
    
    if (tenancies.length === 0) {
      console.log('\n⚠️  No tenancies found in database!');
      console.log('This is why subscriptions page shows "No data found"');
      console.log('\nTo fix this:');
      console.log('1. Convert some leads to customers (this creates tenancies)');
      console.log('2. Or create test tenancies manually');
    } else {
      console.log('\n📋 Tenancies:');
      tenancies.forEach((t, i) => {
        console.log(`\n${i + 1}. ${t.name || t.businessName || 'Unnamed'}`);
        console.log(`   ID: ${t._id}`);
        console.log(`   Slug: ${t.slug}`);
        console.log(`   Subscription Status: ${t.subscription?.status || 'No subscription'}`);
        console.log(`   Plan: ${t.subscription?.planId?.displayName || t.subscription?.planId?.name || 'No plan'}`);
        console.log(`   Trial Active: ${t.subscription?.trial?.isActive || false}`);
      });
    }

    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkSubscriptions();
