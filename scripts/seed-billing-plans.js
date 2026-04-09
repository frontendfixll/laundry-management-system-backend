require('dotenv').config();
const mongoose = require('mongoose');
const { BillingPlan } = require('../src/models/TenancyBilling');

const plans = [
  {
    name: 'free',
    displayName: 'Free',
    price: { monthly: 0, yearly: 0 },
    trialDays: 5,
    features: {
      maxOrders: 10,
      maxStaff: 1,
      maxCustomers: 2,
      maxBranches: 1,
      wash_fold: true,
      dry_cleaning: true,
      ironing: true,
      customDomain: false,
      advancedAnalytics: false,
      apiAccess: false,
      whiteLabel: false,
      prioritySupport: false,
      customBranding: false,
      campaigns: false,
      loyalty_points: false,
      sms_notifications: false
    }
  },
  {
    name: 'basic',
    displayName: 'Basic',
    price: { monthly: 999, yearly: 9990 },
    features: {
      maxOrders: 500,
      maxStaff: 5,
      maxCustomers: 1000,
      maxBranches: 2,
      customDomain: false,
      advancedAnalytics: false,
      apiAccess: false,
      whiteLabel: false,
      prioritySupport: false,
      customBranding: true
    }
  },
  {
    name: 'pro',
    displayName: 'Professional',
    price: { monthly: 2499, yearly: 24990 },
    features: {
      maxOrders: 2000,
      maxStaff: 15,
      maxCustomers: 5000,
      maxBranches: 5,
      customDomain: true,
      advancedAnalytics: true,
      apiAccess: false,
      whiteLabel: false,
      prioritySupport: true,
      customBranding: true
    }
  },
  {
    name: 'enterprise',
    displayName: 'Enterprise',
    price: { monthly: 4999, yearly: 49990 },
    features: {
      maxOrders: -1, // Unlimited
      maxStaff: -1,
      maxCustomers: -1,
      maxBranches: -1,
      customDomain: true,
      advancedAnalytics: true,
      apiAccess: true,
      whiteLabel: true,
      prioritySupport: true,
      customBranding: true
    }
  }
];

async function seedPlans() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    for (const plan of plans) {
      await BillingPlan.findOneAndUpdate(
        { name: plan.name },
        plan,
        { upsert: true, new: true }
      );
      console.log(`✓ ${plan.displayName} plan created/updated`);
    }

    console.log('\n✅ All billing plans seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding plans:', error);
    process.exit(1);
  }
}

seedPlans();
