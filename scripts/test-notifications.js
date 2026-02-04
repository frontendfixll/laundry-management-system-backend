const mongoose = require('mongoose');
require('dotenv').config({ path: 'backend/.env' });
const User = require('../src/models/User');
const Tenancy = require('../src/models/Tenancy');
const notificationService = require('../src/services/notificationService');
const socketIOServer = require('../src/services/socketIOServer');
const http = require('http');

async function test() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const tenant = await Tenancy.findOne({ slug: /dgsfg/i });
        if (!tenant) {
            console.log('❌ Tenant dgsfg not found');
            process.exit(1);
        }

        const user = await User.findOne({ tenancy: tenant._id });
        if (!user) {
            console.log('❌ No user found for tenant', tenant.slug);
            process.exit(1);
        }

        console.log(`🔔 Triggering test notifications for user: ${user.email} (${user._id})`);

        // Initialize socket server (needed to process notifications)
        const dummyServer = http.createServer();
        await socketIOServer.initialize(dummyServer);

        // 1. P3 Notification (Info)
        console.log('Sending P3...');
        await notificationService.createNotification({
            recipientId: user._id,
            recipientType: 'customer',
            tenancy: tenant._id,
            type: 'test_info',
            title: 'Info Update',
            message: 'Your profile has been updated.',
            icon: 'user',
            severity: 'info',
            priority: 'P3'
        });

        // 2. P2 Notification (Success)
        console.log('Sending P2...');
        await notificationService.createNotification({
            recipientId: user._id,
            recipientType: 'customer',
            tenancy: tenant._id,
            type: 'test_success',
            title: 'Order Completed',
            message: 'Your order #12345 is ready!',
            icon: 'package',
            severity: 'success',
            priority: 'P2'
        });

        // 3. P1 Notification (Warning/High)
        console.log('Sending P1...');
        await notificationService.createNotification({
            recipientId: user._id,
            recipientType: 'customer',
            tenancy: tenant._id,
            type: 'test_warning',
            title: 'Payment Pending',
            message: 'Your payment for order #12345 is overdue.',
            icon: 'credit-card',
            severity: 'warning',
            priority: 'P1'
        });

        // 4. P0 Notification (Error/Critical)
        console.log('Sending P0...');
        await notificationService.createNotification({
            recipientId: user._id,
            recipientType: 'customer',
            tenancy: tenant._id,
            type: 'test_error',
            title: 'Security Alert',
            message: 'A new login was detected from a new device.',
            icon: 'shield',
            severity: 'error',
            priority: 'P0'
        });

        console.log('✅ All test notifications sent!');

        // Wait for batch processing to finish in audit logger if any
        setTimeout(() => {
            process.exit(0);
        }, 2000);

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

test();
