const mongoose = require('mongoose');
const Refund = require('./src/models/Refund');
const Order = require('./src/models/Order');
const User = require('./src/models/User');
const Tenancy = require('./src/models/Tenancy');
const { addTenancyFilter } = require('./src/middlewares/tenancyMiddleware');

// Test script to verify tenancy-based refund filtering
async function testRefundTenancyFiltering() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry-platform');
    console.log('✅ Connected to MongoDB');

    // Get sample tenancies
    const tenancies = await Tenancy.find({ status: 'active' }).limit(2);
    if (tenancies.length < 2) {
      console.log('❌ Need at least 2 active tenancies for testing');
      return;
    }

    const tenancy1 = tenancies[0];
    const tenancy2 = tenancies[1];

    console.log(`\n🏢 Testing with tenancies:`);
    console.log(`   Tenancy 1: ${tenancy1.name} (${tenancy1._id})`);
    console.log(`   Tenancy 2: ${tenancy2.name} (${tenancy2._id})`);

    // Test 1: Get all refunds without tenancy filter
    const allRefunds = await Refund.find({}).populate('tenancy', 'name');
    console.log(`\n📊 Total refunds in database: ${allRefunds.length}`);

    // Group by tenancy
    const refundsByTenancy = {};
    allRefunds.forEach(refund => {
      const tenancyId = refund.tenancy?._id?.toString() || 'no-tenancy';
      const tenancyName = refund.tenancy?.name || 'No Tenancy';
      if (!refundsByTenancy[tenancyId]) {
        refundsByTenancy[tenancyId] = { name: tenancyName, count: 0 };
      }
      refundsByTenancy[tenancyId].count++;
    });

    console.log('\n📈 Refunds by tenancy:');
    Object.entries(refundsByTenancy).forEach(([id, data]) => {
      console.log(`   ${data.name}: ${data.count} refunds`);
    });

    // Test 2: Filter refunds for tenancy 1
    const tenancy1Query = addTenancyFilter({}, tenancy1._id);
    const tenancy1Refunds = await Refund.find(tenancy1Query).populate('order', 'orderNumber');
    console.log(`\n🔍 Refunds for ${tenancy1.name}: ${tenancy1Refunds.length}`);

    // Test 3: Filter refunds for tenancy 2
    const tenancy2Query = addTenancyFilter({}, tenancy2._id);
    const tenancy2Refunds = await Refund.find(tenancy2Query).populate('order', 'orderNumber');
    console.log(`🔍 Refunds for ${tenancy2.name}: ${tenancy2Refunds.length}`);

    // Test 4: Test with additional filters (status + tenancy)
    const tenancy1PendingQuery = addTenancyFilter({ status: 'requested' }, tenancy1._id);
    const tenancy1PendingRefunds = await Refund.find(tenancy1PendingQuery);
    console.log(`🔍 Pending refunds for ${tenancy1.name}: ${tenancy1PendingRefunds.length}`);

    // Test 5: Verify no cross-tenancy data leakage
    const tenancy1RefundIds = tenancy1Refunds.map(r => r._id.toString());
    const tenancy2RefundIds = tenancy2Refunds.map(r => r._id.toString());
    const overlap = tenancy1RefundIds.filter(id => tenancy2RefundIds.includes(id));
    
    if (overlap.length === 0) {
      console.log('✅ No data leakage between tenancies');
    } else {
      console.log(`❌ Data leakage detected: ${overlap.length} refunds appear in both tenancies`);
    }

    // Test 6: Test compound index performance
    console.log('\n⚡ Testing compound index performance...');
    const startTime = Date.now();
    const indexedQuery = await Refund.find({ 
      tenancy: tenancy1._id, 
      status: 'requested' 
    }).sort({ createdAt: -1 }).limit(10).explain('executionStats');
    const endTime = Date.now();
    
    console.log(`   Query execution time: ${endTime - startTime}ms`);
    console.log(`   Documents examined: ${indexedQuery.executionStats.totalDocsExamined}`);
    console.log(`   Documents returned: ${indexedQuery.executionStats.totalDocsReturned}`);

    console.log('\n✅ Tenancy filtering test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the test
if (require.main === module) {
  testRefundTenancyFiltering();
}

module.exports = testRefundTenancyFiltering;