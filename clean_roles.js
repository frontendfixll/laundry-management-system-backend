const mongoose = require('mongoose');
const SuperAdminRole = require('./src/models/SuperAdminRole');
require('dotenv').config();

const REVERSE_PERMISSION_MAP = {
    'view': 'r',
    'create': 'c',
    'update': 'u',
    'delete': 'd',
    'export': 'e'
};

async function cleanRoles() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✓ Connected to MongoDB');

        const roles = await SuperAdminRole.find({});
        console.log(`Found ${roles.length} roles to clean.`);

        for (const role of roles) {
            console.log(`Cleaning role: "${role.name}" (${role.slug})`);
            const newPermissions = {};

            // Get all permission keys from the document (including ones not in schema if any)
            // but primarily we care about the ones in role.permissions
            const perms = role.permissions;

            for (const [module, value] of Object.entries(perms)) {
                if (typeof value === 'object' && value !== null) {
                    // Convert object to string
                    let str = '';
                    if (value.view || value.r) str += 'r';
                    if (value.create || value.c) str += 'c';
                    if (value.update || value.u) str += 'u';
                    if (value.delete || value.d) str += 'd';
                    if (value.export || value.e) str += 'e';

                    console.log(`  - Converted ${module} from object to "${str}"`);
                    newPermissions[module] = str;
                } else if (typeof value === 'string') {
                    newPermissions[module] = value;
                } else {
                    newPermissions[module] = '';
                }
            }

            // Use markModified to ensure Mongoose saves the nested object
            role.permissions = newPermissions;
            role.markModified('permissions');
            await role.save();
            console.log(`  ✓ Saved`);
        }

        console.log('\n✅ All roles cleaned and normalized.');
    } catch (err) {
        console.error('❌ Cleaning failed:', err);
    } finally {
        await mongoose.disconnect();
    }
}

cleanRoles();
