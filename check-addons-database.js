const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB and check add-ons
async function checkAddOnsDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    console.log('📍 MongoDB URI:', process.env.MONGODB_URI ? 'Present' : 'Missing');
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    console.log('📊 Database name:', mongoose.connection.db.databaseName);
    console.log('');

    // Check AddOn collection
    const AddOn = mongoose.model('AddOn', new mongoose.Schema({}, { strict: false }));
    const addOns = await AddOn.find({}).select('name displayName category status isDeleted');
    
    console.log('📦 Add-ons in database:');
    if (addOns.length === 0) {
      console.log('❌ No add-ons found in the database');
    } else {
      addOns.forEach((addon, index) => {
        console.log(`${index + 1}. ${addon.name} (${addon.displayName})`);
        console.log(`   Category: ${addon.category}`);
        console.log(`   Status: ${addon.status}`);
        console.log(`   Deleted: ${addon.isDeleted || false}`);
        console.log('');
      });
    }

    // Check all collections in the database
    console.log('📋 All collections in database:');
    const collections = await mongoose.connection.db.listCollections().toArray();
    collections.forEach(collection => {
      console.log(`   - ${collection.name}`);
    });

    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkAddOnsDatabase();