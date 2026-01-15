/**
 * Seed Feature Definitions
 * Run: node scripts/seed-feature-definitions.js
 * 
 * Creates default feature definitions for the billing plan system
 */

require('dotenv').config();
const mongoose = require('mongoose');
const FeatureDefinition = require('../src/models/FeatureDefinition');

const defaultFeatures = [
  // ============ ADMIN PERMISSIONS & POWERS ============
  {
    key: 'branch_management',
    name: 'Branch Management',
    description: 'Create and manage multiple branch locations',
    category: 'admin_permissions',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 1,
    icon: 'Building2'
  },
  {
    key: 'branch_admin_rbac',
    name: 'Branch Admin RBAC',
    description: 'Role-based access control for branch admins',
    category: 'admin_permissions',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 2,
    icon: 'Shield'
  },
  {
    key: 'staff_management',
    name: 'Staff Management',
    description: 'Add and manage staff members with roles',
    category: 'admin_permissions',
    valueType: 'boolean',
    defaultValue: true,
    isSystem: true,
    sortOrder: 3,
    icon: 'Users'
  },
  {
    key: 'custom_roles',
    name: 'Custom Roles',
    description: 'Create custom roles with specific permissions',
    category: 'admin_permissions',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 4,
    icon: 'UserCog'
  },
  {
    key: 'inventory_management',
    name: 'Inventory Management',
    description: 'Track and manage inventory items',
    category: 'admin_permissions',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 5,
    icon: 'Package'
  },
  {
    key: 'service_management',
    name: 'Service Management',
    description: 'Create and manage laundry services and pricing',
    category: 'admin_permissions',
    valueType: 'boolean',
    defaultValue: true,
    isSystem: true,
    sortOrder: 6,
    icon: 'Sparkles'
  },
  {
    key: 'logistics_management',
    name: 'Logistics & Delivery',
    description: 'Manage pickup and delivery logistics',
    category: 'admin_permissions',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 7,
    icon: 'Truck'
  },
  {
    key: 'payment_management',
    name: 'Payment Management',
    description: 'View and manage payments, refunds',
    category: 'admin_permissions',
    valueType: 'boolean',
    defaultValue: true,
    isSystem: true,
    sortOrder: 8,
    icon: 'CreditCard'
  },
  {
    key: 'customer_management',
    name: 'Customer Management',
    description: 'View and manage customer accounts',
    category: 'admin_permissions',
    valueType: 'boolean',
    defaultValue: true,
    isSystem: true,
    sortOrder: 9,
    icon: 'UserCheck'
  },
  {
    key: 'reports_export',
    name: 'Reports & Export',
    description: 'Generate and export business reports',
    category: 'admin_permissions',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 10,
    icon: 'FileText'
  },
  
  // ============ PLATFORM FEATURES ============
  {
    key: 'campaigns',
    name: 'Campaigns',
    description: 'Create and manage promotional campaigns',
    category: 'platform',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 10,
    icon: 'Megaphone'
  },
  {
    key: 'coupons',
    name: 'Coupons',
    description: 'Create and manage discount coupons',
    category: 'platform',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 11,
    icon: 'Ticket'
  },
  {
    key: 'banners',
    name: 'Banners',
    description: 'Display promotional banners on customer app',
    category: 'platform',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 12,
    icon: 'Image'
  },
  {
    key: 'wallet',
    name: 'Wallet',
    description: 'Customer wallet for prepaid balance',
    category: 'platform',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 13,
    icon: 'Wallet'
  },
  {
    key: 'referral_program',
    name: 'Referral Program',
    description: 'Customer referral rewards system',
    category: 'platform',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 14,
    icon: 'Users'
  },
  {
    key: 'loyalty_points',
    name: 'Loyalty Points',
    description: 'Customer loyalty points and rewards',
    category: 'platform',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 15,
    icon: 'Award'
  },
  {
    key: 'advanced_analytics',
    name: 'Advanced Analytics',
    description: 'Detailed business analytics and reports',
    category: 'platform',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 16,
    icon: 'BarChart3'
  },
  {
    key: 'api_access',
    name: 'API Access',
    description: 'Access to REST API for integrations',
    category: 'platform',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 17,
    icon: 'Code'
  },
  
  // ============ LIMITS ============
  {
    key: 'max_orders',
    name: 'Max Orders/Month',
    description: 'Maximum orders allowed per month (-1 for unlimited)',
    category: 'limits',
    valueType: 'number',
    defaultValue: 100,
    constraints: { min: -1, max: 1000000, unlimitedValue: -1 },
    isSystem: true,
    sortOrder: 20,
    icon: 'Package'
  },
  {
    key: 'max_staff',
    name: 'Max Staff Members',
    description: 'Maximum staff accounts (-1 for unlimited)',
    category: 'limits',
    valueType: 'number',
    defaultValue: 5,
    constraints: { min: -1, max: 10000, unlimitedValue: -1 },
    isSystem: true,
    sortOrder: 21,
    icon: 'UserPlus'
  },
  {
    key: 'max_customers',
    name: 'Max Customers',
    description: 'Maximum customer accounts (-1 for unlimited)',
    category: 'limits',
    valueType: 'number',
    defaultValue: 500,
    constraints: { min: -1, max: 10000000, unlimitedValue: -1 },
    isSystem: true,
    sortOrder: 22,
    icon: 'Users'
  },
  {
    key: 'max_branches',
    name: 'Max Branches',
    description: 'Maximum branch locations (-1 for unlimited)',
    category: 'limits',
    valueType: 'number',
    defaultValue: 1,
    constraints: { min: -1, max: 1000, unlimitedValue: -1 },
    isSystem: true,
    sortOrder: 23,
    icon: 'Building2'
  },
  
  // ============ BRANDING ============
  {
    key: 'custom_branding',
    name: 'Custom Branding',
    description: 'Customize colors and theme',
    category: 'branding',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 30,
    icon: 'Palette'
  },
  {
    key: 'custom_logo',
    name: 'Custom Logo',
    description: 'Upload custom business logo',
    category: 'branding',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 31,
    icon: 'ImagePlus'
  },
  {
    key: 'custom_domain',
    name: 'Custom Domain',
    description: 'Use your own domain name',
    category: 'branding',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 32,
    icon: 'Globe'
  },
  {
    key: 'white_label',
    name: 'White Label',
    description: 'Remove LaundryLobby branding completely',
    category: 'branding',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 33,
    icon: 'EyeOff'
  },
  
  // ============ SUPPORT ============
  {
    key: 'priority_support',
    name: 'Priority Support',
    description: '24/7 priority customer support',
    category: 'support',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 40,
    icon: 'HeadphonesIcon'
  },
  {
    key: 'dedicated_manager',
    name: 'Dedicated Account Manager',
    description: 'Personal account manager for your business',
    category: 'support',
    valueType: 'boolean',
    defaultValue: false,
    isSystem: true,
    sortOrder: 41,
    icon: 'UserCheck'
  }
];

async function seedFeatures() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry-platform';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    
    let created = 0;
    let updated = 0;
    let skipped = 0;
    
    for (const feature of defaultFeatures) {
      const existing = await FeatureDefinition.findOne({ key: feature.key });
      
      if (existing) {
        // Update only if it's a system feature (don't override custom changes)
        if (existing.isSystem) {
          await FeatureDefinition.updateOne(
            { key: feature.key },
            { $set: { ...feature, isSystem: true } }
          );
          updated++;
          console.log(`Updated: ${feature.key}`);
        } else {
          skipped++;
          console.log(`Skipped (custom): ${feature.key}`);
        }
      } else {
        await FeatureDefinition.create(feature);
        created++;
        console.log(`Created: ${feature.key}`);
      }
    }
    
    console.log('\n========== Summary ==========');
    console.log(`Created: ${created}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Total features: ${await FeatureDefinition.countDocuments()}`);
    
  } catch (error) {
    console.error('Error seeding features:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run if called directly
if (require.main === module) {
  seedFeatures();
}

module.exports = { seedFeatures, defaultFeatures };
