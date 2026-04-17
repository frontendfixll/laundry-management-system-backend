require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Order = require('./src/models/Order');

async function debug() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  // Check admin user
  const admin = await User.findOne({ email: 'deepakthavrani72@gmail.com' });
  console.log('Admin User:');
  console.log('  tenancy:', admin?.tenancy);
  console.log('  assignedBranch:', admin?.assignedBranch);
  console.log('  role:', admin?.role);

  // Check orders with this tenancy
  const tenancyId = admin?.tenancy;
  const branchId = admin?.assignedBranch;

  console.log('\n--- Order Counts ---');
  
  const totalOrders = await Order.countDocuments({});
  console.log('Total orders in DB:', totalOrders);

  const ordersWithTenancy = await Order.countDocuments({ tenancy: { $ne: null } });
  console.log('Orders with tenancy set:', ordersWithTenancy);

  const ordersWithoutTenancy = await Order.countDocuments({ tenancy: null });
  console.log('Orders without tenancy (null):', ordersWithoutTenancy);

  if (tenancyId) {
    const ordersForTenancy = await Order.countDocuments({ tenancy: tenancyId });
    console.log(`Orders for admin's tenancy (${tenancyId}):`, ordersForTenancy);
  }

  if (branchId) {
    const ordersForBranch = await Order.countDocuments({ branch: branchId });
    console.log(`Orders for admin's branch (${branchId}):`, ordersForBranch);
  }

  if (tenancyId && branchId) {
    const ordersForBoth = await Order.countDocuments({ tenancy: tenancyId, branch: branchId });
    console.log(`Orders for both tenancy AND branch:`, ordersForBoth);
  }

  // Sample order to see structure
  const sampleOrder = await Order.findOne({}).select('tenancy branch status');
  console.log('\nSample order:', sampleOrder);

  await mongoose.disconnect();
}

debug().catch(console.error);
