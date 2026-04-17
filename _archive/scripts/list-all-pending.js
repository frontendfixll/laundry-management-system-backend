const mongoose = require('mongoose');
const PendingSignup = require('./src/models/PendingSignup');
require('dotenv').config();

async function listPending() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const recentPending = await PendingSignup.find({})
            .sort({ createdAt: -1 })
            .limit(10);

        console.log('\n--- Recent 10 Pending Signups ---');
        recentPending.forEach(p => {
            console.log(`[${p.createdAt.toISOString()}] ${p.email} | Status: ${p.status} | Business: ${p.businessName}`);
        });

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

listPending();
