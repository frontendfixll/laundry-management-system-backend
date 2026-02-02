/**
 * Debug Tenancy Structure
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const Tenancy = require('./src/models/Tenancy');

async function debugTenancyStructure() {
  console.log('🔍 DEBUGGING TENANCY STRUCTURE');
  console.log('='.repeat(60));
  
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');
    
    // Get a few recent tenancies
    const tenancies = await Tenancy.find({})
      .sort({ createdAt: -1 })
      .limit(5);
    
    console.log(`\n📋 Found ${tenancies.length} tenancies`);
    
    tenancies.forEach((tenancy, index) => {
      console.log(`\n${index + 1}. ${tenancy.name} (${tenancy.slug})`);
      console.log('Full structure:');
      console.log(JSON.stringify(tenancy.toObject(), null, 2));
      console.log('='.repeat(80));
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    mongoose.disconnect();
  }
}

debugTenancyStructure();