const mongoose = require('mongoose');
const PendingSignup = require('./src/models/PendingSignup');
const Tenancy = require('./src/models/Tenancy');
const User = require('./src/models/User');
require('dotenv').config();

async function listAllRecent() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const pending = await PendingSignup.find({ createdAt: { $gte: oneDayAgo } });
        const users = await User.find({ createdAt: { $gte: oneDayAgo } });
        const tenancies = await Tenancy.find({ createdAt: { $gte: oneDayAgo } });

        console.log('\n--- Recent 24h Activity ---');
        console.log('Pending Signups:', pending.length);
        pending.forEach(p => console.log(`  - ${p.email} | ${p.status} | ${p.createdAt}`));

        console.log('New Users:', users.length);
        users.forEach(u => console.log(`  - ${u.email} | ${u.role} | ${u.createdAt}`));

        console.log('New Tenancies:', tenancies.length);
        tenancies.forEach(t => console.log(`  - ${t.name} | ${t.slug} | ${t.createdAt}`));

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

listAllRecent();
