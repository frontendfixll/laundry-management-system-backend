#!/usr/bin/env node

/**
 * Create a demo tenant for showcasing the platform
 * Usage: node create-demo-tenant.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Tenancy = require('./src/models/Tenancy');
const User = require('./src/models/User');
const { BillingPlan } = require('./src/models/TenancyBilling');

async function createDemoTenant() {
  try {
    console.log('🎭 Creating Demo Tenant for LaundryPro');
    console.log('=====================================');

    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to database');

    // Check if demo tenant already exists
    const existingTenant = await Tenancy.findOne({ subdomain: 'demo-laundry' });
    if (existingTenant) {
      console.log('⚠️ Demo tenant already exists');
      console.log(`   URL: https://demo-laundry.${process.env.MAIN_DOMAIN || 'laundrypro.com'}`);
      console.log(`   Admin: ${existingTenant.owner}`);
      process.exit(0);
    }

    // Check if demo user already exists
    const existingUser = await User.findOne({ email: 'demo@laundrypro.com' });
    if (existingUser) {
      console.log('⚠️ Demo user already exists, deleting...');
      await User.findByIdAndDelete(existingUser._id);
    }

    // Create demo admin user
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('demo123', salt);

    const demoUser = new User({
      name: 'Demo Admin',
      email: 'demo@laundrypro.com',
      phone: '9876543210',
      password: hashedPassword,
      role: 'admin',
      isActive: true,
      isEmailVerified: true
    });

    await demoUser.save();
    console.log('✅ Demo admin user created');
    console.log(`   Email: demo@laundrypro.com`);
    console.log(`   Password: demo123`);

    // Get billing plan features
    let planFeatures = {};
    try {
      const billingPlan = await BillingPlan.findOne({ name: 'pro' });
      if (billingPlan) {
        planFeatures = billingPlan.features instanceof Map 
          ? Object.fromEntries(billingPlan.features)
          : billingPlan.features || {};
      }
    } catch (error) {
      console.log('⚠️ Could not load billing plan, using default features');
      planFeatures = {
        maxOrders: 1000,
        maxStaff: 50,
        maxBranches: 10,
        maxCustomers: 5000,
        analytics: true,
        campaigns: true,
        loyalty: true,
        api: true
      };
    }

    // Create demo tenant
    const demoTenant = new Tenancy({
      name: 'Demo Laundry Service',
      slug: 'demo-laundry',
      description: 'A demonstration laundry service showcasing LaundryPro platform capabilities',
      subdomain: 'demo-laundry',
      
      // Branding
      branding: {
        businessName: 'Demo Laundry Service',
        tagline: 'Clean Clothes, Happy Life!',
        slogan: 'Your trusted laundry partner since 2024',
        theme: {
          primaryColor: '#3B82F6',
          secondaryColor: '#10B981',
          accentColor: '#F59E0B',
          backgroundColor: '#FFFFFF'
        },
        socialMedia: {
          facebook: 'https://facebook.com/demolaundry',
          instagram: 'https://instagram.com/demolaundry',
          whatsapp: '+919876543210'
        }
      },
      
      // Contact
      contact: {
        phone: '+919876543210',
        email: 'contact@demolaundry.com',
        address: {
          street: '123 Demo Street',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          country: 'India'
        }
      },
      
      // Business Hours
      businessHours: {
        monday: { open: '08:00', close: '22:00', isOpen: true },
        tuesday: { open: '08:00', close: '22:00', isOpen: true },
        wednesday: { open: '08:00', close: '22:00', isOpen: true },
        thursday: { open: '08:00', close: '22:00', isOpen: true },
        friday: { open: '08:00', close: '22:00', isOpen: true },
        saturday: { open: '08:00', close: '22:00', isOpen: true },
        sunday: { open: '10:00', close: '20:00', isOpen: true }
      },
      
      // Subscription
      subscription: {
        plan: 'pro',
        status: 'active',
        features: planFeatures,
        trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year trial
        startDate: new Date(),
        billingCycle: 'monthly'
      },
      
      // Settings
      settings: {
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        language: 'en',
        taxRate: 18,
        minOrderAmount: 100,
        maxDeliveryRadius: 15,
        autoAssignOrders: true,
        allowCOD: true,
        allowOnlinePayment: true,
        requireEmailVerification: false
      },
      
      owner: demoUser._id,
      status: 'active',
      
      // DNS Record (for Vercel)
      dnsRecord: {
        recordId: `vercel-demo-laundry-${Date.now()}`,
        provider: 'vercel',
        createdAt: new Date()
      }
    });

    await demoTenant.save();
    console.log('✅ Demo tenant created successfully');

    // Update user with tenancy reference
    demoUser.tenancy = demoTenant._id;
    await demoUser.save();

    console.log('');
    console.log('🎉 Demo Tenant Setup Complete!');
    console.log('================================');
    console.log(`🌐 Demo URL: https://demo-laundry.${process.env.MAIN_DOMAIN || 'laundrypro.com'}`);
    console.log(`👤 Admin Login: demo@laundrypro.com`);
    console.log(`🔑 Password: demo123`);
    console.log(`🏢 Business: ${demoTenant.branding.businessName}`);
    console.log(`📱 Phone: ${demoTenant.contact.phone}`);
    console.log(`📧 Email: ${demoTenant.contact.email}`);
    console.log('');
    console.log('💡 You can now:');
    console.log('   - Visit the demo tenant portal');
    console.log('   - Login as admin to see the dashboard');
    console.log('   - Create test orders and customers');
    console.log('   - Showcase the platform to potential clients');
    console.log('');
    console.log('🔗 Add this to your marketing site demo buttons!');

  } catch (error) {
    console.error('❌ Failed to create demo tenant:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('📤 Disconnected from database');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Process interrupted');
  await mongoose.disconnect();
  process.exit(0);
});

// Run the script
createDemoTenant();