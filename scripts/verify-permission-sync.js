/**
 * Verify Permission Sync
 * Run: node scripts/verify-permission-sync.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Tenancy = require('../src/models/Tenancy');
const User = require('../src/models/User');
const permissionSyncService = require('../src/services/permissionSyncService');
const { USER_ROLES } = require('../src/config/constants');

async function verify() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // 1. Find or create a test admin
        let user = await User.findOne({ email: 'test-admin@sync.com' });
        if (!user) {
            user = await User.create({
                name: 'Test Admin',
                email: 'test-admin@sync.com',
                phone: '9876543210',
                password: 'password123',
                role: USER_ROLES.ADMIN,
                tenancy: new mongoose.Types.ObjectId(), // Placeholder
                permissions: {}
            });
            console.log('✅ Created test user');
        } else {
            user.phone = '9876543210';
            await user.save();
        }

        // 2. Find or create a test tenancy
        let tenancy = await Tenancy.findOne({ slug: 'test-sync-tenancy' });
        if (!tenancy) {
            tenancy = await Tenancy.create({
                name: 'Test Sync Tenancy',
                slug: 'test-sync-tenancy',
                subdomain: 'test-sync',
                owner: user._id,
                'subscription.plan': 'basic',
                'subscription.status': 'active',
                'subscription.features': {
                    branch_management: true,
                    staff_management: true,
                    customer_management: true,
                    campaigns: false,
                    max_orders: 100
                }
            });
            console.log('✅ Created test tenancy');
        }

        user.tenancy = tenancy._id;
        await user.save();

        // 3. Sync permissions
        console.log('🔄 Syncing permissions...');
        const result = await permissionSyncService.syncUserPermissions(user._id);

        if (result.success) {
            console.log('✅ Sync successful');

            user = await User.findById(user._id);

            const checks = [
                { module: 'branches', expected: true, name: 'Branch Management (Enabled)' },
                { module: 'staff', expected: true, name: 'Staff Management (Enabled)' },
                { module: 'campaigns', expected: false, name: 'Campaigns (Disabled)' }
            ];

            let allPassed = true;
            checks.forEach(check => {
                const hasPerm = user.permissions[check.module] && user.permissions[check.module].view;
                if (hasPerm === check.expected) {
                    console.log(`PASS: ${check.name}`);
                } else {
                    console.error(`FAIL: ${check.name} - Expected ${check.expected}, got ${hasPerm}`);
                    allPassed = false;
                }
            });

            console.log('➕ Testing Add-on aggregation...');
            tenancy.subscription.addOnFeatures = { campaigns: true };
            await tenancy.save();

            console.log('🔄 Syncing permissions again with add-on...');
            await permissionSyncService.syncUserPermissions(user._id);
            user = await User.findById(user._id).lean();

            const campaignCheck = user.permissions.campaigns && user.permissions.campaigns.view;
            if (campaignCheck === true) {
                console.log('PASS: Campaigns (Now Enabled via Add-on)');
            } else {
                console.error('FAIL: Campaigns - Should be enabled via add-on');
                allPassed = false;
            }

            if (allPassed) {
                console.log('\n✨ ALL PERMISSION SYNC TESTS PASSED! ✨');
            } else {
                console.error('\n❌ SOME TESTS FAILED');
            }
        } else {
            console.error('❌ Sync failed:', result.error);
        }

    } catch (error) {
        console.error('❌ Verification error:', error);
    } finally {
        await mongoose.connection.close();
    }
}

verify();
