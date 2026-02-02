/**
 * Update Source Field for Direct Purchase Tenancies
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const Tenancy = require('./src/models/Tenancy');

async function updateSourceField() {
  console.log('🔄 UPDATING SOURCE FIELD FOR DIRECT PURCHASES');
  console.log('='.repeat(60));
  
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');
    
    // Update all tenancies that have Stripe payment details
    const result = await Tenancy.updateMany(
      { 'paymentDetails.stripeSessionId': { $exists: true } },
      { $set: { source: 'direct_checkout' } }
    );
    
    console.log(`✅ Updated ${result.modifiedCount} tenancies with source: 'direct_checkout'`);
    
    // Show updated tenancies
    const updatedTenancies = await Tenancy.find({ source: 'direct_checkout' })
      .populate('subscription.planId', 'displayName price')
      .select('name slug subscription paymentDetails source');
    
    console.log('\n💳 DIRECT PURCHASE TENANCIES:');
    updatedTenancies.forEach((tenancy, index) => {
      const plan = tenancy.subscription?.planId;
      const billingCycle = tenancy.subscription?.billingCycle || 'monthly';
      const price = plan?.price?.[billingCycle] || 0;
      const paidAmount = tenancy.paymentDetails?.lastPayment?.amount || 0;
      
      console.log(`${index + 1}. ${tenancy.name} (${tenancy.slug})`);
      console.log(`   Plan: ${plan?.displayName || 'No Plan'} - ₹${price}/${billingCycle}`);
      console.log(`   Paid: ₹${paidAmount}`);
      console.log(`   Session: ${tenancy.paymentDetails?.stripeSessionId?.slice(-8) || 'None'}`);
      console.log(`   Source: ${tenancy.source}`);
      console.log('');
    });
    
    console.log('✅ Source field updated successfully!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
  }
}

updateSourceField();