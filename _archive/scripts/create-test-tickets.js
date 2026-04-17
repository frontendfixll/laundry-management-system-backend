const mongoose = require('mongoose');
require('dotenv').config();

const Ticket = require('./src/models/Ticket');
const User = require('./src/models/User');
const Tenancy = require('./src/models/Tenancy');

async function createTestTickets() {
  try {
    console.log('🎫 Creating test tickets...\n');
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Find a customer and tenancy
    const customer = await User.findOne({ role: 'customer' }).populate('tenancy');
    const tenancy = await Tenancy.findOne({});
    
    if (!customer) {
      console.log('❌ No customer found. Creating a test customer...');
      
      const testCustomer = new User({
        name: 'Test Customer',
        email: 'testcustomer@example.com',
        phone: '9876543210',
        role: 'customer',
        tenancy: tenancy._id,
        isActive: true,
        isEmailVerified: true
      });
      
      await testCustomer.save();
      console.log('✅ Created test customer');
    }
    
    const finalCustomer = customer || await User.findOne({ role: 'customer' });
    const finalTenancy = finalCustomer.tenancy || tenancy;
    
    // Create test tickets
    const testTickets = [
      {
        title: 'Order Delivery Delayed',
        description: 'My laundry order was supposed to be delivered yesterday but I haven\'t received it yet. Order number: ORD123456',
        category: 'delay',
        priority: 'high',
        status: 'open',
        raisedBy: finalCustomer._id,
        tenancy: finalTenancy._id,
        messages: [{
          sender: finalCustomer._id,
          message: 'My order is delayed. Please help!',
          isInternal: false,
          timestamp: new Date()
        }]
      },
      {
        title: 'Missing Item from Order',
        description: 'One of my shirts is missing from the delivered order. It was a blue formal shirt.',
        category: 'missing_item',
        priority: 'medium',
        status: 'open',
        raisedBy: finalCustomer._id,
        tenancy: finalTenancy._id,
        messages: [{
          sender: finalCustomer._id,
          message: 'My blue shirt is missing from the order.',
          isInternal: false,
          timestamp: new Date()
        }]
      },
      {
        title: 'Quality Issue with Cleaning',
        description: 'The stains on my white shirt were not properly removed. I need it to be cleaned again.',
        category: 'quality',
        priority: 'medium',
        status: 'open',
        raisedBy: finalCustomer._id,
        tenancy: finalTenancy._id,
        messages: [{
          sender: finalCustomer._id,
          message: 'The cleaning quality is not satisfactory.',
          isInternal: false,
          timestamp: new Date()
        }]
      },
      {
        title: 'Payment Issue',
        description: 'I was charged twice for the same order. Please refund the duplicate payment.',
        category: 'payment',
        priority: 'high',
        status: 'open',
        raisedBy: finalCustomer._id,
        tenancy: finalTenancy._id,
        messages: [{
          sender: finalCustomer._id,
          message: 'Double payment charged. Need refund.',
          isInternal: false,
          timestamp: new Date()
        }]
      }
    ];
    
    // Check if tickets already exist
    const existingTickets = await Ticket.countDocuments({ tenancy: finalTenancy._id });
    
    if (existingTickets > 0) {
      console.log(`⚠️  Found ${existingTickets} existing tickets. Skipping creation.`);
    } else {
      console.log('📝 Creating test tickets...');
      
      for (let i = 0; i < testTickets.length; i++) {
        const ticketData = testTickets[i];
        const ticket = new Ticket(ticketData);
        await ticket.save();
        console.log(`✅ Created ticket: ${ticket.ticketNumber} - ${ticket.title}`);
      }
    }
    
    // Show summary
    const totalTickets = await Ticket.countDocuments({ tenancy: finalTenancy._id });
    console.log(`\n📊 Summary:`);
    console.log(`   Tenancy: ${finalTenancy.name}`);
    console.log(`   Customer: ${finalCustomer.name} (${finalCustomer.email})`);
    console.log(`   Total tickets: ${totalTickets}`);
    
    // Show tickets by status
    const ticketsByStatus = await Ticket.aggregate([
      { $match: { tenancy: finalTenancy._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    console.log(`   Tickets by status:`);
    ticketsByStatus.forEach(stat => {
      console.log(`     ${stat._id}: ${stat.count}`);
    });
    
    console.log('\n🎉 Test tickets created successfully!');
    console.log('💡 Now support users should be able to see these tickets in their dashboard.');
    
  } catch (error) {
    console.error('❌ Error creating test tickets:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
  }
}

createTestTickets();