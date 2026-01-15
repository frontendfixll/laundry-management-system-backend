const axios = require('axios');

// Test the nearby API endpoint
async function testNearbyAPI() {
  try {
    console.log('🧪 Testing nearby API endpoint...');
    
    // Test local server
    const localUrl = 'http://localhost:5000/api/public/tenancy/nearby';
    const params = {
      lat: 26.8633253,
      lng: 75.7737141,
      radius: 100,
      limit: 20
    };
    
    console.log(`📍 Testing: ${localUrl}`);
    console.log(`📊 Params:`, params);
    
    const response = await axios.get(localUrl, { params });
    
    console.log('✅ Success!');
    console.log('📄 Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('📄 Response:', error.response.data);
      console.error('🔢 Status:', error.response.status);
    }
  }
}

// Test production server
async function testProductionAPI() {
  try {
    console.log('\n🌐 Testing production API endpoint...');
    
    const prodUrl = 'https://LaundryLobby-backend-605c.onrender.com/api/public/tenancy/nearby';
    const params = {
      lat: 26.8633253,
      lng: 75.7737141,
      radius: 100,
      limit: 20
    };
    
    console.log(`📍 Testing: ${prodUrl}`);
    console.log(`📊 Params:`, params);
    
    const response = await axios.get(prodUrl, { params });
    
    console.log('✅ Production Success!');
    console.log('📄 Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Production Error:', error.message);
    if (error.response) {
      console.error('📄 Response:', error.response.data);
      console.error('🔢 Status:', error.response.status);
    }
  }
}

// Run tests
async function runTests() {
  await testNearbyAPI();
  await testProductionAPI();
}

runTests();