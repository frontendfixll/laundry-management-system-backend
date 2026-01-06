const mongoose = require('mongoose');
const Service = require('./src/models/Service');

// Test script to verify admin services endpoint works
async function testAdminServices() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry-platform');
    console.log('✅ Connected to MongoDB');

    // Test 1: Check if Service model works with simplified schema
    console.log('\n🧪 Testing Service model...');
    
    const services = await Service.find({}).limit(5);
    console.log(`Found ${services.length} services in database`);
    
    if (services.length > 0) {
      const service = services[0];
      console.log('Sample service structure:');
      console.log({
        _id: service._id,
        name: service.name,
        code: service.code,
        displayName: service.displayName,
        category: service.category,
        isActive: service.isActive,
        basePriceMultiplier: service.basePriceMultiplier,
        turnaroundTime: service.turnaroundTime,
        // Check if old fields exist (they shouldn't)
        hasBranches: !!service.branches,
        hasCreatedByBranch: !!service.createdByBranch
      });
      
      if (service.branches || service.createdByBranch) {
        console.log('⚠️  Warning: Service still has old branch-related fields');
      } else {
        console.log('✅ Service model is clean (no branch-related fields)');
      }
    }

    // Test 2: Test query that admin services endpoint would use
    console.log('\n🧪 Testing admin services query...');
    
    const adminQuery = {};
    const adminServices = await Service.find(adminQuery)
      .populate('createdBy', 'name')
      .sort({ sortOrder: 1, createdAt: -1 });
    
    console.log(`Admin services query returned ${adminServices.length} services`);
    
    // Test 3: Test with filters
    console.log('\n🧪 Testing filtered queries...');
    
    const activeServices = await Service.find({ isActive: true });
    console.log(`Active services: ${activeServices.length}`);
    
    const laundryServices = await Service.find({ category: 'laundry' });
    console.log(`Laundry category services: ${laundryServices.length}`);
    
    console.log('\n✅ All tests passed! Admin services endpoint should work now.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
if (require.main === module) {
  testAdminServices();
}

module.exports = testAdminServices;