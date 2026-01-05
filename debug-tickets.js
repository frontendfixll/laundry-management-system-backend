require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('./src/models/Ticket');
const User = require('./src/models/User');

async function debug() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  // Check all tickets
  const allTickets = await Ticket.find({}).select('ticketNumber title tenancy raisedBy status');
  console.log('All Tickets in DB:', allTickets.length);
  allTickets.forEach(t => {
    console.log(`  - ${t.ticketNumber}: tenancy=${t.tenancy}, status=${t.status}`);
  });

  // Check admin user
  const admin = await User.findOne({ email: 'deepakthavrani72@gmail.com' });
  console.log('\nAdmin User:');
  console.log('  tenancy:', admin?.tenancy);

  // Check tickets with admin's tenancy
  if (admin?.tenancy) {
    const adminTickets = await Ticket.countDocuments({ tenancy: admin.tenancy });
    console.log(`\nTickets with admin's tenancy: ${adminTickets}`);
    
    const ticketsNoTenancy = await Ticket.countDocuments({ tenancy: null });
    console.log(`Tickets with null tenancy: ${ticketsNoTenancy}`);
  }

  await mongoose.disconnect();
}

debug().catch(console.error);
