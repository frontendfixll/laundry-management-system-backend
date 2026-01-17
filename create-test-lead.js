const axios = require('axios');

// Sales user token (login first to get this)
const SALES_TOKEN = 'YOUR_TOKEN_HERE'; // Replace with actual token after login

async function createTestLead() {
  try {
    const response = await axios.post(
      'http://localhost:5000/api/sales/leads',
      {
        businessName: 'ABC Laundry Services',
        businessType: 'laundry',
        contactPerson: {
          name: 'John Doe',
          email: 'john@abclaundry.com',
          phone: '9876543210',
          designation: 'Owner'
        },
        address: {
          street: '123 Main Street',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001'
        },
        source: 'website',
        interestedPlan: 'pro',
        priority: 'high',
        estimatedRevenue: 50000,
        requirements: {
          numberOfBranches: 2,
          expectedOrders: 100,
          staffCount: 5,
          notes: 'Looking for a complete laundry management solution'
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${SALES_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Lead created successfully!');
    console.log('Lead ID:', response.data.data.lead._id);
    console.log('Business Name:', response.data.data.lead.businessName);
    console.log('\n📍 Open this URL:');
    console.log(`http://localhost:3005/leads/${response.data.data.lead._id}`);
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

// First, let's login to get the token
async function loginAndCreateLead() {
  try {
    // Step 1: Login
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post(
      'http://localhost:5000/api/sales/auth/login',
      {
        email: 'virat@sales.com',
        password: 'sales123'
      }
    );

    const token = loginResponse.data.data.token;
    console.log('✅ Login successful!');
    console.log('🔑 Token:', token.substring(0, 20) + '...\n');

    // Step 2: Create Lead
    console.log('📝 Creating test lead...');
    const leadResponse = await axios.post(
      'http://localhost:5000/api/sales/leads',
      {
        businessName: 'ABC Laundry Services',
        businessType: 'laundry',
        contactPerson: {
          name: 'John Doe',
          email: 'john@abclaundry.com',
          phone: '9876543210',
          designation: 'Owner'
        },
        address: {
          street: '123 Main Street',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001'
        },
        source: 'website',
        interestedPlan: 'pro',
        priority: 'high',
        estimatedRevenue: 50000,
        requirements: {
          numberOfBranches: 2,
          expectedOrders: 100,
          staffCount: 5,
          notes: 'Looking for a complete laundry management solution'
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Lead created successfully!');
    console.log('📊 Lead Details:');
    console.log('   ID:', leadResponse.data.data.lead._id);
    console.log('   Business:', leadResponse.data.data.lead.businessName);
    console.log('   Contact:', leadResponse.data.data.lead.contactPerson.name);
    console.log('   Score:', leadResponse.data.data.lead.score);
    console.log('\n🌐 Open in browser:');
    console.log(`   http://localhost:3005/leads/${leadResponse.data.data.lead._id}`);
    console.log('\n📋 Or view all leads:');
    console.log('   http://localhost:3005/leads');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

loginAndCreateLead();
