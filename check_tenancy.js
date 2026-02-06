require('dotenv').config();
const mongoose = require('mongoose');
const Tenancy = require('./src/models/Tenancy');

const checkTenancy = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const searchTerms = ['tenacy', 'tenancy'];

        for (const term of searchTerms) {
            const tenancy = await Tenancy.findOne({ subdomain: term });
            if (tenancy) {
                console.log(`FOUND Tenancy for subdomain '${term}':`);
                console.log(`- ID: ${tenancy._id}`);
                console.log(`- Name: ${tenancy.name}`);
                console.log(`- Subdomain: ${tenancy.subdomain}`);
            } else {
                console.log(`NOT FOUND: No tenancy with subdomain '${term}'`);
            }
        }

        // Also list all subdomains to help debugging
        const allTenancies = await Tenancy.find({}).select('subdomain name');
        console.log('\nAll available subdomains:');
        allTenancies.forEach(t => console.log(`- ${t.subdomain} (${t.name})`));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
};

checkTenancy();
