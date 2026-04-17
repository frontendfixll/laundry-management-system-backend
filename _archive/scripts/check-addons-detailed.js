const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB and check add-ons in detail
async function checkAddOnsDetailed() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    console.log('📊 Database name:', mongoose.connection.db.databaseName);
    console.log('');

    // Check raw documents in addons collection
    const db = mongoose.connection.db;
    const addonsCollection = db.collection('addons');
    
    console.log('📦 Raw documents in addons collection:');
    const rawAddOns = await addonsCollection.find({}).toArray();
    console.log('Total documents:', rawAddOns.length);
    
    if (rawAddOns.length > 0) {
      console.log('\nFirst document structure:');
      console.log(JSON.stringify(rawAddOns[0], null, 2));
      
      console.log('\nAll add-ons summary:');
      rawAddOns.forEach((addon, index) => {
        console.log(`${index + 1}. ${addon.name || 'No name'}`);
        console.log(`   Status: ${addon.status || 'No status'}`);
        console.log(`   isDeleted: ${addon.isDeleted}`);
        console.log(`   Category: ${addon.category || 'No category'}`);
        console.log('');
      });
    }

    // Now try with the AddOn model
    console.log('📦 Using AddOn model:');
    const AddOn = mongoose.model('AddOn', new mongoose.Schema({}, { strict: false }));
    
    // Try different queries
    console.log('\n1. All add-ons (no filter):');
    const allAddOns = await AddOn.find({});
    console.log('Count:', allAddOns.length);
    
    console.log('\n2. Add-ons with isDeleted: false:');
    const notDeletedAddOns = await AddOn.find({ isDeleted: false });
    console.log('Count:', notDeletedAddOns.length);
    
    console.log('\n3. Add-ons with status: active:');
    const activeAddOns = await AddOn.find({ status: 'active' });
    console.log('Count:', activeAddOns.length);
    
    console.log('\n4. Add-ons with both filters:');
    const filteredAddOns = await AddOn.find({ isDeleted: false, status: 'active' });
    console.log('Count:', filteredAddOns.length);

    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkAddOnsDetailed();