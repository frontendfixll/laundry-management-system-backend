/**
 * Add New Sales Roles to Database
 * 
 * This script adds the new platform-sales-junior and platform-sales-senior
 * roles to the database for individual user RBAC implementation.
 * 
 * Run: node scripts/add-new-sales-roles.js
 */

const mongoose = require('mongoose');
const SuperAdminRole = require('../src/models/SuperAdminRole');
const { PLATFORM_ROLES } = require('../src/config/roleDefinitions');
require('dotenv').config();

async function addNewSalesRoles() {
    try {
        console.log('🔄 Connecting to database...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to database');

        // Get the new sales roles from config
        const newRoles = [
            PLATFORM_ROLES.PLATFORM_SALES_JUNIOR,
            PLATFORM_ROLES.PLATFORM_SALES_SENIOR
        ];

        console.log('\n📋 Adding new sales roles...');

        for (const roleData of newRoles) {
            try {
                // Check if role already exists
                const existing = await SuperAdminRole.findOne({ slug: roleData.slug });
                
                if (existing) {
                    console.log(`⚠️ Role already exists: ${roleData.name}`);
                    
                    // Update existing role with new permissions
                    existing.permissions = roleData.permissions;
                    existing.description = roleData.description;
                    existing.color = roleData.color;
                    await existing.save();
                    
                    console.log(`✅ Updated existing role: ${roleData.name}`);
                } else {
                    // Create new role
                    const newRole = await SuperAdminRole.create({
                        name: roleData.name,
                        slug: roleData.slug,
                        description: roleData.description,
                        isDefault: roleData.isDefault,
                        color: roleData.color,
                        permissions: roleData.permissions
                    });
                    
                    console.log(`✅ Created new role: ${roleData.name}`);
                }

                // Show permissions for this role
                console.log(`\n📝 Permissions for ${roleData.name}:`);
                Object.entries(roleData.permissions).forEach(([key, value]) => {
                    if (value && value !== '') {
                        console.log(`  ✅ ${key}: ${value}`);
                    }
                });
                console.log('');

            } catch (error) {
                console.error(`❌ Error processing role ${roleData.name}:`, error);
            }
        }

        // Show all sales roles in database
        console.log('\n📊 All Sales Roles in Database:');
        const salesRoles = await SuperAdminRole.find({ 
            slug: { $regex: '^platform-sales' } 
        }).sort({ slug: 1 });

        salesRoles.forEach(role => {
            const permCount = Object.values(role.permissions.toObject())
                .filter(p => p && p !== '').length;
            console.log(`  🎯 ${role.name} (${role.slug}) - ${permCount} permissions`);
        });

        console.log('\n🎉 New sales roles added successfully!');
        console.log('\n💡 Next Steps:');
        console.log('1. Assign users to these new roles in the SuperAdmin dashboard');
        console.log('2. Test role-based access in the sales portal');
        console.log('3. Verify sidebar and feature visibility based on permissions');

    } catch (error) {
        console.error('❌ Error during role creation:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
        console.log('\n👋 Disconnected from database');
    }
}

// Run the script
addNewSalesRoles()
    .then(() => {
        console.log('\n✅ Script completed');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });