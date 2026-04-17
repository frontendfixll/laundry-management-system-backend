/**
 * Create a branch for a tenancy
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function createBranch() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const Branch = require('./src/models/Branch');
    const Tenancy = require('./src/models/Tenancy');
    
    // Get the dgsfg tenancy
    const tenancy = await Tenancy.findOne({ name: 'dgsfg' });
    
    if (!tenancy) {
      console.log('❌ Tenancy not found');
      await mongoose.disconnect();
      return;
    }
    
    console.log('Tenancy:', tenancy.name, tenancy._id);
    
    // Check if branch already exists for this tenancy
    const existingBranch = await Branch.findOne({ tenancy: tenancy._id });
    if (existingBranch) {
      console.log('✅ Branch already exists:', existingBranch.name);
      await mongoose.disconnect();
      return;
    }
    
    // Create a new branch
    const branch = await Branch.create({
      tenancy: tenancy._id,
      name: tenancy.name + ' - Main Branch',
      code: 'DGSFG001',
      address: {
        addressLine1: 'Main Street',
        city: 'Jaipur',
        state: 'Rajasthan',
        pincode: '302001'
      },
      contact: {
        phone: '9999999999',
        email: 'branch@dgsfg.com'
      },
      serviceAreas: [{
        pincode: '302001',
        deliveryCharge: 30,
        isActive: true
      }],
      operatingHours: {
        monday: { open: '09:00', close: '21:00', isOpen: true },
        tuesday: { open: '09:00', close: '21:00', isOpen: true },
        wednesday: { open: '09:00', close: '21:00', isOpen: true },
        thursday: { open: '09:00', close: '21:00', isOpen: true },
        friday: { open: '09:00', close: '21:00', isOpen: true },
        saturday: { open: '09:00', close: '21:00', isOpen: true },
        sunday: { open: '10:00', close: '18:00', isOpen: true }
      },
      isActive: true,
      createdBy: tenancy.owner // Use tenancy owner as creator
    });
    
    console.log('\n✅ Branch created:');
    console.log('  Name:', branch.name);
    console.log('  Code:', branch.code);
    console.log('  Tenancy:', tenancy.name);

    await mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createBranch();
