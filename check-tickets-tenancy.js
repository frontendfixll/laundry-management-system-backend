require('dotenv').config();
const mongoose = require('mongoose');

async function checkTickets() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const Ticket = require('./src/models/Ticket');
    const Tenancy = require('./src/models/Tenancy');
    const User = require('./src/models/User');

    // Get dgsfg tenancy
    const dgsfg = await Tenancy.findOne({ slug: 'dgsfg' });
    console.log('\n=== dgsfg Tenancy ===');
    console.log(`ID: ${dgsfg?._id}`);

    // Get all tickets
    const tickets = await Ticket.find({}).populate('raisedBy', 'name email').populate('tenancy', 'name slug');
    console.log('\n=== All Tickets ===');
    tickets.forEach(t => {
      console.log(`${t.ticketNumber}:`);
      console.log(`  - Title: ${t.title}`);
      console.log(`  - Raised by: ${t.raisedBy?.name} (${t.raisedBy?.email})`);
      console.log(`  - Tenancy: ${t.tenancy?.name || 'NULL'} (${t.tenancy?._id || 'no tenancy'})`);
      console.log(`  - Raw tenancy field: ${t.tenancy}`);
      console.log('');
    });

    // Count tickets with dgsfg tenancy
    if (dgsfg) {
      const dgsfgTickets = await Ticket.countDocuments({ tenancy: dgsfg._id });
      console.log(`\nTickets with dgsfg tenancy: ${dgsfgTickets}`);
      
      const nullTickets = await Ticket.countDocuments({ tenancy: null });
      console.log(`Tickets with null tenancy: ${nullTickets}`);
      
      const undefinedTickets = await Ticket.countDocuments({ tenancy: { $exists: false } });
      console.log(`Tickets without tenancy field: ${undefinedTickets}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkTickets();
