const mongoose = require('mongoose');
require('dotenv').config();

// Connect to test database before all tests
beforeAll(async () => {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry-test';
  
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }
});

// Close database connection after all tests
afterAll(async () => {
  await mongoose.connection.close();
});
