require('dotenv').config();
const mongoose = require('mongoose');
const Tenancy = require('./src/models/Tenancy');

const renameTenancy = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Find the target tenancy
        const targetSubdomain = 'test-tenacy';
        const newSubdomain = 'tenacy';

        const tenancy = await Tenancy.findOne({ subdomain: targetSubdomain });

        if (!tenancy) {
            console.log(`❌ ERROR: Could not find tenancy with subdomain '${targetSubdomain}'`);
            return;
        }

        console.log(`Found tenancy: ${tenancy.name} (${tenancy.subdomain})`);

        // 2. Check if new subdomain is taken (just in case)
        const existing = await Tenancy.findOne({ subdomain: newSubdomain });
        if (existing) {
            console.log(`❌ ERROR: Subdomain '${newSubdomain}' is already taken by '${existing.name}'`);
            return;
        }

        // 3. Update the subdomain
        tenancy.subdomain = newSubdomain;

        // Also update slug if it matches
        if (tenancy.slug === targetSubdomain) {
            tenancy.slug = newSubdomain;
            console.log('Updating slug as well');
        }

        await tenancy.save();
        console.log(`✅ SUCCESS: Renamed tenancy to '${newSubdomain}'`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

renameTenancy();
