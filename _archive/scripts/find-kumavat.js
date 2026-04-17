const mongoose = require('mongoose');
const User = require('./src/models/User');
const Tenancy = require('./src/models/Tenancy');
const PendingSignup = require('./src/models/PendingSignup');
const Notification = require('./src/models/Notification');
require('dotenv').config();

async function findSignup() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const emailPattern = /kumavat/i;

        const user = await User.findOne({ email: emailPattern });
        const tenancy = await Tenancy.findOne({ name: emailPattern });
        const pending = await PendingSignup.find({ email: emailPattern });
        const recentNotifs = await Notification.find({}).sort({ createdAt: -1 }).limit(5);

        console.log('\n--- Result for "kumavat" ---');
        console.log('User:', user ? `${user.email} (ID: ${user._id})` : 'Not found');
        console.log('Tenancy:', tenancy ? `${tenancy.name} (ID: ${tenancy._id})` : 'Not found');
        console.log('Pending Signup Count:', pending.length);
        pending.forEach(p => console.log(`  - ${p.email} | Status: ${p.status} | Created: ${p.createdAt}`));

        console.log('\n--- Recent 5 Notifications ---');
        recentNotifs.forEach(n => {
            console.log(`[${n.createdAt.toISOString()}] ${n.title} | ${n.recipientModel}`);
        });

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected');
        process.exit(0);
    }
}

findSignup();
