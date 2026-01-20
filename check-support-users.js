const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./src/models/User');
const Tenancy = require('./src/models/Tenancy');
const Ticket = require('./src/models/Ticket');

async function checkSupportUsers() {
  try {
    console.log('👥 Checking support users...\n');
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Find all support users
    const supportUsers = await User.find({ role: 'support' })
      .populate('tenancy', 'name slug')
      .select('name email role tenancy isActive');
    
    console.log(`Found ${supportUsers.length} support users:`);
    
    if (supportUsers.length === 0) {
      console.log('❌ No support users found. Creating a test support user...');
      
      // Find a tenancy with tickets
      const tenancyWithTickets = await Ticket.findOne({})
        .populate('tenancy', 'name slug')
        .select('tenancy');
      
      if (tenancyWithTickets) {
        const testSupportUser = new User({
          name: 'Test Support Agent',
          email: 'support@example.com',
          phone: '9876543211',
          role: 'support',
          tenancy: tenancyWithTickets.tenancy._id,
          isActive: true,
          isEmailVerified: true,
          password: 'password123' // You should hash this in production
        });
        
        await testSupportUser.save();
        console.log(`✅ Created test support user in tenancy: ${tenancyWithTickets.tenancy.name}`);
      }
    } else {
      supportUsers.forEach((user, index) => {
        console.log(`${index + 1}. ${user.name} (${user.email})`);
        console.log(`   Tenancy: ${user.tenancy?.name || 'No tenancy assigned'}`);
        console.log(`   Active: ${user.isActive}`);
        console.log('');
      });
    }
    
    // Check tickets per tenancy
    console.log('🎫 Tickets per tenancy:');
    const ticketsByTenancy = await Ticket.aggregate([
      {
        $lookup: {
          from: 'tenancies',
          localField: 'tenancy',
          foreignField: '_id',
          as: 'tenancyInfo'
        }
      },
      {
        $group: {
          _id: '$tenancy',
          count: { $sum: 1 },
          tenancyName: { $first: '$tenancyInfo.name' }
        }
      }
    ]);
    
    ticketsByTenancy.forEach(stat => {
      console.log(`   ${stat.tenancyName}: ${stat.count} tickets`);
    });
    
    // Check if support users are in tenancies with tickets
    console.log('\n🔍 Support user tenancy analysis:');
    for (const supportUser of supportUsers) {
      if (supportUser.tenancy) {
        const ticketCount = await Ticket.countDocuments({ tenancy: supportUser.tenancy._id });
        console.log(`   ${supportUser.name}: ${ticketCount} tickets in their tenancy (${supportUser.tenancy.name})`);
      } else {
        console.log(`   ${supportUser.name}: No tenancy assigned`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking support users:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

checkSupportUsers();