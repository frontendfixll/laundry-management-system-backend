require('dotenv').config();
const mongoose = require('mongoose');
const { BillingPlan } = require('./src/models/TenancyBilling');

const defaultPlans = [
  {
    name: 'free',
    displayName: 'Free',
    price: { monthly: 0, yearly: 0 },
    features: {
      maxOrders: 50,
      maxStaff: 2,
      maxCustomers: 100,
      maxBranches: 1,
      customDomain: false,
      advancedAnalytics: false,
      apiAccess: false,
      whiteLabel: false,
      prioritySupport: false,
      customBranding: true
    },
    isActive: true
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
      advancedAnalytics: true,
      apiAccess: false,
      whiteLabel: false,
      prioritySupport: false,
      customBranding: true
    },
    isActive: true
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
      apiAccess: true,
      whiteLabel: false,
      prioritySupport: true,
      customBranding: true
    },
    isActive: true
  },
  {
    name: 'enterprise',
    displayName: 'Enterprise',
    price: { monthly: -1, yearly: -1 }, // Custom pricing
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
    },
    isActive: true
  }
];

async function seedBillingPlans() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    for (const plan of defaultPlans) {
      const existing = await BillingPlan.findOne({ name: plan.name });
      if (existing) {
        console.log(`Plan "${plan.name}" already exists, updating...`);
        await BillingPlan.findOneAndUpdate({ name: plan.name }, plan);
      } else {
        console.log(`Creating plan "${plan.name}"...`);
        await BillingPlan.create(plan);
      }
    }

    console.log('\n✅ Billing plans seeded successfully!');
    
    const plans = await BillingPlan.find().sort({ 'price.monthly': 1 });
    console.log('\nCurrent plans:');
    plans.forEach(p => {
      console.log(`  - ${p.displayName} (${p.name}): ₹${p.price.monthly}/month`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error seeding billing plans:', error);
    process.exit(1);
  }
}

seedBillingPlans();
