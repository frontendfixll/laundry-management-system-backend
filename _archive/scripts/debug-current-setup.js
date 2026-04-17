const axios = require('axios');

async function debugCurrentSetup() {
  try {
    console.log('🔍 Debugging current setup...\n');
    
    // Test 1: Check if tenant exists in database
    console.log('1. Testing tenant verification API...');
    const apiResponse = await axios.get(
      'https://laundry-management-system-backend-1.onrender.com/api/tenants/verify/test-tenacy',
      { timeout: 10000 }
    );
    console.log('✅ Tenant exists in database:', apiResponse.data.success);
    console.log('   Tenant name:', apiResponse.data.data.name);
    console.log('   Subdomain:', apiResponse.data.data.subdomain);
    
    // Test 2: Check DNS resolution
    console.log('\n2. Testing DNS resolution...');
    try {
      const dnsResponse = await axios.get('https://test-tenacy.laundrylobby.com', {
        timeout: 5000,
        validateStatus: () => true // Accept any status
      });
      console.log('✅ DNS resolves, Status:', dnsResponse.status);
    } catch (dnsError) {
      if (dnsError.code === 'ENOTFOUND') {
        console.log('❌ DNS not resolving - domain not configured');
      } else if (dnsError.code === 'ECONNREFUSED') {
        console.log('❌ Connection refused - server not responding');
      } else {
        console.log('❌ DNS Error:', dnsError.message);
      }
    }
    
    // Test 3: Check main domain
    console.log('\n3. Testing main domain...');
    try {
      const mainResponse = await axios.get('https://laundrylobby.com', {
        timeout: 5000,
        validateStatus: () => true
      });
      console.log('✅ Main domain works, Status:', mainResponse.status);
    } catch (mainError) {
      console.log('❌ Main domain error:', mainError.message);
    }
    
    // Test 4: Check app subdomain
    console.log('\n4. Testing app subdomain...');
    try {
      const appResponse = await axios.get('https://app.laundrylobby.com', {
        timeout: 5000,
        validateStatus: () => true
      });
      console.log('✅ App subdomain works, Status:', appResponse.status);
    } catch (appError) {
      console.log('❌ App subdomain error:', appError.message);
    }
    
  } catch (error) {
    console.error('❌ Debug error:', error.message);
  }
}

debugCurrentSetup();