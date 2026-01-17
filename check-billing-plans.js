const mongoose = require('mongoose');

// MongoDB connection string
const MONGODB_URI = 'mongodb+srv://deepakfixl2_db_user:sgr7QHS46sn36eEs@cluster0.ugk4dbe.mongodb.net/laundry-management-system?retryWrites=true&w=majority';

// Define BillingPlan schema
const billingPlanSchema = new mongoose.Schema({
  name: String,
  displayName: String,
  description: String,
  price: Number,
  billingCycle: String,
  features: Object,
  limits: Object,
  isActive: Boolean,
}, { timestamps: true });

const BillingPlan = mongoose.model('BillingPlan', billingPlanSchema);

async function checkPlans() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const plans = await BillingPlan.find({});
    
    console.log(`📊 Total Billing Plans: ${plans.length}\n`);
    console.log('─────────────────────────────────────\n');
    
    if (plans.length === 0) {
      console.log('❌ No billing plans found in database!');
    } else {
      plans.forEach((plan, index) => {
        console.log(`${index + 1}. ${plan.displayName || plan.name}`);
        console.log(`   🆔 ID: ${plan._id}`);
        console.log(`   💰 Price: ₹${plan.price}`);
        console.log(`   📅 Billing: ${plan.billingCycle}`);
        console.log(`   ✅ Active: ${plan.isActive}`);
        console.log(`   📝 Description: ${plan.description}`);
        console.log('');
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkPlans();
