require('dotenv').config();
const mongoose = require('mongoose');

async function fixUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
    const Tenancy = mongoose.model('Tenancy', new mongoose.Schema({}, { strict: false }), 'tenancies');

    const tenancyId = '695904675b0c4cae7dc7611a';
    const newOwnerId = '695904e25b0c4cae7dc7632a'; // deepakthavrani72@gmail.com

    console.log('=== BEFORE UPDATE ===');
    
    // Show current state
    const tenancyBefore = await Tenancy.findById(tenancyId).lean();
    const userBefore = await User.findById(newOwnerId).lean();
    
    console.log('Tenancy Owner:', tenancyBefore.owner);
    console.log('User assignedBranch:', userBefore.assignedBranch);

    // Update tenancy owner
    await Tenancy.findByIdAndUpdate(tenancyId, {
      $set: { owner: new mongoose.Types.ObjectId(newOwnerId) }
    });
    console.log('\n✅ Updated tenancy.owner to deepakthavrani72@gmail.com');

    // Remove assignedBranch from user
    await User.findByIdAndUpdate(newOwnerId, {
      $unset: { assignedBranch: 1 }
    });
    console.log('✅ Removed assignedBranch from user');

    // Verify changes
    console.log('\n=== AFTER UPDATE ===');
    const tenancyAfter = await Tenancy.findById(tenancyId).lean();
    const userAfter = await User.findById(newOwnerId).lean();
    
    console.log('Tenancy Owner:', tenancyAfter.owner);
    console.log('User assignedBranch:', userAfter.assignedBranch || 'NONE (removed)');
    console.log('User tenancy:', userAfter.tenancy);

    console.log('\n✅ deepakthavrani72@gmail.com is now the TENANCY OWNER!');
    console.log('They can now login at: http://localhost:3001/auth/login');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

fixUser();
