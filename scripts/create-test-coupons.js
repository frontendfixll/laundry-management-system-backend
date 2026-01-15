// Script to create test coupons for a tenancy
const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry-management';

const couponSchema = new mongoose.Schema({
  tenancy: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenancy', required: true },
  code: { type: String, required: true, uppercase: true },
  name: { type: String, required: true },
  description: { type: String },
  type: { type: String, enum: ['percentage', 'fixed_amount'], required: true },
  value: { type: Number, required: true },
  minOrderValue: { type: Number, default: 0 },
  maxDiscount: { type: Number, default: 0 },
  usageLimit: { type: Number, default: 0 },
  usedCount: { type: Number, default: 0 },
  perUserLimit: { type: Number, default: 1 },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  isGlobal: { type: Boolean, default: false }
}, { timestamps: true });

const Coupon = mongoose.model('Coupon', couponSchema);

async function createTestCoupons() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get tenancy ID - dgsfg tenancy
    const Tenancy = mongoose.model('Tenancy', new mongoose.Schema({ slug: String }));
    const tenancy = await Tenancy.findOne({ slug: 'dgsfg' });
    
    if (!tenancy) {
      console.log('Tenancy not found!');
      process.exit(1);
    }

    console.log('Found tenancy:', tenancy._id);

    const now = new Date();
    const endDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days from now

    const coupons = [
      {
        tenancy: tenancy._id,
        code: 'WELCOME20',
        name: 'Welcome Offer',
        description: 'Get 20% off on your first order!',
        type: 'percentage',
        value: 20,
        minOrderValue: 200,
        maxDiscount: 100,
        startDate: now,
        endDate: endDate,
        isActive: true
      },
      {
        tenancy: tenancy._id,
        code: 'FLAT50',
        name: 'Flat ₹50 Off',
        description: 'Get flat ₹50 off on orders above ₹300',
        type: 'fixed_amount',
        value: 50,
        minOrderValue: 300,
        startDate: now,
        endDate: endDate,
        isActive: true
      },
      {
        tenancy: tenancy._id,
        code: 'SAVE15',
        name: '15% Savings',
        description: 'Save 15% on all laundry services',
        type: 'percentage',
        value: 15,
        minOrderValue: 150,
        maxDiscount: 75,
        startDate: now,
        endDate: endDate,
        isActive: true
      },
      {
        tenancy: tenancy._id,
        code: 'MEGA100',
        name: 'Mega Discount',
        description: 'Get ₹100 off on orders above ₹500',
        type: 'fixed_amount',
        value: 100,
        minOrderValue: 500,
        startDate: now,
        endDate: endDate,
        isActive: true
      },
      {
        tenancy: tenancy._id,
        code: 'SPECIAL25',
        name: 'Special 25% Off',
        description: '25% discount for premium customers',
        type: 'percentage',
        value: 25,
        minOrderValue: 400,
        maxDiscount: 150,
        startDate: now,
        endDate: endDate,
        isActive: true
      }
    ];

    // Delete existing test coupons
    await Coupon.deleteMany({ 
      tenancy: tenancy._id,
      code: { $in: coupons.map(c => c.code) }
    });

    // Create new coupons
    const created = await Coupon.insertMany(coupons);
    console.log(`Created ${created.length} coupons successfully!`);
    
    created.forEach(c => {
      console.log(`- ${c.code}: ${c.name} (${c.type === 'percentage' ? c.value + '%' : '₹' + c.value})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

createTestCoupons();
