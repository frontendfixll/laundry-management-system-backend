/**
 * Complete Direct Purchase Records
 * This script adds missing payment records and lead records for processed direct purchases
 */

require('dotenv').config();
const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Import models
const Lead = require('./src/models/Lead');
const Tenancy = require('./src/models/Tenancy');
const User = require('./src/models/User');
const { TenancyPayment } = require('./src/models/TenancyBilling');

async function completeDirectPurchaseRecords() {
  console.log('🔄 COMPLETING DIRECT PURCHASE RECORDS');
  console.log('='.repeat(60));
  
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');
    
    // Get recent Stripe sessions
    const sessions = await stripe.checkout.sessions.list({ limit: 20 });
    const paidSessions = sessions.data.filter(s => s.payment_status === 'paid');
    
    console.log(`\n📋 Found ${paidSessions.length} paid sessions to complete`);
    
    let completedCount = 0;
    
    for (let i = 0; i < paidSessions.length; i++) {
      const session = paidSessions[i];
      
      try {
        console.log(`\n🔄 Completing session ${i + 1}/${paidSessions.length}: ${session.id.slice(-8)}`);
        
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
        console.log(`💰 Amount: ₹${amount}`);
        
        if (!customerEmail) {
          console.log('❌ No customer email - skipping');
          continue;
        }
        
        // Find the tenancy
        const tenancy = await Tenancy.findOne({
          $or: [
            { 'settings.contactEmail': customerEmail },
            { name: businessName }
          ]
        });
        
        if (!tenancy) {
          console.log('❌ No tenancy found - skipping');
          continue;
        }
        
        console.log(`✅ Found tenancy: ${tenancy.slug}`);
        
        // Check if payment record exists
        let paymentRecord = await TenancyPayment.findOne({
          tenancy: tenancy._id,
          transactionId: session.payment_intent
        });
        
        if (!paymentRecord) {
          // Create payment record
          paymentRecord = await TenancyPayment.create({
            tenancy: tenancy._id,
            amount,
            currency: 'INR',
            status: 'completed',
            paymentMethod: 'card',
            transactionId: session.payment_intent,
            gateway: 'stripe',
            gatewayResponse: {
              sessionId: session.id,
              customerId: session.customer
            },
            notes: `Direct plan purchase: ${planName} (${billingCycle})`
          });
          console.log(`✅ Created payment record: ₹${amount}`);
        } else {
          console.log(`⚠️ Payment record already exists`);
        }
        
        // Check if lead record exists
        let leadRecord = await Lead.findOne({
          $or: [
            { 'contactPerson.email': customerEmail },
            { tenancyId: tenancy._id }
          ]
        });
        
        if (!leadRecord) {
          // Map plan names to valid enum values
          const planMapping = {
            'basic': 'basic',
            'pro': 'pro', 
            'enterprise': 'enterprise',
            'admin_bano': 'custom',
            'free': 'free'
          };
          
          const validPlan = planMapping[planName] || 'undecided';
          
          // Create lead record for sales tracking
          leadRecord = await Lead.create({
            businessName,
            businessType: 'laundry',
            contactPerson: {
              name: customerName,
              email: customerEmail,
              phone: customerPhone || '9999999999' // Provide default phone
            },
            source: 'website', // Use valid enum value instead of 'direct_checkout'
            status: 'converted',
            interestedPlan: validPlan,
            estimatedRevenue: amount,
            isConverted: true,
            convertedDate: new Date(session.created * 1000),
            tenancyId: tenancy._id,
            paymentDetails: {
              stripeSessionId: session.id,
              amount,
              paidAt: new Date(session.created * 1000)
            },
            tags: ['direct_purchase', 'auto_converted', 'stripe_payment']
          });
          console.log(`✅ Created lead record: ${leadRecord.status}`);
        } else {
          // Update existing lead if it's not marked as direct purchase
          if (!leadRecord.tags || !leadRecord.tags.includes('direct_purchase')) {
            leadRecord.status = 'converted';
            leadRecord.isConverted = true;
            leadRecord.convertedDate = new Date(session.created * 1000);
            leadRecord.tenancyId = tenancy._id;
            leadRecord.paymentDetails = {
              stripeSessionId: session.id,
              amount,
              paidAt: new Date(session.created * 1000)
            };
            leadRecord.tags = leadRecord.tags || [];
            leadRecord.tags.push('direct_purchase', 'auto_converted', 'stripe_payment');
            await leadRecord.save();
            console.log(`✅ Updated existing lead record`);
          } else {
            console.log(`⚠️ Lead record already exists and is correct`);
          }
        }
        
        // Update tenancy source if not set
        if (!tenancy.source || tenancy.source !== 'direct_checkout') {
          tenancy.source = 'direct_checkout';
          await tenancy.save();
          console.log(`✅ Updated tenancy source`);
        }
        
        completedCount++;
        console.log('✅ Session completion successful');
        
      } catch (error) {
        console.error(`❌ Error completing session ${session.id.slice(-8)}:`, error.message);
      }
    }
    
    // Final statistics
    console.log('\n🎉 COMPLETION FINISHED!');
    console.log('='.repeat(40));
    console.log(`✅ Completed: ${completedCount}`);
    
    // Show updated statistics
    const totalDirectLeads = await Lead.countDocuments({ tags: { $in: ['direct_purchase'] } });
    const totalDirectTenancies = await Tenancy.countDocuments({ source: 'direct_checkout' });
    const totalDirectPayments = await TenancyPayment.countDocuments({ 
      notes: { $regex: /direct.*purchase/i }
    });
    const totalDirectRevenue = await TenancyPayment.aggregate([
      { $match: { notes: { $regex: /direct.*purchase/i } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    console.log('\n📈 UPDATED STATISTICS:');
    console.log(`Direct Purchase Leads: ${totalDirectLeads}`);
    console.log(`Direct Purchase Tenancies: ${totalDirectTenancies}`);
    console.log(`Direct Purchase Payments: ${totalDirectPayments}`);
    console.log(`Total Direct Purchase Revenue: ₹${totalDirectRevenue[0]?.total || 0}`);
    
    // Show recent direct purchases
    console.log('\n🎯 RECENT DIRECT PURCHASES:');
    const recentDirectLeads = await Lead.find({ 
      tags: { $in: ['direct_purchase'] },
      status: 'converted'
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('tenancyId', 'name slug status');
    
    recentDirectLeads.forEach((lead, index) => {
      console.log(`${index + 1}. ${lead.businessName}`);
      console.log(`   Email: ${lead.contactPerson.email}`);
      console.log(`   Plan: ${lead.interestedPlan}`);
      console.log(`   Revenue: ₹${lead.estimatedRevenue}`);
      console.log(`   Tenancy: ${lead.tenancyId?.slug || 'Not linked'}`);
      console.log(`   Date: ${lead.convertedDate?.toLocaleDateString() || lead.createdAt.toLocaleDateString()}`);
      console.log('');
    });
    
    console.log('✅ All direct purchase records completed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
  }
}

completeDirectPurchaseRecords();