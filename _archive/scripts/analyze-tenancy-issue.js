/**
 * Analyze Tenancy Data Isolation Issue
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function analyze() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const User = require('./src/models/User');
    const Order = require('./src/models/Order');
    const Tenancy = require('./src/models/Tenancy');
    
    // 1. Check the admin user
    const admin = await User.findOne({ email: 'deepakthavrani72@gmail.com' });
    console.log('=== ADMIN USER ===');
    console.log('Email:', admin.email);
    console.log('Role:', admin.role);
    console.log('Tenancy ID:', admin.tenancy);
    
    // 2. Check the tenancy
    const tenancy = await Tenancy.findById(admin.tenancy);
    console.log('\n=== TENANCY ===');
    console.log('Name:', tenancy?.name);
    console.log('Status:', tenancy?.status);
    console.log('ID:', tenancy?._id);
    
    // 3. Check all tenancies
    const allTenancies = await Tenancy.find({});
    console.log('\n=== ALL TENANCIES ===');
    allTenancies.forEach(t => {
      console.log(`- ${t.name} (${t._id}) - Status: ${t.status}`);
    });
    
    // 4. Check orders by tenancy
    console.log('\n=== ORDERS BY TENANCY ===');
    const ordersByTenancy = await Order.aggregate([
      { $group: { _id: '$tenancy', count: { $sum: 1 } } }
    ]);
    
    for (const item of ordersByTenancy) {
      const t = await Tenancy.findById(item._id);
      console.log(`- ${t?.name || 'NO TENANCY (null)'}: ${item.count} orders`);
    }
    
    // 5. Check orders without tenancy
    const ordersWithoutTenancy = await Order.countDocuments({ tenancy: null });
    const ordersWithTenancyUndefined = await Order.countDocuments({ tenancy: { $exists: false } });
    console.log('\n=== ORDERS WITHOUT TENANCY ===');
    console.log('Orders with tenancy=null:', ordersWithoutTenancy);
    console.log('Orders without tenancy field:', ordersWithTenancyUndefined);
    
    // 6. Check total orders
    const totalOrders = await Order.countDocuments({});
    console.log('Total orders in DB:', totalOrders);
    
    // 7. Check customers by tenancy (via orders)
    console.log('\n=== CUSTOMERS BY TENANCY (via orders) ===');
    for (const t of allTenancies) {
      const customerIds = await Order.distinct('customer', { tenancy: t._id });
      console.log(`- ${t.name}: ${customerIds.length} customers`);
    }
    
    // Customers without tenancy orders
    const customersWithoutTenancy = await Order.distinct('customer', { tenancy: null });
    console.log(`- NO TENANCY: ${customersWithoutTenancy.length} customers`);
    
    // 8. Total customers
    const totalCustomers = await User.countDocuments({ role: 'customer' });
    console.log('\nTotal customers in DB:', totalCustomers);

    await mongoose.disconnect();
    console.log('\n✅ Analysis complete');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

analyze();
