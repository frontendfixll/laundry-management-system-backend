const mongoose = require('mongoose');
const Order = require('./src/models/Order');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry-management');

async function migrateOrderNumbers() {
  try {
    console.log('🔄 Starting order number migration...\n');
    
    // Get all orders with old format (long order numbers)
    const oldOrders = await Order.find({
      orderNumber: { $regex: /^ORD\d{13,}/ } // Match old long format
    }).sort({ createdAt: 1 });
    
    console.log(`📋 Found ${oldOrders.length} orders with old format\n`);
    
    if (oldOrders.length === 0) {
      console.log('✅ No orders need migration');
      return;
    }
    
    // Group orders by date and tenancy for proper counter assignment
    const ordersByDateTenant = {};
    
    oldOrders.forEach(order => {
      const date = order.createdAt.toISOString().split('T')[0]; // YYYY-MM-DD
      const tenancy = order.tenancy.toString();
      const key = `${date}_${tenancy}`;
      
      if (!ordersByDateTenant[key]) {
        ordersByDateTenant[key] = [];
      }
      ordersByDateTenant[key].push(order);
    });
    
    let totalUpdated = 0;
    
    // Process each date-tenant group
    for (const [key, orders] of Object.entries(ordersByDateTenant)) {
      const [dateStr, tenancyId] = key.split('_');
      const date = new Date(dateStr);
      
      console.log(`📅 Processing ${orders.length} orders for ${dateStr} (Tenancy: ${tenancyId.slice(-6)}...)`);
      
      // Generate new order numbers for this date-tenant group
      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        const oldOrderNumber = order.orderNumber;
        
        // Generate new format: ORD + YYMMDD + counter
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const dateStr = year + month + day;
        const counter = String(i + 1).padStart(3, '0');
        
        const newOrderNumber = `ORD${dateStr}${counter}`;
        
        // Check if new order number already exists
        const existing = await Order.findOne({ 
          orderNumber: newOrderNumber,
          _id: { $ne: order._id }
        });
        
        if (existing) {
          console.log(`⚠️  Conflict: ${newOrderNumber} already exists, skipping ${oldOrderNumber}`);
          continue;
        }
        
        // Update the order
        await Order.updateOne(
          { _id: order._id },
          { orderNumber: newOrderNumber }
        );
        
        console.log(`  ✅ ${oldOrderNumber} → ${newOrderNumber}`);
        totalUpdated++;
      }
    }
    
    console.log(`\n🎉 Migration completed!`);
    console.log(`📊 Total orders updated: ${totalUpdated}`);
    console.log(`📊 Orders skipped: ${oldOrders.length - totalUpdated}`);
    
    // Verify migration
    const remainingOldOrders = await Order.countDocuments({
      orderNumber: { $regex: /^ORD\d{13,}/ }
    });
    
    console.log(`📊 Remaining old format orders: ${remainingOldOrders}`);
    
    if (remainingOldOrders === 0) {
      console.log('✅ All orders successfully migrated to new format!');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run migration
migrateOrderNumbers();