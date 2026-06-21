/**
 * Seed demo promo banners for the customer-app Home carousel.
 *
 * Run: node scripts/seedMarketplaceBanners.js
 */

const mongoose = require('mongoose');
const MarketplaceBanner = require('../src/models/MarketplaceBanner');
require('dotenv').config();

const BANNERS = [
  {
    title: '40% off your first order',
    subtitle: 'New here? Use code FRESH40 at checkout.',
    accentColor: '#2F66F6',
    ctaType: 'none',
    ctaLabel: 'Order now',
    isActive: true,
    sortOrder: 1,
  },
  {
    title: 'Free pickup & delivery',
    subtitle: 'On every order, at your chosen slot.',
    accentColor: '#13B981',
    ctaType: 'none',
    ctaLabel: 'How it works',
    isActive: true,
    sortOrder: 2,
  },
  {
    title: 'Refer a friend, earn ₹50',
    subtitle: 'Share your code from the Refer & earn page.',
    accentColor: '#F7921E',
    ctaType: 'none',
    ctaLabel: 'Invite',
    isActive: true,
    sortOrder: 3,
  },
];

async function run() {
  try {
    console.log('🔄 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected');

    for (const b of BANNERS) {
      const existing = await MarketplaceBanner.findOne({ title: b.title });
      if (existing) {
        console.log(`• Skipped (exists): ${b.title}`);
      } else {
        await MarketplaceBanner.create(b);
        console.log(`✅ Created: ${b.title}`);
      }
    }

    console.log('🎉 Done seeding marketplace banners.');
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
