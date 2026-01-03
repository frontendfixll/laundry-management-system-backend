const mongoose = require('mongoose');
require('dotenv').config();

async function fixAnalyticsIndex() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('analytics');

    // List all indexes
    const indexes = await collection.indexes();
    console.log('Current indexes:', indexes.map(i => i.name));

    // Drop the problematic index if it exists
    const problematicIndexes = [
      'expansionAnalysis.analysisId_1',
      'analyticsId_1'
    ];

    for (const indexName of problematicIndexes) {
      try {
        await collection.dropIndex(indexName);
        console.log(`Dropped index: ${indexName}`);
      } catch (err) {
        if (err.code === 27) {
          console.log(`Index ${indexName} does not exist, skipping`);
        } else {
          console.log(`Error dropping ${indexName}:`, err.message);
        }
      }
    }

    // Recreate the analyticsId index with sparse option
    try {
      await collection.createIndex(
        { analyticsId: 1 },
        { unique: true, sparse: true }
      );
      console.log('Created sparse unique index on analyticsId');
    } catch (err) {
      console.log('Error creating analyticsId index:', err.message);
    }

    console.log('\nUpdated indexes:');
    const newIndexes = await collection.indexes();
    console.log(newIndexes.map(i => ({ name: i.name, key: i.key, sparse: i.sparse, unique: i.unique })));

    console.log('\nDone!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixAnalyticsIndex();
