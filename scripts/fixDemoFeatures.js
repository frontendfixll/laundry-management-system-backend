/**
 * Quick fix: enable ALL features for the demo tenant
 * Run once: node scripts/fixDemoFeatures.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

const Tenancy = require('../src/models/Tenancy');

const ALL_FEATURES = {
  // Core laundry
  wash_fold: true,
  dry_cleaning: true,
  ironing: true,
  express_delivery: true,
  subscription_orders: true,

  // Platform - all sidebar pages
  orders: true,
  customers: true,
  inventory: true,
  services: true,
  branches: true,
  branch_admins: true,
  logistics: true,
  tickets: true,
  reviews: true,
  refunds: true,
  payments: true,
  settings: true,

  // Marketing programs
  campaigns: true,
  coupons: true,
  discounts: true,
  banners: true,
  wallet: true,
  referral_program: true,
  loyalty_points: true,
  advanced_analytics: true,
  api_access: true,

  // Branding
  custom_branding: true,
  custom_logo: true,
  custom_domain: true,
  white_label: true,

  // Support
  priority_support: true,
  dedicated_manager: true,
  platform_support: true,

  // Limits (set high for demo)
  max_orders: 10000,
  max_staff: 100,
  max_customers: 10000,
  max_branches: 20,
};

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  console.log('✅ Connected');

  const result = await Tenancy.findOneAndUpdate(
    { slug: 'demo' },
    { $set: { 'subscription.features': ALL_FEATURES } },
    { new: true }
  );

  if (!result) {
    console.log('❌ Demo tenant not found. Run demoSeeder.js first.');
  } else {
    console.log('✅ Demo tenant features updated!');
    console.log('   Features enabled:', Object.keys(ALL_FEATURES).filter(k => ALL_FEATURES[k] === true).join(', '));
  }

  await mongoose.disconnect();
}

fix().catch(err => {
  console.error('❌ Error:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
