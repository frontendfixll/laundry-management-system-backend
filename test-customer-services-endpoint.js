const Branch = require('./src/models/Branch');
require('dotenv').config();

// Connect to MongoDB
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry-management');

async function testCustomerServicesEndpoint() {
  try {
    console.log('🧪 Testing Customer Services Endpoint...\n');
    
    // Find the "rise" branch
    const riseBranch = await Branch.findOne({ 
      $or: [
        { name: { $regex: /rise/i } },
        { code: { $regex: /rise/i } }
      ]
    });
    
    if (!riseBranch) {
      console.log('❌ Branch not found');
      return;
    }
    
    console.log('🏢 Testing for branch:', riseBranch.name, `(${riseBranch.code})`);
    console.log('   Branch ID:', riseBranch._id);
    
    // Test the endpoint using fetch (simulate customer request)
    const API_URL = 'http://localhost:5000/api';
    
    console.log('\n📡 Testing GET /api/branches/{branchId}/services/enabled...');
    console.log(`   URL: ${API_URL}/branches/${riseBranch._id}/services/enabled`);
    
    try {
      const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
      const response = await fetch(`${API_URL}/branches/${riseBranch._id}/services/enabled`);
      
      console.log('📊 Response Status:', response.status);
      console.log('📊 Response Headers:', Object.fromEntries(response.headers.entries()));
      
      const responseText = await response.text();
      console.log('📊 Response Body:', responseText);
      
      if (response.ok) {
        const data = JSON.parse(responseText);
        console.log('\n✅ Endpoint working correctly!');
        console.log(`📋 Services found: ${data.data.services.length}`);
        data.data.services.forEach(service => {
          console.log(`   - ${service.displayName} (${service.category})`);
          console.log(`     Price: ${service.priceMultiplier}x`);
          console.log(`     Express: ${service.isExpressAvailable ? 'Yes' : 'No'}`);
        });
      } else {
        console.log('❌ Endpoint failed');
        console.log('Response:', responseText);
      }
    } catch (fetchError) {
      console.log('❌ Fetch error:', fetchError.message);
      console.log('💡 Make sure the backend server is running on port 5000');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    mongoose.connection.close();
  }
}

testCustomerServicesEndpoint();