/**
 * Manually Process Payment (For Testing)
 * Use this when webhook is not working
 */

const path = require('path');
require('dotenv').config();

const mongoose = require('mongoose');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Import models
const Lead = require('./src/models/Lead');
const Tenancy = require('./src/models/Tenancy');
const User = require('./src/models/User');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function manualProcessPayment() {
  console.log('🔧 Manual Payment Processing...');
  console.log('=' .repeat(50));
  
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');
    
    // Get recent Stripe sessions
    console.log('\n📋 Recent Stripe Sessions:');
    const sessions = await stripe.checkout.sessions.list({ limit: 5 });
    
    sessions.data.forEach((session, index) => {
      console.log(`${index + 1}. Session ID: ${session.id}`);
      console.log(`   Status: ${session.payment_status}`);
      console.log(`   Amount: ₹${session.amount_total / 100}`);
      console.log(`   Customer Email: ${session.customer_details?.email || 'N/A'}`);
      console.log(`   Created: ${new Date(session.created * 1000).toLocaleString()}`);
      console.log('');
    });
    
    // Ask user to select session to process
    const sessionToProcess = sessions.data[0]; // Process the most recent one
    
    if (sessionToProcess && sessionToProcess.payment_status === 'paid') {
      console.log(`🔄 Processing session: ${sessionToProcess.id}`);
      
      // Extract customer info
      const customerEmail = sessionToProcess.customer_details?.email;
      const customerName = sessionToProcess.customer_details?.name || 'Customer';
      const businessName = sessionToProcess.metadata?.businessName || `${customerName}'s Business`;
      
      if (!customerEmail) {
        console.log('❌ No customer email found in session');
        return;
      }
      
      // Create/update lead
      let lead = await Lead.findOne({ email: customerEmail });
      if (lead) {
        console.log('📝 Updating existing lead...');
        lead.status = 'converted';
        lead.paymentDetails = {
          stripeSessionId: sessionToProcess.id,
          amount: sessionToProcess.amount_total / 100,
          paidAt: new Date()
        };
        await lead.save();
      } else {
        console.log('📝 Creating new lead...');
        lead = await Lead.create({
          name: customerName,
          email: customerEmail,
          businessName: businessName,
          contactPerson: {
            name: customerName,
            email: customerEmail,
            phone: '+91 9876543210' // Default phone for manual processing
          },
          source: 'website', // Use valid enum value
          status: 'converted',
          plan: sessionToProcess.metadata?.planName || 'basic',
          paymentDetails: {
            stripeSessionId: sessionToProcess.id,
            amount: sessionToProcess.amount_total / 100,
            paidAt: new Date()
          }
        });
      }
      
      console.log('✅ Lead processed:', lead.email);
      
      // Generate subdomain
      const subdomain = businessName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 15) + Math.random().toString(36).substring(2, 6);
      
      // Create tenancy
      const tenancy = await Tenancy.create({
        name: businessName,
        subdomain: subdomain,
        slug: subdomain, // Add required slug field
        plan: sessionToProcess.metadata?.planName || 'basic',
        status: 'active',
        owner: lead._id,
        paymentDetails: {
          stripeSessionId: sessionToProcess.id,
          lastPayment: {
            amount: sessionToProcess.amount_total / 100,
            date: new Date(),
            method: 'stripe'
          }
        },
        settings: {
          businessName: businessName,
          contactEmail: customerEmail
        }
      });
      
      console.log('✅ Tenancy created:', tenancy.subdomain);
      
      // Generate temp password
      const tempPassword = crypto.randomBytes(8).toString('hex').toUpperCase();
      const hashedPassword = await bcrypt.hash(tempPassword, 12);
      
      // Create admin user
      const adminUser = await User.create({
        name: customerName,
        email: customerEmail,
        password: hashedPassword,
        phone: '9876543210', // Valid 10-digit phone
        role: 'admin',
        tenancy: tenancy._id,
        isActive: true,
        isEmailVerified: true,
        permissions: {
          orders: { view: true, create: true, update: true, delete: true, assign: true, cancel: true, process: true, export: true },
          staff: { view: true, create: true, update: true, delete: true, assignShift: true, manageAttendance: true, export: true },
          inventory: { view: true, create: true, update: true, delete: true, restock: true, writeOff: true, export: true },
          services: { view: true, create: true, update: true, delete: true, toggle: true, updatePricing: true, export: true }
        },
        createdBy: 'system',
        loginCredentials: {
          tempPassword: tempPassword,
          mustChangePassword: true
        }
      });
      
      console.log('✅ Admin user created:', adminUser.email);
      console.log('🔑 Temporary password:', tempPassword);
      
      // Update lead with tenancy
      lead.tenancy = tenancy._id;
      await lead.save();
      
      console.log('\n🎉 Payment Processing Complete!');
      console.log('=' .repeat(50));
      console.log(`Business: ${businessName}`);
      console.log(`Subdomain: ${subdomain}.laundrylobby.com`);
      console.log(`Admin Email: ${customerEmail}`);
      console.log(`Temp Password: ${tempPassword}`);
      console.log(`Amount Paid: ₹${sessionToProcess.amount_total / 100}`);
      
    } else {
      console.log('❌ No paid sessions found to process');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
  }
}

manualProcessPayment();