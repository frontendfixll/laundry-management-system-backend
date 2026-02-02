/**
 * Link Stripe Payments to Tenancies
 * This script links the Stripe payment sessions to the correct tenancies
 */

require('dotenv').config();
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Import models
const Tenancy = require('./src/models/Tenancy');
const { TenancyPayment } = require('./src/models/TenancyBilling');

async function linkStripePaymentsToTenancies() {
  console.log('🔗 LINKING STRIPE PAYMENTS TO TENANCIES');
  console.log('='.repeat(60));
  
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');
    
    // Get recent Stripe sessions
    const sessions = await stripe.checkout.sessions.list({ limit: 20 });
    const paidSessions = sessions.data.filter(s => s.payment_status === 'paid');
    
    console.log(`\n📋 Found ${paidSessions.length} paid Stripe sessions`);
    
    let linkedCount = 0;
    
    for (let i = 0; i < paidSessions.length; i++) {
      const session = paidSessions[i];
      
      try {
        console.log(`\n🔄 Processing session ${i + 1}/${paidSessions.length}: ${session.id.slice(-8)}`);
        
        // Extract customer details
        const customerEmail = session.customer_details?.email;
        const businessName = session.metadata?.businessName || 
                            session.custom_fields?.find(f => f.key === 'business_name')?.text?.value ||
                            `${session.customer_details?.name || 'Customer'}'s Business`;
        const amount = session.amount_total / 100;
        
        console.log(`📧 Email: ${customerEmail}`);
        console.log(`🏢 Business: ${businessName}`);
        console.log(`💰 Amount: ₹${amount}`);
        
        if (!customerEmail) {
          console.log('❌ No customer email - skipping');
          continue;
        }
        
        // Find matching tenancy
        const tenancy = await Tenancy.findOne({
          $or: [
            { 'settings.contactEmail': customerEmail },
            { name: businessName },
            { name: { $regex: new RegExp(businessName.split(' ')[0], 'i') } }
          ]
        });
        
        if (!tenancy) {
          console.log('❌ No matching tenancy found');
          continue;
        }
        
        console.log(`✅ Found tenancy: ${tenancy.name} (${tenancy.slug})`);
        
        // Check if already linked
        if (tenancy.paymentDetails?.stripeSessionId === session.id) {
          console.log('⚠️ Already linked - skipping');
          continue;
        }
        
        // Update tenancy with payment details
        tenancy.paymentDetails = tenancy.paymentDetails || {};
        tenancy.paymentDetails.stripeSessionId = session.id;
        tenancy.paymentDetails.stripeCustomerId = session.customer;
        tenancy.paymentDetails.lastPayment = {
          amount,
          date: new Date(session.created * 1000),
          method: 'stripe',
          paymentIntent: session.payment_intent
        };
        tenancy.source = 'direct_checkout';
        
        await tenancy.save();
        
        console.log('✅ Tenancy updated with payment details');
        linkedCount++;
        
      } catch (error) {
        console.error(`❌ Error processing session ${session.id.slice(-8)}:`, error.message);
      }
    }
    
    // Summary
    console.log('\n🎉 LINKING COMPLETE!');
    console.log('='.repeat(40));
    console.log(`✅ Linked: ${linkedCount}`);
    console.log(`📊 Total Sessions: ${paidSessions.length}`);
    
    // Show updated tenancies with payment details
    console.log('\n💳 TENANCIES WITH STRIPE PAYMENTS:');
    const tenanciesWithPayments = await Tenancy.find({
      'paymentDetails.stripeSessionId': { $exists: true }
    })
    .populate('subscription.planId', 'displayName price')
    .select('name slug subscription paymentDetails');
    
    tenanciesWithPayments.forEach((tenancy, index) => {
      const plan = tenancy.subscription?.planId;
      const billingCycle = tenancy.subscription?.billingCycle || 'monthly';
      const price = plan?.price?.[billingCycle] || 0;
      const paidAmount = tenancy.paymentDetails?.lastPayment?.amount || 0;
      
      console.log(`${index + 1}. ${tenancy.name} (${tenancy.slug})`);
      console.log(`   Plan: ${plan?.displayName || 'No Plan'} - ₹${price}/${billingCycle}`);
      console.log(`   Paid: ₹${paidAmount}`);
      console.log(`   Session: ${tenancy.paymentDetails.stripeSessionId.slice(-8)}`);
      console.log('');
    });
    
    console.log('✅ All Stripe payments linked to tenancies!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
  }
}

linkStripePaymentsToTenancies();