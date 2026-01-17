/**
 * Test WebSocket Notification System
 * Run this script to send test notifications
 */

const mongoose = require('mongoose');
require('dotenv').config();
const NotificationService = require('./src/services/notificationService');

// Test data
const TEST_SCENARIOS = {
  1: {
    name: 'New Order Notification (Admin)',
    recipientType: 'admin',
    type: 'order_placed',
    title: '🛍️ New Order Received',
    message: 'Order #12345 from John Doe - ₹500',
    severity: 'info',
    data: { link: '/orders' }
  },
  2: {
    name: 'Order Delivered (Customer)',
    recipientType: 'customer',
    type: 'order_delivered',
    title: '✅ Order Delivered',
    message: 'Your order #12345 has been delivered. Thank you!',
    severity: 'success',
    data: { link: '/orders' }
  },
  3: {
    name: 'Low Inventory Alert (Admin)',
    recipientType: 'admin',
    type: 'low_inventory',
    title: '⚠️ Low Inventory Alert',
    message: 'Detergent is running low. Current stock: 5 units',
    severity: 'warning',
    data: { link: '/inventory' }
  },
  4: {
    name: 'Payment Failed (Admin)',
    recipientType: 'admin',
    type: 'payment_failed',
    title: '❌ Payment Failed',
    message: 'Payment of ₹500 failed for order #12345',
    severity: 'error',
    data: { link: '/orders' }
  },
  5: {
    name: 'Reward Points (Customer)',
    recipientType: 'customer',
    type: 'reward_points',
    title: '🎉 Points Earned!',
    message: 'You earned 50 reward points for your recent order',
    severity: 'success',
    data: { points: 50, link: '/rewards' }
  },
  6: {
    name: 'New Lead (SuperAdmin)',
    recipientType: 'superadmin',
    type: 'new_lead',
    title: '👤 New Lead',
    message: 'ABC Laundry - contact@abc.com',
    severity: 'info',
    data: { link: '/leads' }
  }
};

async function sendTestNotification(scenarioNumber, userId, tenancy = null) {
  const scenario = TEST_SCENARIOS[scenarioNumber];
  
  if (!scenario) {
    console.error('❌ Invalid scenario number. Choose 1-6');
    return;
  }

  console.log(`\n📤 Sending: ${scenario.name}`);
  console.log(`   To User: ${userId}`);
  console.log(`   Type: ${scenario.recipientType}`);
  
  try {
    await NotificationService.createNotification({
      recipientId: userId,
      recipientModel: scenario.recipientType === 'superadmin' ? 'SuperAdmin' : 'User',
      recipientType: scenario.recipientType,
      tenancy,
      type: scenario.type,
      title: scenario.title,
      message: scenario.message,
      severity: scenario.severity,
      data: scenario.data
    });
    
    console.log('✅ Notification sent successfully!');
    console.log('   Check your frontend - you should see:');
    console.log('   - Toast notification appear');
    console.log('   - Bell badge increment');
    console.log('   - Sound play (if enabled)');
    console.log('   - Browser notification (if permitted)');
  } catch (error) {
    console.error('❌ Error sending notification:', error.message);
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('🧪 WebSocket Notification System - Test Script');
  console.log('='.repeat(60));

  // Connect to MongoDB
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }

  // Get command line arguments
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('\n📖 Usage:');
    console.log('   node test-websocket-notification.js <scenario> <userId> [tenancyId]');
    console.log('\n📋 Available Scenarios:');
    Object.entries(TEST_SCENARIOS).forEach(([num, scenario]) => {
      console.log(`   ${num}. ${scenario.name}`);
    });
    console.log('\n💡 Example:');
    console.log('   node test-websocket-notification.js 1 677a1b2c3d4e5f6g7h8i9j0k 677a1b2c3d4e5f6g7h8i9j0l');
    console.log('\n💡 Quick Test (sends all scenarios):');
    console.log('   node test-websocket-notification.js all 677a1b2c3d4e5f6g7h8i9j0k 677a1b2c3d4e5f6g7h8i9j0l');
    process.exit(0);
  }

  const [scenario, userId, tenancy] = args;

  if (scenario === 'all') {
    console.log('\n🚀 Sending all test scenarios...\n');
    for (let i = 1; i <= 6; i++) {
      await sendTestNotification(i, userId, tenancy);
      // Wait 2 seconds between notifications
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    console.log('\n✅ All test notifications sent!');
  } else {
    await sendTestNotification(parseInt(scenario), userId, tenancy);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Test completed!');
  console.log('='.repeat(60));
  
  process.exit(0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

// Run
main();
