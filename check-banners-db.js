const mongoose = require('mongoose');
require('dotenv').config();

const Banner = require('./src/models/Banner');

async function checkBanners() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/LaundryLobby');
    console.log('✅ Connected to MongoDB');

    // Get all banners (including deleted ones if soft-delete is used)
    const allBanners = await Banner.find({})
      .select('_id content.title state isActive bannerScope tenancy position createdAt')
      .populate('tenancy', 'name businessName')
      .lean();

    console.log('\n📊 TOTAL BANNERS IN DATABASE:', allBanners.length);
    console.log('='.repeat(80));

    if (allBanners.length === 0) {
      console.log('✅ Database is clean - no banners found');
    } else {
      console.log('\n📋 BANNER DETAILS:');
      allBanners.forEach((banner, index) => {
        console.log(`\n${index + 1}. Banner ID: ${banner._id}`);
        console.log(`   Title: ${banner.content?.title || 'N/A'}`);
        console.log(`   State: ${banner.state}`);
        console.log(`   isActive: ${banner.isActive}`);
        console.log(`   Scope: ${banner.bannerScope}`);
        console.log(`   Position: ${banner.position}`);
        console.log(`   Tenancy: ${banner.tenancy?.name || 'N/A'}`);
        console.log(`   Created: ${banner.createdAt}`);
      });

      // Count by state
      const byState = {};
      allBanners.forEach(b => {
        byState[b.state] = (byState[b.state] || 0) + 1;
      });

      console.log('\n📊 BANNERS BY STATE:');
      Object.entries(byState).forEach(([state, count]) => {
        console.log(`   ${state}: ${count}`);
      });

      // Count active banners
      const activeBanners = allBanners.filter(b => b.state === 'ACTIVE' && b.isActive);
      console.log(`\n🟢 ACTIVE BANNERS: ${activeBanners.length}`);

      if (activeBanners.length > 0) {
        console.log('\n⚠️  ACTIVE BANNERS FOUND:');
        activeBanners.forEach((banner, index) => {
          console.log(`   ${index + 1}. ${banner.content?.title} (${banner.position}) - ${banner.bannerScope}`);
        });
      }
    }

    console.log('\n' + '='.repeat(80));
    await mongoose.connection.close();
    console.log('✅ Database connection closed');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkBanners();
