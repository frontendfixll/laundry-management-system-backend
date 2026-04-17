const mongoose = require('mongoose');
const Banner = require('./src/models/Banner');
const BannerTemplate = require('./src/models/BannerTemplate');

mongoose.connect('mongodb://localhost:27017/laundry-management')
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');
    
    // Find FLOATING template
    const floatingTemplate = await BannerTemplate.findOne({ code: 'FLOATING_CORNER' });
    
    if (!floatingTemplate) {
      console.log('❌ FLOATING_CORNER template not found!');
      process.exit(1);
    }
    
    console.log(`✅ Found template: ${floatingTemplate.name}\n`);
    
    // Create test banner
    const testBanner = new Banner({
      content: {
        title: '🎉 Welcome Offer!',
        subtitle: 'Get 20% OFF',
        description: 'First time customers get 20% discount on all services',
        message: 'Limited time offer'
      },
      imageUrl: '/uploads/banners/welcome-offer.jpg',
      imageAlt: 'Welcome Offer Banner',
      cta: {
        text: 'Claim Now',
        link: '/customer/offers',
        action: 'LINK'
      },
      template: floatingTemplate._id,
      templateType: 'FLOATING',
      position: 'GLOBAL_FLOATING_CORNER',
      bannerScope: 'GLOBAL',
      state: 'ACTIVE',
      isActive: true,
      priority: 100,
      schedule: {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2026-12-31'),
        timezone: 'Asia/Kolkata'
      },
      targeting: {
        userSegments: ['all'],
        deviceTypes: ['desktop', 'mobile', 'tablet']
      },
      analytics: {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        ctr: 0,
        conversionRate: 0
      },
      createdBy: '694a8c2fe584a566d439a624', // SuperAdmin ID
      createdByModel: 'SuperAdmin'
    });
    
    await testBanner.save();
    
    console.log('✅ Test banner created successfully!\n');
    console.log('Banner Details:');
    console.log(`  Title: ${testBanner.content.title}`);
    console.log(`  Position: ${testBanner.position}`);
    console.log(`  State: ${testBanner.state}`);
    console.log(`  Active: ${testBanner.isActive}`);
    console.log(`  ID: ${testBanner._id}`);
    
    // Verify it's active
    const activeBanners = await Banner.find({
      state: 'ACTIVE',
      isActive: true,
      position: 'GLOBAL_FLOATING_CORNER'
    });
    
    console.log(`\n✅ Total active GLOBAL_FLOATING_CORNER banners: ${activeBanners.length}`);
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
