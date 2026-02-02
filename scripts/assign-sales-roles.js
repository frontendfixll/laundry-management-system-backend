/**
 * Assign Sales Roles to Users
 * 
 * This script assigns the new RBAC roles to sales users for individual
 * user permission management.
 * 
 * Run: node scripts/assign-sales-roles.js
 */

const mongoose = require('mongoose');
const SalesUser = require('../src/models/SalesUser');
const SuperAdminRole = require('../src/models/SuperAdminRole');
require('dotenv').config();

async function assignSalesRoles() {
    try {
        console.log('🔄 Connecting to database...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to database');

        // Get all sales roles
        const salesRoles = await SuperAdminRole.find({ 
            slug: { $regex: '^platform-sales' } 
        }).sort({ slug: 1 });

        console.log('\n📋 Available Sales Roles:');
        salesRoles.forEach(role => {
            const permCount = Object.values(role.permissions.toObject())
                .filter(p => p && p !== '').length;
            console.log(`  🎯 ${role.name} (${role.slug}) - ${permCount} permissions`);
        });

        if (salesRoles.length === 0) {
            console.log('❌ No sales roles found. Run add-new-sales-roles.js first');
            return;
        }

        // Get all sales users
        const salesUsers = await SalesUser.find({}).populate('roles');
        console.log(`\n👥 Found ${salesUsers.length} sales users`);

        if (salesUsers.length === 0) {
            console.log('💡 Creating sample sales users for testing...');
            await createSampleSalesUsers(salesRoles);
        } else {
            console.log('\n🔄 Assigning roles to existing users...');
            await assignRolesToExistingUsers(salesUsers, salesRoles);
        }

        console.log('\n🎉 Role assignment completed successfully!');
        console.log('\n💡 Next Steps:');
        console.log('1. Test login with different sales users');
        console.log('2. Verify role-based permissions in sales dashboard');
        console.log('3. Check sidebar visibility based on assigned roles');

    } catch (error) {
        console.error('❌ Error during role assignment:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from database');
    }
}

async function createSampleSalesUsers(salesRoles) {
    const sampleUsers = [
        {
            name: 'Sales Junior User',
            email: 'sales.junior@laundrypro.com',
            password: 'SalesJunior@123',
            phone: '+91-9876543210',
            roleSlug: 'platform-sales-junior',
            designation: 'Junior Sales Executive',
            department: 'Sales'
        },
        {
            name: 'Sales Senior User',
            email: 'sales.senior@laundrypro.com',
            password: 'SalesSenior@123',
            phone: '+91-9876543211',
            roleSlug: 'platform-sales-senior',
            designation: 'Senior Sales Manager',
            department: 'Sales'
        },
        {
            name: 'Sales Regular User',
            email: 'sales.regular@laundrypro.com',
            password: 'SalesRegular@123',
            phone: '+91-9876543212',
            roleSlug: 'platform-sales',
            designation: 'Sales Executive',
            department: 'Sales'
        }
    ];

    for (const userData of sampleUsers) {
        try {
            // Check if user already exists
            const existing = await SalesUser.findOne({ email: userData.email });
            if (existing) {
                console.log(`⚠️ User already exists: ${userData.email}`);
                continue;
            }

            // Find the role
            const role = salesRoles.find(r => r.slug === userData.roleSlug);
            if (!role) {
                console.log(`❌ Role not found: ${userData.roleSlug}`);
                continue;
            }

            // Create user
            const newUser = new SalesUser({
                name: userData.name,
                email: userData.email,
                password: userData.password,
                phone: userData.phone,
                roleSlug: userData.roleSlug,
                roles: [role._id],
                designation: userData.designation,
                department: userData.department,
                isActive: true,
                isEmailVerified: true
            });

            await newUser.save();
            console.log(`✅ Created user: ${userData.name} (${userData.roleSlug})`);

        } catch (error) {
            console.error(`❌ Error creating user ${userData.email}:`, error);
        }
    }
}

async function assignRolesToExistingUsers(salesUsers, salesRoles) {
    for (const user of salesUsers) {
        try {
            // Skip if user already has roles assigned
            if (user.roles && user.roles.length > 0) {
                console.log(`⚠️ User ${user.email} already has roles assigned`);
                continue;
            }

            // Assign default platform-sales role if no roleSlug specified
            const targetRoleSlug = user.roleSlug || 'platform-sales';
            const role = salesRoles.find(r => r.slug === targetRoleSlug);

            if (!role) {
                console.log(`❌ Role not found for ${user.email}: ${targetRoleSlug}`);
                continue;
            }

            // Assign role
            user.roles = [role._id];
            user.roleSlug = targetRoleSlug;
            await user.save();

            console.log(`✅ Assigned ${role.name} to ${user.email}`);

        } catch (error) {
            console.error(`❌ Error assigning role to ${user.email}:`, error);
        }
    }
}

// Run the script
assignSalesRoles()
    .then(() => {
        console.log('\n✅ Script completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });