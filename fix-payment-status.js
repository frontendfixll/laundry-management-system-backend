/**
 * Script to fix payment status for delivered orders
 * Run: node fix-payment-status.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./src/models/Order');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry_db';

async function fixPaymentStatus() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // First, let's see all orders and their statuses
    const allOrders = await Order.find({}).select('orderNumber status paymentStatus');
    console.log('All orders:', JSON.stringify(allOrders, null, 2));

    // Find all delivered orders with pending payment status
    const ordersToFix = await Order.find({
      status: 'delivered',
      paymentStatus: 'pending'
    });

    console.log(`Found ${ordersToFix.length} delivered orders with pending payment`);

    for (const order of ordersToFix) {
      order.paymentStatus = 'paid';
      order.paymentDetails = {
        ...order.paymentDetails,
        paidAt: order.actualDeliveryDate || order.updatedAt || new Date(),
        transactionId: order.paymentDetails?.transactionId || `COD-${order.orderNumber}`
      };
      await order.save();
      console.log(`Fixed order: ${order.orderNumber}`);
    }

    console.log('Done! All delivered orders now have paid status.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixPaymentStatus();
