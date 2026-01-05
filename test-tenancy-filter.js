/**
 * Test tenancy filter for customers
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function testTenancyFilter() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = require('./src/models/User');
    const Order = require('./src/models/Order');
    const Tenancy = require('./src/models/Tenancy');
    
    // Get the dgsfg tenancy
    const tenancy = await Tenancy.findOne({ name: 'dgsfg' });
    console.log('Tenancy:', tenancy?.name, tenancy?._id);
    
    if (!tenancy) {
      console.log('❌ Tenancy not found');
      await mongoose.disconnect();
      return;
    }
    
    // Check orders in this tenancy
    const ordersInTenancy = await Order.countDocuments({ tenancy: tenancy._id });
    console.log('\nOrders in this tenancy:', ordersInTenancy);
    
    // Get customer IDs from orders in this tenancy
    const customerIds = await Order.distinct('customer', { tenancy: tenancy._id });
    console.log('Unique customers with orders:', customerIds.length);
    
    // Check customers directly associated with tenancy
    const directCustomers = await User.countDocuments({ 
      role: 'customer', 
      tenancy: tenancy._id 
    });
    console.log('Customers directly in tenancy:', directCustomers);
    
    // Total customers in DB
    const totalCustomers = await User.countDocuments({ role: 'customer' });
    console.log('\nTotal customers in entire DB:', totalCustomers);
    
    // What the filter should return
    const filteredCustomers = await User.countDocuments({
      role: 'customer',
      $or: [
        { _id: { $in: customerIds } },
        { tenancy: tenancy._id }
      ]
    });
    console.log('Customers that should show for this tenancy:', filteredCustomers);

    await mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testTenancyFilter();
