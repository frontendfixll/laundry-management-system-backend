const mongoose = require('mongoose');
const SuperAdminRole = require('./src/models/SuperAdminRole');
const SuperAdmin = require('./src/models/SuperAdmin');
require('dotenv').config();

/**
 * Cleanup Script: Remove duplicate "Platform Read-Only Auditor" role
 * Migrate users to the standardized "Platform Auditor" role
 */

async function cleanupDuplicateAuditor() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Find both roles
        const legacyRole = await SuperAdminRole.findOne({ slug: 'platform-read-only-auditor' });
        const standardRole = await SuperAdminRole.findOne({ slug: 'platform-auditor' });

        if (!legacyRole) {
            console.log('ℹ️  No legacy "platform-read-only-auditor" role found. Nothing to clean up.');
            return;
        }

        if (!standardRole) {
            console.log('⚠️  Standard "platform-auditor" role not found. Cannot migrate users.');
            console.log('   Please run sync_platform_roles.js first.');
            return;
        }

        console.log('\n📋 Found roles:');
        console.log(`   Legacy: "${legacyRole.name}" (${legacyRole.slug}) - ID: ${legacyRole._id}`);
        console.log(`   Standard: "${standardRole.name}" (${standardRole.slug}) - ID: ${standardRole._id}`);

        // Find users with the legacy role
        const usersWithLegacyRole = await SuperAdmin.find({ roles: legacyRole._id });
        console.log(`\n👥 Found ${usersWithLegacyRole.length} user(s) with legacy role`);

        if (usersWithLegacyRole.length > 0) {
            console.log('\n🔄 Migrating users to standard role...');

            for (const user of usersWithLegacyRole) {
                // Remove legacy role and add standard role
                user.roles = user.roles.filter(roleId => !roleId.equals(legacyRole._id));

                // Add standard role if not already present
                if (!user.roles.some(roleId => roleId.equals(standardRole._id))) {
                    user.roles.push(standardRole._id);
                }

                await user.save();
                console.log(`   ✓ Migrated: ${user.name} (${user.email})`);
            }

            console.log(`✅ Successfully migrated ${usersWithLegacyRole.length} user(s)`);
        }

        // Delete the legacy role
        console.log('\n🗑️  Deleting legacy role...');
        await SuperAdminRole.deleteOne({ _id: legacyRole._id });
        console.log('✅ Legacy "platform-read-only-auditor" role deleted');

        // Verify cleanup
        console.log('\n✅ Cleanup complete! Current roles:');
        const remainingRoles = await SuperAdminRole.find({});
        remainingRoles.forEach(r => {
            console.log(`   - ${r.name} (${r.slug})`);
        });

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

cleanupDuplicateAuditor();
