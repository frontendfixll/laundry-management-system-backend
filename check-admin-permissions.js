// Script to check admin permissions
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');

async function checkAdminPermissions() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const email = 'pgkota406@gmail.com';
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log('User not found:', email);
      process.exit(1);
    }

    console.log('=== Admin Details ===');
    console.log('Name:', user.name);
    console.log('Email:', user.email);
    console.log('Role:', user.role);
    console.log('Is Active:', user.isActive);
    console.log('\n=== Permissions ===');
    
    if (!user.permissions || Object.keys(user.permissions).length === 0) {
      console.log('No permissions set!');
    } else {
      // Show permissions in readable format
      for (const [module, actions] of Object.entries(user.permissions)) {
        const enabledActions = Object.entries(actions)
          .filter(([_, enabled]) => enabled)
          .map(([action]) => action);
        
        if (enabledActions.length > 0) {
          console.log(`\n${module.toUpperCase()}:`);
          console.log('  ✓', enabledActions.join(', '));
        }
      }
    }

    console.log('\n=== Sidebar Items that will show ===');
    const sidebarItems = [
      { name: 'Dashboard', permission: null },
      { name: 'Orders', permission: { module: 'orders', action: 'view' } },
      { name: 'Customers', permission: { module: 'customers', action: 'view' } },
      { name: 'Branches', permission: { module: 'branches', action: 'view' } },
      { name: 'Services', permission: { module: 'services', action: 'view' } },
      { name: 'Logistics', permission: { module: 'orders', action: 'assign' } },
      { name: 'Complaints', permission: { module: 'customers', action: 'view' } },
      { name: 'Refunds', permission: { module: 'orders', action: 'refund' } },
      { name: 'Payments', permission: { module: 'financial', action: 'view' } },
      { name: 'Analytics', permission: { module: 'reports', action: 'view' } },
      { name: 'Users', permission: { module: 'users', action: 'view' } },
      { name: 'Settings', permission: { module: 'settings', action: 'view' } },
      { name: 'Help', permission: null },
    ];

    sidebarItems.forEach(item => {
      if (!item.permission) {
        console.log('✓', item.name, '(always visible)');
      } else {
        const hasPermission = user.permissions?.[item.permission.module]?.[item.permission.action];
        if (hasPermission) {
          console.log('✓', item.name);
        } else {
          console.log('✗', item.name, '(hidden)');
        }
      }
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAdminPermissions();
