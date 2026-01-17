const mongoose = require('mongoose');
const Tenancy = require('./src/models/Tenancy');
const User = require('./src/models/User');
const bcrypt = require('bcryptjs');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/laundry-management', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function createSampleTenanciesWithUsers() {
  try {
    console.log('🔍 Creating sample users and tenancies...');
    
    // Clear existing sample data
    await Tenancy.deleteMany({ 'metadata.isSample': true });
    await User.deleteMany({ 'metadata.isSample': true });

    // Create sample users first
    const sampleUsers = [];
    const userNames = [
      { name: 'Rajesh Kumar', email: 'rajesh@cleanfresh.com', phone: '9876543210' },
      { name: 'Priya Sharma', email: 'priya@quickwash.com', phone: '9876543211' },
      { name: 'Amit Patel', email: 'amit@premiumdry.com', phone: '9876543212' },
      { name: 'Sunita Singh', email: 'sunita@expresslaundry.com', phone: '9876543213' },
      { name: 'Vikram Gupta', email: 'vikram@sparkleClean.com', phone: '9876543214' }
    ];

    const hashedPassword = await bcrypt.hash('password123', 10);

    for (const userData of userNames) {
      const user = new User({
        name: userData.name,
        email: userData.email,
        phone: userData.phone,
        password: hashedPassword,
        role: 'admin',
        isActive: true,
        metadata: {
          isSample: true
        }
      });
      
      const savedUser = await user.save();
      sampleUsers.push(savedUser);
      console.log(`✅ Created user: ${userData.name}`);
    }

    // Now create tenancies with owners
    const tenancyData = [
      {
        name: 'Clean & Fresh Laundry',
        slug: 'clean-fresh-laundry',
        subdomain: 'cleanfresh',
        status: 'active'
      },
      {
        name: 'Quick Wash Services',
        slug: 'quick-wash-services',
        subdomain: 'quickwash',
        status: 'active'
      },
      {
        name: 'Premium Dry Cleaners',
        slug: 'premium-dry-cleaners',
        subdomain: 'premiumdry',
        status: 'active'
      },
      {
        name: 'Express Laundromat',
        slug: 'express-laundromat',
        subdomain: 'expresslaundry',
        status: 'active'
      },
      {
        name: 'Sparkle Clean Co',
        slug: 'sparkle-clean-co',
        subdomain: 'sparkleClean',
        status: 'active'
      }
    ];

    const sampleTenancies = [];
    for (let i = 0; i < tenancyData.length; i++) {
      const tenancy = new Tenancy({
        ...tenancyData[i],
        owner: sampleUsers[i]._id,
        metadata: {
          isSample: true
        }
      });
      
      const savedTenancy = await tenancy.save();
      sampleTenancies.push(savedTenancy);
      console.log(`✅ Created tenancy: ${tenancyData[i].name}`);
    }

    console.log(`\n🎉 Created ${sampleUsers.length} users and ${sampleTenancies.length} tenancies successfully!`);
    
  } catch (error) {
    console.error('❌ Error creating sample data:', error);
  } finally {
    mongoose.connection.close();
  }
}

createSampleTenanciesWithUsers();