require('dotenv').config();
const mongoose = require('mongoose');
const Branch = require('./src/models/Branch');

async function updateBranchCoordinates() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Update all branches with Jaipur coordinates (you can change these)
    const result = await Branch.updateMany(
      { coordinates: { $exists: false } },
      {
        $set: {
          coordinates: {
            latitude: 26.9124,  // Jaipur latitude
            longitude: 75.7873  // Jaipur longitude
          },
          serviceableRadius: 20
        }
      }
    );

    console.log(`Updated ${result.modifiedCount} branches with coordinates`);

    // Also update branches that have empty coordinates
    const result2 = await Branch.updateMany(
      { 
        $or: [
          { 'coordinates.latitude': null },
          { 'coordinates.latitude': { $exists: false } }
        ]
      },
      {
        $set: {
          coordinates: {
            latitude: 26.9124,
            longitude: 75.7873
          },
          serviceableRadius: 20
        }
      }
    );

    console.log(`Updated ${result2.modifiedCount} more branches`);

    // Show all branches
    const branches = await Branch.find({}).select('name code coordinates serviceableRadius');
    console.log('\nAll branches:');
    branches.forEach(b => {
      console.log(`- ${b.name} (${b.code}): lat=${b.coordinates?.latitude}, lng=${b.coordinates?.longitude}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateBranchCoordinates();
