require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('./src/models/Ticket');
const User = require('./src/models/User');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  // Get latest ticket with user details
  const tickets = await Ticket.find({})
    .populate('raisedBy', 'name email tenancy')
    .sort({ createdAt: -1 });
  
  console.log('Tickets with user info:\n');
  for (const t of tickets) {
    console.log(`${t.ticketNumber}:`);
    console.log(`  Title: ${t.title}`);
    console.log(`  Raised by: ${t.raisedBy?.name} (${t.raisedBy?.email})`);
    console.log(`  User tenancy: ${t.raisedBy?.tenancy}`);
    console.log(`  Ticket tenancy: ${t.tenancy}`);
    console.log('');
  }

  // Check all customers
  console.log('\n--- All Customers ---');
  const customers = await User.find({ role: 'customer' }).select('name email tenancy');
  customers.forEach(c => {
    console.log(`${c.email}: tenancy=${c.tenancy}`);
  });

  await mongoose.disconnect();
}

check().catch(console.error);
