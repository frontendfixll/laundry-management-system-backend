const mongoose = require('mongoose');
require('dotenv').config();

async function reassignLeads() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');
    
    const Lead = require('./src/models/Lead');
    const SalesUser = require('./src/models/SalesUser');
    
    // Find virat user
    const virat = await SalesUser.findOne({ email: 'virat@sales.com' });
    if (!virat) {
      console.log('❌ Virat user not found!');
      return;
    }
    
    console.log(`✅ Found Virat: ${virat._id}\n`);
    
    // Reassign all leads to virat
    const result = await Lead.updateMany(
      { assignedTo: { $ne: null } },
      { $set: { assignedTo: virat._id, assignedDate: new Date() } }
    );
    
    console.log(`✅ Reassigned ${result.modifiedCount} leads to Virat\n`);
    
    // Show updated leads
    const leads = await Lead.find({ assignedTo: virat._id }).select('businessName contactPerson.name status');
    console.log('📋 Leads now assigned to Virat:');
    leads.forEach(lead => {
      console.log(`  - ${lead.businessName} (${lead.status})`);
    });
    
    await mongoose.connection.close();
    console.log('\n✅ Done! Now login as virat@sales.com to see the leads');
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

reassignLeads();
