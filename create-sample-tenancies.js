const mongoose = require('mongoose');
const Tenancy = require('./src/models/Tenancy');
const User = require('./src/models/User');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/laundry-management', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function createSampleTenancies() {
  try {
    console.log('🔍 Creating sample tenancies...');
    
    // Clear existing sample tenancies
    await Tenancy.deleteMany({ 
      'metadata.isSample': true 
    });

    const sampleTenancies = [
      {
        name: 'Clean & Fresh Laundry',
        slug: 'clean-fresh-laundry',
        subdomain: 'cleanfresh',
        status: 'active',
        metadata: {
          isSample: true
        }
      },
      {
        name: 'Quick Wash Services',
        slug: 'quick-wash-services',
        subdomain: 'quickwash',
        status: 'active',
        metadata: {
          isSample: true
        }
      },
      {
        name: 'Premium Dry Cleaners',
        slug: 'premium-dry-cleaners',
        subdomain: 'premiumdry',
        status: 'active',
        metadata: {
          isSample: true
        }
      },
      {
        name: 'Express Laundromat',
        slug: 'express-laundromat',
        subdomain: 'expresslaundry',
        status: 'active',
        metadata: {
          isSample: true
        }
      },
      {
        name: 'Sparkle Clean Co',
        slug: 'sparkle-clean-co',
        subdomain: 'sparkleClean',
        status: 'trial',
        metadata: {
          isSample: true
        }
      }
    ];

    // Insert sample tenancies
    const insertedTenancies = await Tenancy.insertMany(sampleTenancies);
    
    console.log(`✅ Created ${insertedTenancies.length} sample tenancies`);
    
    insertedTenancies.forEach(tenancy => {
      console.log(`- ${tenancy.name} (${tenancy.status})`);
    });

    console.log('\n🎉 Sample tenancies created successfully!');
    
  } catch (error) {
    console.error('❌ Error creating sample tenancies:', error);
  } finally {
    mongoose.connection.close();
  }
}

createSampleTenancies();