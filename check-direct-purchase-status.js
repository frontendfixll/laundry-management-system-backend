/**
 * Check Direct Purchase Status
 * This script checks the status of all direct purchases and shows what's been processed
 */

require('dotenv').config();
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Import models
const Lead = require('./src/models/Lead');
const Tenancy = require('./src/models/Tenancy');
const User = require('./src/models/User');
const { TenancyPayment } = require('./src/models/TenancyBilling');

async function checkDirectPurchaseStatus() {
  console.log('🔍 DIRECT PURCHASE STATUS CHECK');
  console.log('='.repeat(60));
  
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');
    
    // Get recent Stripe sessions
    console.log('\n📋 Recent Stripe Sessions (Last 20):');
    const sessions = await stripe.checkout.sessions.list({ limit: 20 });
    
    const paidSessions = sessions.data.filter(s => s.payment_status === 'paid');
    console.log(`Found ${paidSessions.length} paid sessions`);
    
    // Check each paid session
    for (let i = 0; i < paidSessions.length; i++) {
      const session = paidSessions[i];
      const customerEmail = session.customer_details?.email;
      const businessName = session.metadata?.businessName || 
                          session.custom_fields?.find(f => f.key === 'business_name')?.text?.value ||
                          `${session.customer_details?.name || 'Customer'}'s Business`;
      const planName = session.metadata?.planName || 'unknown';
      const amount = session.amount_total / 100;
      
      console.log(`\n${i + 1}. Session: ${session.id.slice(-8)}`);
      console.log(`   Email: ${customerEmail}`);
      console.log(`   Business: ${businessName}`);
      console.log(`   Plan: ${planName}`);
      console.log(`   Amount: ₹${amount}`);
      console.log(`   Date: ${new Date(session.created * 1000).toLocaleDateString()}`);
      
      // Check if tenancy exists
      const tenancy = await Tenancy.findOne({
        $or: [
          { 'settings.contactEmail': customerEmail },
          { name: businessName }
        ]
      });
      
      if (tenancy) {
        console.log(`   ✅ Tenancy: ${tenancy.slug} (${tenancy.status})`);
        
        // Check if user exists
        const user = await User.findOne({ email: customerEmail, tenancy: tenancy._id });
        if (user) {
          console.log(`   ✅ Admin User: ${user.name} (${user.role})`);
        } else {
          console.log(`   ❌ Admin User: Not found`);
        }
        
        // Check payment record
        const payment = await TenancyPayment.findOne({ 
          tenancy: tenancy._id,
          transactionId: session.payment_intent 
        });
        if (payment) {
          console.log(`   ✅ Payment Record: ₹${payment.amount} (${payment.status})`);
        } else {
          console.log(`   ❌ Payment Record: Not found`);
        }
        
        // Check lead record
        const lead = await Lead.findOne({
          $or: [
            { 'contactPerson.email': customerEmail },
            { tenancyId: tenancy._id }
          ]
        });
        if (lead) {
          console.log(`   ✅ Lead Record: ${lead.status} (${lead.source})`);
        } else {
          console.log(`   ❌ Lead Record: Not found`);
        }
        
      } else {
        console.log(`   ❌ Tenancy: Not found - NEEDS PROCESSING`);
      }
    }
    
    // Summary statistics
    console.log('\n📊 SUMMARY STATISTICS');
    console.log('='.repeat(40));
    
    // Direct purchase leads
    const directLeads = await Lead.find({ source: 'direct_checkout' });
    console.log(`Direct Purchase Leads: ${directLeads.length}`);
    
    // Direct purchase tenancies
    const directTenancies = await Tenancy.find({ source: 'direct_checkout' });
    console.log(`Direct Purchase Tenancies: ${directTenancies.length}`);
    
    // Direct purchase payments
    const directPayments = await TenancyPayment.find({ 
      notes: { $regex: /direct.*purchase/i }
    });
    console.log(`Direct Purchase Payments: ${directPayments.length}`);
    
    // Total revenue from direct purchases
    const totalDirectRevenue = directPayments.reduce((sum, payment) => sum + payment.amount, 0);
    console.log(`Total Direct Purchase Revenue: ₹${totalDirectRevenue}`);
    
    // Show recent direct purchases
    console.log('\n🎯 RECENT DIRECT PURCHASES:');
    const recentDirectLeads = await Lead.find({ 
      source: 'direct_checkout',
      status: 'converted'
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('tenancyId', 'name slug status');
    
    recentDirectLeads.forEach((lead, index) => {
      console.log(`${index + 1}. ${lead.businessName}`);
      console.log(`   Email: ${lead.contactPerson.email}`);
      console.log(`   Plan: ${lead.interestedPlan}`);
      console.log(`   Revenue: ₹${lead.estimatedRevenue}`);
      console.log(`   Tenancy: ${lead.tenancyId?.slug || 'Not linked'}`);
      console.log(`   Date: ${lead.createdAt.toLocaleDateString()}`);
      console.log('');
    });
    
    console.log('✅ Status check complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
  }
}

checkDirectPurchaseStatus();