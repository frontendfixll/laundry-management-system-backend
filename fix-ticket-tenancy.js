require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('./src/models/Ticket');
const User = require('./src/models/User');

async function fixTickets() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  // Get all tickets without tenancy
  const tickets = await Ticket.find({ tenancy: null }).populate('raisedBy', 'tenancy email');
  
  console.log(`Found ${tickets.length} tickets without tenancy\n`);

  for (const ticket of tickets) {
    if (ticket.raisedBy?.tenancy) {
      console.log(`Updating ${ticket.ticketNumber}: setting tenancy from user ${ticket.raisedBy.email}`);
      ticket.tenancy = ticket.raisedBy.tenancy;
      await ticket.save();
    } else {
      console.log(`${ticket.ticketNumber}: User has no tenancy, skipping`);
    }
  }

  console.log('\nDone!');
  await mongoose.disconnect();
}

fixTickets().catch(console.error);
