const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('🔑 Stripe Key Check:', process.env.STRIPE_SECRET_KEY ? 'Found ✅' : 'Missing ❌');

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY not found in environment');
  process.exit(1);
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function checkStripeToday() {
  console.log('🔍 Checking Stripe sessions for today...');
  console.log('📅 Today: February 3, 2026');
  
  try {
    // Get sessions from last 24 hours
    const yesterday = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
    
    const sessions = await stripe.checkout.sessions.list({
      created: { gte: yesterday },
      limit: 20
    });
    
    console.log(`\n💳 Found ${sessions.data.length} Stripe sessions in last 24 hours:`);
    
    if (sessions.data.length === 0) {
      console.log('❌ No Stripe sessions found in last 24 hours');
      console.log('   This means no payment attempts were made today');
      return;
    }
    
    sessions.data.forEach((session, index) => {
      const createdDate = new Date(session.created * 1000);
      console.log(`\n${index + 1}. Session ID: ${session.id}`);
      console.log(`   Status: ${session.status}`);
      console.log(`   Payment Status: ${session.payment_status}`);
      console.log(`   Amount: ₹${session.amount_total ? (session.amount_total / 100).toLocaleString() : 'N/A'}`);
      console.log(`   Created: ${createdDate.toLocaleString('en-IN')}`);
      console.log(`   Customer Email: ${session.customer_details?.email || session.customer_email || 'N/A'}`);
      
      if (session.metadata) {
        console.log(`   Plan: ${session.metadata.planName || 'N/A'}`);
        console.log(`   Billing: ${session.metadata.billingCycle || 'N/A'}`);
        console.log(`   Source: ${session.metadata.source || 'N/A'}`);
      }
      
      if (session.payment_intent) {
        console.log(`   Payment Intent: ${session.payment_intent}`);
      }
    });
    
    // Check for today's completed payments
    const today = new Date();
    const todayPaid = sessions.data.filter(s => {
      const sessionDate = new Date(s.created * 1000);
      return sessionDate.toDateString() === today.toDateString() && s.payment_status === 'paid';
    });
    
    if (todayPaid.length > 0) {
      console.log(`\n🚨 CRITICAL: FOUND ${todayPaid.length} COMPLETED PAYMENTS TODAY MISSING FROM DATABASE!`);
      console.log('These payments were successful on Stripe but not processed by webhook:');
      
      todayPaid.forEach((s, index) => {
        console.log(`\n${index + 1}. ✅ SUCCESSFUL PAYMENT:`);
        console.log(`   Session: ${s.id}`);
        console.log(`   Amount: ₹${(s.amount_total/100).toLocaleString()}`);
        console.log(`   Email: ${s.customer_details?.email || 'N/A'}`);
        console.log(`   Plan: ${s.metadata?.planName || 'N/A'}`);
        console.log(`   Business: ${s.metadata?.businessName || s.custom_fields?.find(f => f.key === 'business_name')?.text?.value || 'N/A'}`);
        console.log(`   ⚠️  WEBHOOK FAILED - Need manual processing`);
      });
      
      console.log('\n🔧 SOLUTION:');
      console.log('1. These payments need to be manually processed');
      console.log('2. Create business accounts for these customers');
      console.log('3. Fix webhook configuration to prevent future issues');
      
    } else {
      console.log('\n✅ No completed payments found today');
      console.log('   Either no payments were made or all were processed correctly');
    }
    
    // Check for failed/incomplete payments
    const todayIncomplete = sessions.data.filter(s => {
      const sessionDate = new Date(s.created * 1000);
      return sessionDate.toDateString() === today.toDateString() && s.payment_status !== 'paid';
    });
    
    if (todayIncomplete.length > 0) {
      console.log(`\n⚠️  Found ${todayIncomplete.length} incomplete/failed payments today:`);
      todayIncomplete.forEach((s, index) => {
        console.log(`${index + 1}. ${s.payment_status.toUpperCase()}: ${s.id}`);
        console.log(`   Amount: ₹${(s.amount_total/100).toLocaleString()}`);
        console.log(`   Email: ${s.customer_details?.email || 'N/A'}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Stripe API Error:', error.message);
    if (error.type === 'StripeAuthenticationError') {
      console.error('   Check your STRIPE_SECRET_KEY in .env file');
    }
  }
}

checkStripeToday();