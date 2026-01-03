const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./src/models/User');
const Branch = require('./src/models/Branch');

async function setupCenterAdminBranch() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find the center admin user (d@gmail.com)
    const centerAdmin = await User.findOne({ email: 'd@gmail.com' });
    if (!centerAdmin) {
      console.log('❌ Center Admin user not found (d@gmail.com)');
      console.log('\nLooking for users with branch_manager role...');
      const branchManagers = await User.find({ role: 'branch_manager' }).select('name email role');
      console.log('Branch Managers:', branchManagers);
      process.exit(1);
    }

    console.log('✅ Found Center Admin:', centerAdmin.name, centerAdmin.email);

    // Find a branch to assign
    let branch = await Branch.findOne({ manager: centerAdmin._id });
    
    if (branch) {
      console.log('✅ Branch already assigned:', branch.name);
    } else {
      // Find any branch without a manager or create one
      branch = await Branch.findOne({ $or: [{ manager: null }, { manager: { $exists: false } }] });
      
      if (!branch) {
        // Get first branch
        branch = await Branch.findOne();
      }

      if (branch) {
        branch.manager = centerAdmin._id;
        await branch.save();
        console.log('✅ Assigned branch:', branch.name, 'to Center Admin');
      } else {
        // Create a new branch
        branch = await Branch.create({
          name: 'Main Branch',
          code: 'MAIN001',
          address: {
            street: '123 Main Street',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001'
          },
          contact: {
            phone: '9876543210',
            email: 'd@gmail.com'
          },
          manager: centerAdmin._id,
          isActive: true,
          operatingHours: {
            open: '09:00',
            close: '21:00'
          }
        });
        console.log('✅ Created new branch:', branch.name);
      }
    }

    console.log('\n📋 Summary:');
    console.log('Center Admin:', centerAdmin.email);
    console.log('Branch:', branch.name, `(${branch.code})`);
    console.log('\n✅ Setup complete! Center Admin can now access the dashboard.');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

setupCenterAdminBranch();
