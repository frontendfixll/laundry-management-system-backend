require('dotenv').config();
const mongoose = require('mongoose');
const Ticket = require('./src/models/Ticket');
const Order = require('./src/models/Order');

async function fixTickets() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  // Get the target tenancy and branch
  const tenancyId = '695904675b0c4cae7dc7611a';
  const branchId = '695953628896b6cc2b4ebf7c';

  // Get all tickets
  const tickets = await Ticket.find({});
  console.log(`Found ${tickets.length} tickets\n`);

  for (const ticket of tickets) {
    let updateData = {};
    
    // Set tenancy if not set
    if (!ticket.tenancy) {
      updateData.tenancy = tenancyId;
    }
    
    // Set branch from related order or default branch
    if (!ticket.branch) {
      if (ticket.relatedOrder) {
        const order = await Order.findById(ticket.relatedOrder);
        if (order?.branch) {
          updateData.branch = order.branch;
        } else {
          updateData.branch = branchId;
        }
      } else {
        updateData.branch = branchId;
      }
    }
    
    if (Object.keys(updateData).length > 0) {
      await Ticket.findByIdAndUpdate(ticket._id, updateData);
      console.log(`Updated ${ticket.ticketNumber}: tenancy=${updateData.tenancy || 'unchanged'}, branch=${updateData.branch || 'unchanged'}`);
    }
  }

  console.log('\nDone!');
  await mongoose.disconnect();
}

fixTickets().catch(console.error);
