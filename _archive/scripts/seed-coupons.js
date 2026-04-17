const mongoose = require('mongoose');
const Coupon = require('./src/models/Coupon');
const Tenancy = require('./src/models/Tenancy');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

const seedCoupons = async () => {
  try {
    await connectDB();
    
    // Get first tenancy (or create a default one)
    let tenancy = await Tenancy.findOne();
    if (!tenancy) {
      tenancy = await Tenancy.create({
        name: 'Default Laundry',
        identifier: 'default',
        subdomain: 'default',
        isActive: true
      });
      console.log('✅ Created default tenancy');
    }
    
    // Clear existing coupons for this tenancy
    await Coupon.deleteMany({ tenancy: tenancy._id });
    console.log('🗑️ Cleared existing coupons');
    
    // Sample coupons data
    const couponsData = [
      {
        code: 'WELCOME25',
        name: 'Welcome Offer',
        description: 'Get 25% off on your first order',
        type: 'percentage',
        value: 25,
        minOrderValue: 299,
        maxDiscount: 200,
        usageLimit: 100,
        perUserLimit: 1,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        applicableServices: ['all']
      },
      {
        code: 'SAVE100',
        name: 'Flat ₹100 Off',
        description: 'Flat ₹100 discount on orders above ₹500',
        type: 'fixed_amount',
        value: 100,
        minOrderValue: 500,
        maxDiscount: 100,
        usageLimit: 50,
        perUserLimit: 2,
        startDate: new Date(),
        endDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days
        applicableServices: ['all']
      },
      {
        code: 'PREMIUM20',
        name: 'Premium Service Discount',
        description: '20% off on premium laundry services',
        type: 'percentage',
        value: 20,
        minOrderValue: 400,
        maxDiscount: 150,
        usageLimit: 75,
        perUserLimit: 3,
        startDate: new Date(),
        endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
        applicableServices: ['premium_laundry', 'premium_dry_clean']
      },
      {
        code: 'BULK15',
        name: 'Bulk Order Discount',
        description: '15% off on bulk orders above ₹1000',
        type: 'percentage',
        value: 15,
        minOrderValue: 1000,
        maxDiscount: 300,
        usageLimit: 25,
        perUserLimit: 5,
        startDate: new Date(),
        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
        applicableServices: ['all']
      },
      {
        code: 'WEEKEND50',
        name: 'Weekend Special',
        description: 'Flat ₹50 off on weekend orders',
        type: 'fixed_amount',
        value: 50,
        minOrderValue: 300,
        maxDiscount: 50,
        usageLimit: 200,
        perUserLimit: 1,
        startDate: new Date(),
        endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
        applicableServices: ['all']
      },
      {
        code: 'DRYC30',
        name: 'Dry Clean Special',
        description: '30% off on dry cleaning services',
        type: 'percentage',
        value: 30,
        minOrderValue: 600,
        maxDiscount: 250,
        usageLimit: 40,
        perUserLimit: 2,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        applicableServices: ['dry_clean', 'premium_dry_clean']
      },
      {
        code: 'NEWUSER',
        name: 'New User Bonus',
        description: 'Special discount for new customers',
        type: 'percentage',
        value: 35,
        minOrderValue: 200,
        maxDiscount: 175,
        usageLimit: 150,
        perUserLimit: 1,
        startDate: new Date(),
        endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
        applicableServices: ['all']
      },
      {
        code: 'LOYALTY10',
        name: 'Loyalty Reward',
        description: '10% off for loyal customers',
        type: 'percentage',
        value: 10,
        minOrderValue: 250,
        maxDiscount: 100,
        usageLimit: 0, // Unlimited
        perUserLimit: 10,
        startDate: new Date(),
        endDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000), // 120 days
        applicableServices: ['all']
      }
    ];
    
    // Create coupons
    const createdCoupons = [];
    for (const couponData of couponsData) {
      const coupon = await Coupon.create({
        ...couponData,
        tenancy: tenancy._id,
        isActive: true
      });
      createdCoupons.push(coupon);
      console.log(`✅ Created coupon: ${coupon.code} - ${coupon.name}`);
    }
    
    console.log(`\n🎉 Successfully created ${createdCoupons.length} coupons!`);
    console.log('\n📋 Created Coupons:');
    createdCoupons.forEach(coupon => {
      console.log(`   ${coupon.code} - ${coupon.name} (${coupon.type === 'percentage' ? coupon.value + '%' : '₹' + coupon.value} off)`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding coupons:', error);
    process.exit(1);
  }
};

// Run the seeder
seedCoupons();