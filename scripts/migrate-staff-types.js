/**
 * Migration Script: Dynamic Staff Types
 * 
 * This script:
 * 1. Creates default StaffType documents for each branch
 * 2. Links existing staff members to their StaffType by matching workerType name
 * 
 * Run: node scripts/migrate-staff-types.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const StaffType = require('../src/models/StaffType');
const User = require('../src/models/User');
const Branch = require('../src/models/Branch');

const WORKER_TYPE_TO_STAFF_TYPE = {
  'washer': 'Washer',
  'dry_cleaner': 'Dry Cleaner',
  'ironer': 'Ironer',
  'packer': 'Packer',
  'quality_checker': 'Quality Checker',
  'general': 'General'
};

async function migrate() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const stats = {
      branchesProcessed: 0,
      staffTypesCreated: 0,
      staffLinked: 0,
      errors: []
    };

    // Get all branches
    const branches = await Branch.find({});
    console.log(`Found ${branches.length} branches\n`);

    for (const branch of branches) {
      console.log(`Processing branch: ${branch.name} (${branch.code})`);
      
      // Check if branch already has staff types
      const existingTypes = await StaffType.countDocuments({ branch: branch._id });
      
      if (existingTypes === 0) {
        // Create default staff types for this branch
        try {
          const created = await StaffType.createDefaultsForBranch(branch._id);
          stats.staffTypesCreated += created.length || StaffType.DEFAULT_TYPES.length;
          console.log(`  ✓ Created ${StaffType.DEFAULT_TYPES.length} default staff types`);
        } catch (err) {
          console.log(`  ⚠ Staff types may already exist (${err.message})`);
        }
      } else {
        console.log(`  - Already has ${existingTypes} staff types`);
      }

      // Get all staff types for this branch (for linking)
      const staffTypes = await StaffType.find({ branch: branch._id });
      const staffTypeMap = {};
      staffTypes.forEach(st => {
        staffTypeMap[st.name.toLowerCase()] = st._id;
      });

      // Find staff in this branch without staffType linked
      const staffToUpdate = await User.find({
        assignedBranch: branch._id,
        role: 'staff',
        staffType: { $exists: false }
      });

      if (staffToUpdate.length > 0) {
        console.log(`  Linking ${staffToUpdate.length} staff members...`);
        
        for (const staff of staffToUpdate) {
          // Map workerType to StaffType name
          const staffTypeName = WORKER_TYPE_TO_STAFF_TYPE[staff.workerType] || 'General';
          const staffTypeId = staffTypeMap[staffTypeName.toLowerCase()];
          
          if (staffTypeId) {
            await User.updateOne(
              { _id: staff._id },
              { $set: { staffType: staffTypeId } }
            );
            stats.staffLinked++;
          } else {
            // Fallback to General
            const generalId = staffTypeMap['general'];
            if (generalId) {
              await User.updateOne(
                { _id: staff._id },
                { $set: { staffType: generalId } }
              );
              stats.staffLinked++;
            }
          }
        }
        console.log(`  ✓ Linked ${staffToUpdate.length} staff members`);
      }

      stats.branchesProcessed++;
    }

    // Also handle staff without a branch (edge case)
    const orphanStaff = await User.find({
      role: 'staff',
      assignedBranch: { $exists: true },
      staffType: { $exists: false }
    });

    if (orphanStaff.length > 0) {
      console.log(`\nFound ${orphanStaff.length} staff with branch but no staffType linked`);
      for (const staff of orphanStaff) {
        const staffTypes = await StaffType.find({ branch: staff.assignedBranch });
        if (staffTypes.length > 0) {
          const staffTypeName = WORKER_TYPE_TO_STAFF_TYPE[staff.workerType] || 'General';
          const match = staffTypes.find(st => st.name.toLowerCase() === staffTypeName.toLowerCase());
          const staffTypeId = match?._id || staffTypes.find(st => st.name === 'General')?._id;
          
          if (staffTypeId) {
            await User.updateOne({ _id: staff._id }, { $set: { staffType: staffTypeId } });
            stats.staffLinked++;
          }
        }
      }
    }

    // Summary
    console.log('\n========== MIGRATION SUMMARY ==========');
    console.log(`Branches processed: ${stats.branchesProcessed}`);
    console.log(`Staff types created: ${stats.staffTypesCreated}`);
    console.log(`Staff members linked: ${stats.staffLinked}`);
    
    if (stats.errors.length > 0) {
      console.log(`\nErrors (${stats.errors.length}):`);
      stats.errors.forEach(e => console.log(`  - ${e}`));
    }
    
    console.log('\n✓ Migration completed successfully');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

migrate();
