const mongoose = require('mongoose');

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://deepakfixl2_db_user:sgr7QHS46sn36eEs@cluster0.ugk4dbe.mongodb.net/laundry-management-system?retryWrites=true&w=majority&serverSelectionTimeoutMS=30000&socketTimeoutMS=60000&connectTimeoutMS=30000';

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function cleanupOldAuditor() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    
    // Remove old auditor from Admin collection
    const result = await mongoose.connection.db.collection('admins').deleteOne({ email: 'auditor@gmail.com' });
    
    if (result.deletedCount > 0) {
      console.log('✅ Removed old auditor user from Admin collection');
    } else {
      console.log('ℹ️  No auditor user found in Admin collection to remove');
    }

    // Also remove old Platform Auditor role from Role collection if it exists
    const roleResult = await mongoose.connection.db.collection('roles').deleteOne({ slug: 'platform-auditor' });
    
    if (roleResult.deletedCount > 0) {
      console.log('✅ Removed old Platform Auditor role from Role collection');
    } else {
      console.log('ℹ️  No old Platform Auditor role found in Role collection to remove');
    }
    
    console.log('🧹 Cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the script
cleanupOldAuditor();