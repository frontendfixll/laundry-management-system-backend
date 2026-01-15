const mongoose = require('mongoose');
const Tenancy = require('../src/models/Tenancy');
require('dotenv').config();

/**
 * Script to enable features for a tenancy
 * Usage: node backend/scripts/enable-tenancy-features.js
 */

async function enableFeatures() {
  try {
    console.log('🚀 Connecting to MongoDB...\n');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✓ Connected to MongoDB\n');
    
    // List all tenancies
    const tenancies = await Tenancy.find({}).select('name slug subscription.features');
    
    if (tenancies.length === 0) {
      console.log('❌ No tenancies found!');
      return;
    }
    
    console.log('📋 Available Tenancies:\n');
    tenancies.forEach((t, index) => {
      console.log(`${index + 1}. ${t.name} (${t.slug})`);
      console.log(`   Current features:`, t.subscription?.features || {});
      console.log('');
    });
    
    // For now, enable features for ALL tenancies
    console.log('🔧 Enabling features for all tenancies...\n');
    
    const featuresToEnable = {
      // Core Features
      branches: true,
      branch_admins: true,
      orders: true,
      customers: true,
      inventory: true,
      services: true,
      
      // Marketing & Programs
      campaigns: true,
      banners: true,
      coupons: true,
      discounts: true,
      referral_program: true,
      loyalty_points: true,
      wallet: true,
      
      // Operations
      logistics: true,
      tickets: true,
      reviews: true,
      refunds: true,
      
      // Finance & Analytics
      payments: true,
      advanced_analytics: true,
      
      // Settings
      custom_branding: true,
      
      // Limits (use -1 for unlimited)
      max_orders: -1,
      max_staff: -1,
      max_customers: -1,
      max_branches: -1
    };
    
    for (const tenancy of tenancies) {
      // Merge existing features with new ones
      const updatedFeatures = {
        ...tenancy.subscription?.features,
        ...featuresToEnable
      };
      
      await Tenancy.findByIdAndUpdate(
        tenancy._id,
        { 
          $set: { 
            'subscription.features': updatedFeatures 
          } 
        }
      );
      
      console.log(`✓ Enabled features for: ${tenancy.name}`);
    }
    
    console.log('\n✅ All features enabled successfully!\n');
    
    // Show updated tenancies
    const updated = await Tenancy.find({}).select('name subscription.features');
    console.log('📊 Updated Features:\n');
    updated.forEach(t => {
      console.log(`${t.name}:`);
      console.log(JSON.stringify(t.subscription.features, null, 2));
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.disconnect();
    console.log('✓ Disconnected from MongoDB');
  }
}

enableFeatures();
