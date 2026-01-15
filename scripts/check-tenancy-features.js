const mongoose = require('mongoose');
const Tenancy = require('../src/models/Tenancy');
require('dotenv').config();

/**
 * Script to check tenancy features
 */
async function checkFeatures() {
  try {
    console.log('🔍 Checking tenancy features...\n');
    await mongoose.connect(process.env.MONGODB_URI);
    
    const tenancies = await Tenancy.find({}).select('name slug subscription.features subscription.plan');
    
    console.log(`Found ${tenancies.length} tenancies:\n`);
    
    tenancies.forEach((t, index) => {
      console.log(`${index + 1}. ${t.name} (${t.slug})`);
      console.log(`   Plan: ${t.subscription?.plan || 'N/A'}`);
      console.log(`   Features:`, JSON.stringify(t.subscription?.features || {}, null, 2));
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkFeatures();
