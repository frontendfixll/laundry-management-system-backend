/**
 * Migrate Billing Features
 * Run: node scripts/migrate-billing-features.js
 * 
 * Migrates existing billing plans and tenancies to use the new dynamic features system
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { BillingPlan } = require('../src/models/TenancyBilling');
const Tenancy = require('../src/models/Tenancy');
const FeatureDefinition = require('../src/models/FeatureDefinition');

// Mapping from old feature keys to new feature keys
const featureKeyMapping = {
  maxOrders: 'max_orders',
  maxStaff: 'max_staff',
  maxCustomers: 'max_customers',
  maxBranches: 'max_branches',
  customDomain: 'custom_domain',
  advancedAnalytics: 'advanced_analytics',
  apiAccess: 'api_access',
  whiteLabel: 'white_label',
  prioritySupport: 'priority_support',
  customBranding: 'custom_branding'
};

// Default features for each plan tier
const planDefaults = {
  free: {
    // Admin Permissions
    branch_management: false,
    branch_admin_rbac: false,
    staff_management: true,
    custom_roles: false,
    inventory_management: false,
    service_management: true,
    logistics_management: false,
    payment_management: true,
    customer_management: true,
    reports_export: false,
    // Platform
    campaigns: false,
    coupons: false,
    banners: false,
    wallet: false,
    referral_program: false,
    loyalty_points: false,
    advanced_analytics: false,
    api_access: false,
    // Limits
    max_orders: 100,
    max_staff: 2,
    max_customers: 100,
    max_branches: 1,
    // Branding
    custom_branding: false,
    custom_logo: false,
    custom_domain: false,
    white_label: false,
    // Support
    priority_support: false,
    dedicated_manager: false
  },
  basic: {
    // Admin Permissions
    branch_management: false,
    branch_admin_rbac: false,
    staff_management: true,
    custom_roles: false,
    inventory_management: true,
    service_management: true,
    logistics_management: true,
    payment_management: true,
    customer_management: true,
    reports_export: true,
    // Platform
    campaigns: true,
    coupons: true,
    banners: true,
    wallet: false,
    referral_program: false,
    loyalty_points: false,
    advanced_analytics: false,
    api_access: false,
    // Limits
    max_orders: 500,
    max_staff: 5,
    max_customers: 500,
    max_branches: 1,
    // Branding
    custom_branding: true,
    custom_logo: true,
    custom_domain: false,
    white_label: false,
    // Support
    priority_support: false,
    dedicated_manager: false
  },
  pro: {
    // Admin Permissions
    branch_management: true,
    branch_admin_rbac: true,
    staff_management: true,
    custom_roles: true,
    inventory_management: true,
    service_management: true,
    logistics_management: true,
    payment_management: true,
    customer_management: true,
    reports_export: true,
    // Platform
    campaigns: true,
    coupons: true,
    banners: true,
    wallet: true,
    referral_program: true,
    loyalty_points: true,
    advanced_analytics: true,
    api_access: false,
    // Limits
    max_orders: 2000,
    max_staff: 20,
    max_customers: 5000,
    max_branches: 3,
    // Branding
    custom_branding: true,
    custom_logo: true,
    custom_domain: true,
    white_label: false,
    // Support
    priority_support: true,
    dedicated_manager: false
  },
  enterprise: {
    // Admin Permissions
    branch_management: true,
    branch_admin_rbac: true,
    staff_management: true,
    custom_roles: true,
    inventory_management: true,
    service_management: true,
    logistics_management: true,
    payment_management: true,
    customer_management: true,
    reports_export: true,
    // Platform
    campaigns: true,
    coupons: true,
    banners: true,
    wallet: true,
    referral_program: true,
    loyalty_points: true,
    advanced_analytics: true,
    api_access: true,
    // Limits (-1 = unlimited)
    max_orders: -1,
    max_staff: -1,
    max_customers: -1,
    max_branches: -1,
    // Branding
    custom_branding: true,
    custom_logo: true,
    custom_domain: true,
    white_label: true,
    // Support
    priority_support: true,
    dedicated_manager: true
  }
};

async function migratePlans() {
  console.log('\n========== Migrating Billing Plans ==========\n');
  
  const plans = await BillingPlan.find({});
  let updated = 0;
  
  for (const plan of plans) {
    const planName = plan.name.toLowerCase();
    
    // Get default features for this plan tier, or use basic as fallback
    const defaults = planDefaults[planName] || planDefaults.basic;
    
    // Merge existing features with defaults
    const existingFeatures = plan.features instanceof Map 
      ? Object.fromEntries(plan.features)
      : plan.features || {};
    
    // Convert old feature keys to new keys
    const migratedFeatures = {};
    for (const [oldKey, newKey] of Object.entries(featureKeyMapping)) {
      if (existingFeatures[oldKey] !== undefined) {
        migratedFeatures[newKey] = existingFeatures[oldKey];
      }
    }
    
    // Also check legacyFeatures
    if (plan.legacyFeatures) {
      for (const [oldKey, newKey] of Object.entries(featureKeyMapping)) {
        if (plan.legacyFeatures[oldKey] !== undefined && migratedFeatures[newKey] === undefined) {
          migratedFeatures[newKey] = plan.legacyFeatures[oldKey];
        }
      }
    }
    
    // Merge: defaults < existing < migrated
    const finalFeatures = { ...defaults, ...existingFeatures, ...migratedFeatures };
    
    // Update plan
    plan.features = new Map(Object.entries(finalFeatures));
    plan.isDefault = ['free', 'basic', 'pro', 'enterprise'].includes(planName);
    plan.sortOrder = ['free', 'basic', 'pro', 'enterprise'].indexOf(planName);
    if (plan.sortOrder === -1) plan.sortOrder = 100;
    
    // Set popular flag for pro plan
    if (planName === 'pro') {
      plan.isPopular = true;
      plan.badge = 'Most Popular';
    }
    
    await plan.save();
    updated++;
    console.log(`Updated plan: ${plan.displayName} (${plan.name})`);
  }
  
  console.log(`\nTotal plans updated: ${updated}`);
  return updated;
}

async function migrateTenancies() {
  console.log('\n========== Migrating Tenancies ==========\n');
  
  const tenancies = await Tenancy.find({});
  let updated = 0;
  
  for (const tenancy of tenancies) {
    const planName = tenancy.subscription?.plan?.toLowerCase() || 'free';
    
    // Get the billing plan
    const billingPlan = await BillingPlan.findOne({ name: planName });
    
    if (billingPlan) {
      // Get features from billing plan
      const planFeatures = billingPlan.features instanceof Map
        ? Object.fromEntries(billingPlan.features)
        : billingPlan.features || {};
      
      // Update tenancy subscription features
      tenancy.subscription.features = planFeatures;
      
      await tenancy.save();
      updated++;
      console.log(`Updated tenancy: ${tenancy.name} (plan: ${planName})`);
    } else {
      console.log(`Skipped tenancy: ${tenancy.name} (plan not found: ${planName})`);
    }
  }
  
  console.log(`\nTotal tenancies updated: ${updated}`);
  return updated;
}

async function createDefaultPlans() {
  console.log('\n========== Creating Default Plans ==========\n');
  
  const defaultPlans = [
    {
      name: 'free',
      displayName: 'Free',
      description: 'Perfect for trying out the platform',
      price: { monthly: 0, yearly: 0 },
      trialDays: 0,
      isDefault: true,
      sortOrder: 0
    },
    {
      name: 'basic',
      displayName: 'Basic',
      description: 'Great for small laundry businesses',
      price: { monthly: 999, yearly: 9990 },
      trialDays: 14,
      isDefault: true,
      sortOrder: 1
    },
    {
      name: 'pro',
      displayName: 'Pro',
      description: 'For growing businesses with multiple services',
      price: { monthly: 2499, yearly: 24990 },
      trialDays: 14,
      isDefault: true,
      isPopular: true,
      badge: 'Most Popular',
      sortOrder: 2
    },
    {
      name: 'enterprise',
      displayName: 'Enterprise',
      description: 'For large operations with unlimited needs',
      price: { monthly: 4999, yearly: 49990 },
      trialDays: 30,
      isDefault: true,
      sortOrder: 3
    }
  ];
  
  let created = 0;
  
  for (const planData of defaultPlans) {
    const existing = await BillingPlan.findOne({ name: planData.name });
    
    if (!existing) {
      const features = planDefaults[planData.name] || planDefaults.basic;
      
      await BillingPlan.create({
        ...planData,
        features: new Map(Object.entries(features)),
        showOnMarketing: true,
        isActive: true
      });
      
      created++;
      console.log(`Created plan: ${planData.displayName}`);
    } else {
      console.log(`Plan already exists: ${planData.displayName}`);
    }
  }
  
  console.log(`\nTotal plans created: ${created}`);
  return created;
}

async function runMigration() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry-platform';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    
    // First, ensure feature definitions exist
    const featureCount = await FeatureDefinition.countDocuments();
    if (featureCount === 0) {
      console.log('\nNo feature definitions found. Please run seed-feature-definitions.js first.');
      console.log('Run: node scripts/seed-feature-definitions.js\n');
      process.exit(1);
    }
    
    // Create default plans if they don't exist
    await createDefaultPlans();
    
    // Migrate existing plans
    await migratePlans();
    
    // Migrate existing tenancies
    await migrateTenancies();
    
    console.log('\n========== Migration Complete ==========\n');
    
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  runMigration();
}

module.exports = { runMigration, planDefaults };
