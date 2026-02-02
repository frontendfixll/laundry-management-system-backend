const mongoose = require('mongoose');
const SuperAdminRole = require('./src/models/SuperAdminRole');
const { PLATFORM_ROLES } = require('./src/config/roleDefinitions');
require('dotenv').config();

/**
 * Robust script to sync platform roles with roleDefinitions.js
 * Updates existing roles and creates missing ones.
 */
async function syncPlatformRoles() {
    try {
        console.log('🚀 Starting Platform Role Synchronization...\n');

        // Connect to MongoDB
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI not found in .env');
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✓ Connected to MongoDB\n');

        const rolesToSync = Object.values(PLATFORM_ROLES);
        console.log(`📋 Found ${rolesToSync.length} definitions in roleDefinitions.js\n`);

        for (const roleData of rolesToSync) {
            const existing = await SuperAdminRole.findOne({ slug: roleData.slug });

            if (existing) {
                console.log(`  ⊙ Updating role: "${roleData.name}" (${roleData.slug})`);
                existing.name = roleData.name;
                existing.description = roleData.description;
                existing.color = roleData.color;
                existing.permissions = roleData.permissions;
                existing.isDefault = roleData.isDefault;
                await existing.save();
                console.log(`    ✓ Updated`);
            } else {
                console.log(`  ✚ Creating role: "${roleData.name}" (${roleData.slug})`);
                await SuperAdminRole.create({
                    name: roleData.name,
                    slug: roleData.slug,
                    description: roleData.description,
                    color: roleData.color,
                    permissions: roleData.permissions,
                    isDefault: roleData.isDefault
                });
                console.log(`    ✓ Created`);
            }
        }

        console.log('\n✅ Role synchronization completed successfully!');

    } catch (error) {
        console.error('\n❌ Sync failed:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('✓ Disconnected from MongoDB');
    }
}

syncPlatformRoles();
