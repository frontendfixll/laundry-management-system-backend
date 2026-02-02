const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const SuperAdmin = require('./src/models/SuperAdmin');
const SuperAdminRole = require('./src/models/SuperAdminRole');

const createPlatformFinanceAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if Platform Finance Admin role exists
    let financeRole = await SuperAdminRole.findOne({ 
      $or: [
        { slug: 'platform-finance-admin' },
        { name: 'Platform Finance Admin' }
      ]
    });

    if (!financeRole) {
      // Create Platform Finance Admin role
      financeRole = await SuperAdminRole.create({
        name: 'Platform Finance Admin',
        slug: 'platform-finance-admin',
        description: 'Manages platform financial operations, payments, refunds, and settlements',
        permissions: [
          'view_all_payments',
          'approve_refunds',
          'approve_payouts',
          'view_financial_reports',
          'export_ledger_data',
          'view_transaction_logs',
          'manage_settlements',
          'view_revenue_analytics'
        ],
        isActive: true
      });
      console.log('✅ Created Platform Finance Admin role');
    } else {
      console.log('✅ Platform Finance Admin role already exists');
    }

    // Check if finance admin user exists
    let financeAdmin = await SuperAdmin.findOne({ email: 'finance@gmail.com' });

    if (!financeAdmin) {
      // Create Platform Finance Admin user
      financeAdmin = await SuperAdmin.create({
        name: 'Platform Finance Admin',
        email: 'finance@gmail.com',
        password: 'finance2025', // Will be hashed automatically by pre-save hook
        roles: [financeRole._id],
        isActive: true,
        emailVerified: true,
        mfaEnabled: false, // Disable MFA for quick testing
        createdBy: 'system',
        lastLogin: new Date()
      });
      console.log('✅ Created Platform Finance Admin user');
    } else {
      // Update existing user with finance role if not already assigned
      if (!financeAdmin.roles.includes(financeRole._id)) {
        financeAdmin.roles.push(financeRole._id);
        await financeAdmin.save();
        console.log('✅ Added Platform Finance Admin role to existing user');
      } else {
        console.log('✅ Platform Finance Admin user already exists with correct role');
      }
    }

    console.log('\n🎉 Platform Finance Admin Setup Complete!');
    console.log('=' .repeat(50));
    console.log('📧 Email: finance@gmail.com');
    console.log('🔑 Password: finance2025');
    console.log('🏷️ Role: Platform Finance Admin');
    console.log('🎯 Dashboard: /dashboard/finance');
    console.log('=' .repeat(50));

    // Verify the setup
    const verifyUser = await SuperAdmin.findOne({ email: 'finance@gmail.com' }).populate('roles');
    if (verifyUser && verifyUser.roles.length > 0) {
      console.log('\n✅ Verification Successful:');
      console.log(`👤 User: ${verifyUser.name} (${verifyUser.email})`);
      console.log(`🏷️ Roles: ${verifyUser.roles.map(r => r.name).join(', ')}`);
      console.log(`🔐 Active: ${verifyUser.isActive}`);
    }

  } catch (error) {
    console.error('❌ Error creating Platform Finance Admin:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

// Run the script
createPlatformFinanceAdmin();