/**
 * Sync Sales Role Permissions
 * 
 * This script updates the platform-sales role in the database to match
 * the new permission structure (3 permissions instead of 8).
 * 
 * Run: node scripts/sync-sales-role.js
 */

const mongoose = require('mongoose');
const SuperAdminRole = require('../src/models/SuperAdminRole');
require('dotenv').config();

async function syncSalesRole() {
    try {
        console.log('🔄 Connecting to database...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to database');

        // Find the platform-sales role
        const role = await SuperAdminRole.findOne({ slug: 'platform-sales' });

        if (!role) {
            console.log('❌ Platform Sales role not found in database');
            console.log('💡 Run the role seeder first to create default roles');
            await mongoose.disconnect();
            return;
        }

        console.log('\n📋 Current Role Details:');
        console.log('Name:', role.name);
        console.log('Slug:', role.slug);
        console.log('\n📝 Current Permissions:');

        // Show current non-empty permissions
        const currentPerms = [];
        Object.entries(role.permissions.toObject()).forEach(([key, value]) => {
            if (value && value !== '') {
                currentPerms.push(`  ✅ ${key}: ${value}`);
            }
        });
        console.log(currentPerms.join('\n'));
        console.log(`\nTotal active permissions: ${currentPerms.length}`);

        // Update to new permission structure
        console.log('\n🔄 Updating to new permission structure...');

        role.permissions = {
            // Keep only these 3 core permissions
            leads: 'rcude',              // Full access
            subscription_plans: 're',    // Read + Export
            payments_revenue: 'r',       // Read only

            // Clear all others
            platform_settings: '',
            tenant_crud: '',
            tenant_suspend: '',
            refunds: '',
            marketplace_control: '',
            platform_coupons: '',
            rule_engine_global: '',
            view_all_orders: '',
            audit_logs: '',
            user_impersonation: '',

            // Clear legacy permissions if they exist
            tenancies: '',
            superadmins: '',
            admins: '',
            customers: '',
            analytics: '',
            reports: '',
            billing: '',
            settlements: '',
            system_settings: '',
            features: '',
            security: '',
            campaigns: '',
            banners: '',
            tickets: ''
        };

        await role.save();

        console.log('✅ Role updated successfully!');
        console.log('\n📝 New Permissions:');
        console.log('  ✅ leads: rcude (Full access)');
        console.log('  ✅ subscription_plans: re (Read + Export)');
        console.log('  ✅ payments_revenue: r (Read only)');
        console.log('\nTotal active permissions: 3');

        console.log('\n🎉 Migration completed successfully!');
        console.log('💡 Frontend and backend are now in sync');

    } catch (error) {
        console.error('❌ Error during migration:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from database');
    }
}

// Run the migration
syncSalesRole()
    .then(() => {
        console.log('\n✅ Script completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });
