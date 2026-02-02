const mongoose = require('mongoose');
const SuperAdminRole = require('./src/models/SuperAdminRole');
require('dotenv').config();

async function listRoles() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const roles = await SuperAdminRole.find({});
        console.log('Current Roles in DB:');
        roles.forEach(r => {
            console.log(`- Name: "${r.name}", Slug: "${r.slug}", ID: ${r._id}`);
        });
    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.disconnect();
    }
}

listRoles();
