const mongoose = require('mongoose');

// Production MongoDB URI
const MONGODB_URI = 'mongodb+srv://deepakfixl2_db_user:mOo2gbQkQ2fseeeo@cluster0.ugk4dbe.mongodb.net/laundry-management-system';

async function testProductionDB() {
  console.log('🔍 Testing Production Database Connection...\n');
  
  try {
    // Connect to MongoDB
    console.log('⏳ Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    
    console.log('✅ Connected to MongoDB successfully!\n');
    
    // Test: Find the dgsfg tenant
    console.log('🔍 Searching for tenant "dgsfg"...');
    const Tenancy = mongoose.model('Tenancy', new mongoose.Schema({}, { strict: false }));
    
    const tenant = await Tenancy.findOne({
      $or: [
        { slug: /^dgsfg$/i },
        { subdomain: /^dgsfg$/i }
      ]
    });
    
    if (tenant) {
      console.log('✅ Tenant FOUND!');
      console.log('\nTenant Details:');
      console.log('  - Name:', tenant.name);
      console.log('  - Slug:', tenant.slug);
      console.log('  - Subdomain:', tenant.subdomain);
      console.log('  - Status:', tenant.status);
      console.log('  - ID:', tenant._id);
    } else {
      console.log('❌ Tenant NOT FOUND in this database!');
      console.log('\n📋 Listing all tenants in database...');
      
      const allTenants = await Tenancy.find({}).select('name slug subdomain status').limit(10);
      
      if (allTenants.length > 0) {
        console.log(`\nFound ${allTenants.length} tenant(s):`);
        allTenants.forEach((t, i) => {
          console.log(`  ${i + 1}. ${t.name} (slug: ${t.slug}, subdomain: ${t.subdomain}, status: ${t.status})`);
        });
      } else {
        console.log('  No tenants found in database!');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('Authentication failed')) {
      console.log('\n💡 Password might be incorrect!');
    } else if (error.message.includes('Could not connect')) {
      console.log('\n💡 Network issue or database not accessible!');
    }
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Connection closed');
  }
}

testProductionDB();
