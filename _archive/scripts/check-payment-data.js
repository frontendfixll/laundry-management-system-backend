/**
 * Check Payment Data
 * This script checks the current payment data in the database
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const { TenancyPayment } = require('./src/models/TenancyBilling');
const Tenancy = require('./src/models/Tenancy');

async function checkPaymentData() {
  console.log('🔍 CHECKING PAYMENT DATA');
  console.log('='.repeat(60));
  
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');
    
    // Get all payments with tenancy details
    const payments = await TenancyPayment.find({})
      .populate('tenancy', 'name slug')
      .sort({ createdAt: -1 });
    
    console.log(`\n📋 Found ${payments.length} payments in database`);
    
    if (payments.length === 0) {
      console.log('❌ No payments found in TenancyPayment collection');
      return;
    }
    
    console.log('\n💳 PAYMENT RECORDS:');
    console.log('='.repeat(80));
    
    let totalRevenue = 0;
    
    payments.forEach((payment, index) => {
      const tenancyName = payment.tenancy?.name || 'Unknown Tenancy';
      const amount = payment.amount || 0;
      const status = payment.status || 'unknown';
      const method = payment.paymentMethod || 'unknown';
      const transactionId = payment.transactionId || 'N/A';
      const date = payment.createdAt ? payment.createdAt.toLocaleDateString() : 'N/A';
      
      console.log(`${index + 1}. ${tenancyName}`);
      console.log(`   Amount: ₹${amount}`);
      console.log(`   Status: ${status}`);
      console.log(`   Method: ${method}`);
      console.log(`   Transaction ID: ${transactionId}`);
      console.log(`   Date: ${date}`);
      console.log(`   Notes: ${payment.notes || 'None'}`);
      console.log('');
      
      if (status === 'completed' && amount > 0) {
        totalRevenue += amount;
      }
    });
    
    console.log('📊 PAYMENT SUMMARY:');
    console.log(`Total Payments: ${payments.length}`);
    console.log(`Total Revenue: ₹${totalRevenue}`);
    console.log(`Completed Payments: ${payments.filter(p => p.status === 'completed').length}`);
    console.log(`Pending Payments: ${payments.filter(p => p.status === 'pending').length}`);
    
    // Check for direct purchase payments
    const directPurchasePayments = payments.filter(p => 
      p.notes && p.notes.includes('Direct plan purchase')
    );
    
    console.log(`\n💳 DIRECT PURCHASE PAYMENTS: ${directPurchasePayments.length}`);
    directPurchasePayments.forEach((payment, index) => {
      console.log(`${index + 1}. ${payment.tenancy?.name || 'Unknown'} - ₹${payment.amount}`);
    });
    
    console.log('\n✅ Payment data check complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
  }
}

checkPaymentData();