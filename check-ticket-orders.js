require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('./src/models/Ticket');
const Order = require('./src/models/Order');

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const tickets = await Ticket.find({}).populate('relatedOrder', 'orderNumber branch');
  
  console.log('Tickets with order info:\n');
  tickets.forEach(t => {
    console.log(`${t.ticketNumber}:`);
    console.log(`  Related Order: ${t.relatedOrder?.orderNumber || 'NONE'}`);
    console.log(`  Order Branch: ${t.relatedOrder?.branch || 'N/A'}`);
    console.log(`  Ticket Branch: ${t.branch}`);
    console.log('');
  });

  await mongoose.disconnect();
}

check().catch(console.error);
