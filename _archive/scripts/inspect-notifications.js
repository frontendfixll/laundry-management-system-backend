const mongoose = require('mongoose');
const Notification = require('./src/models/Notification');
require('dotenv').config();

async function inspectNotifications() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const recentNotifications = await Notification.find({})
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        console.log('\n--- Recent 20 Notifications ---');
        recentNotifications.forEach(n => {
            console.log(`[${n.createdAt.toISOString()}] Priority: ${n.priority} | Title: ${n.title} | Recipient: ${n.recipient} (${n.recipientModel})`);
            console.log(`   Message: ${n.message}`);
        });

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

inspectNotifications();
