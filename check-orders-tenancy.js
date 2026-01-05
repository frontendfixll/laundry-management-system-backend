require('dotenv').config();
const mongoose = require('mongoose');

async function checkOrders() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const Order = require('./src/models/Order');
    const Tenancy = require('./src/models/Tenancy');
    const User = require('./src/models/User');

    // Get all tenancies
    const tenancies = await Tenancy.find({}, 'name slug _id');
    console.log('\n=== All Tenancies ===');
    tenancies.forEach(t => {
      console.log(`- ${t.name} (slug: ${t.slug}, id: ${t._id})`);
    });

    // Get all orders with their tenancy
    const orders = await Order.find({}).populate('tenancy', 'name slug').populate('customer', 'name email');
    console.log('\n=== All Orders ===');
    orders.forEach(o => {
      console.log(`Order #${o.orderNumber}:`);
      console.log(`  - Customer: ${o.customer?.name || 'N/A'} (${o.customer?.email || 'N/A'})`);
      console.log(`  - Tenancy: ${o.tenancy?.name || 'NULL'} (${o.tenancy?._id || 'no tenancy'})`);
      console.log(`  - Status: ${o.status}`);
      console.log('');
    });

    // Find dgsfg tenancy
    const dgsfg = await Tenancy.findOne({ slug: 'dgsfg' });
    if (dgsfg) {
      console.log('\n=== dgsfg Tenancy Details ===');
      console.log(`ID: ${dgsfg._id}`);
      console.log(`Name: ${dgsfg.name}`);
      
      // Find orders for this tenancy
      const dgsfgOrders = await Order.find({ tenancy: dgsfg._id });
      console.log(`Orders for dgsfg: ${dgsfgOrders.length}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkOrders();
