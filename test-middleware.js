/**
 * Test if middleware is working
 * Run: node test-middleware.js
 * Then call: curl http://localhost:5000/api/test-tenancy -H "Authorization: Bearer YOUR_TOKEN"
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { protect } = require('./src/middlewares/auth');
const { injectTenancyFromUser } = require('./src/middlewares/tenancyMiddleware');

const app = express();

// Test endpoint
app.get('/api/test-tenancy', protect, injectTenancyFromUser, (req, res) => {
  console.log('\n=== TEST ENDPOINT ===');
  console.log('req.user:', req.user?.email);
  console.log('req.user.tenancy:', req.user?.tenancy);
  console.log('req.tenancyId:', req.tenancyId);
  console.log('req.tenancy:', req.tenancy?.name);
  console.log('=====================\n');
  
  res.json({
    success: true,
    data: {
      userEmail: req.user?.email,
      userTenancy: req.user?.tenancy,
      reqTenancyId: req.tenancyId,
      reqTenancyName: req.tenancy?.name
    }
  });
});

mongoose.connect(process.env.MONGODB_URI).then(() => {
  console.log('MongoDB connected');
  app.listen(5001, () => {
    console.log('Test server running on port 5001');
    console.log('Test with: curl http://localhost:5001/api/test-tenancy -H "Authorization: Bearer YOUR_TOKEN"');
  });
});
