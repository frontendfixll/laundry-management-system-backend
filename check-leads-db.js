/**
 * Check if leads exist in database
 * Run: node check-leads-db.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const Lead = require('./src/models/Lead');

async function checkLeads() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    console.log('📊 Database:', mongoose.connection.db.databaseName);
    console.log('');

    // Get all leads
    const leads = await Lead.find().sort({ createdAt: -1 }).limit(10);
    
    console.log(`📋 Total Leads in Database: ${await Lead.countDocuments()}`);
    console.log('');

    if (leads.length === 0) {
      console.log('❌ No leads found in database!');
      console.log('');
      console.log('💡 This means:');
      console.log('  1. Form submission might have failed');
      console.log('  2. Or leads are in a different database');
      console.log('  3. Check backend console for errors');
    } else {
      console.log('✅ Recent Leads:');
      console.log('');
      
      leads.forEach((lead, index) => {
        console.log(`${index + 1}. ${lead.businessName}`);
        console.log(`   ID: ${lead._id}`);
        console.log(`   Contact: ${lead.contactPerson.name} (${lead.contactPerson.email})`);
        console.log(`   Type: ${lead.businessType}`);
        console.log(`   Status: ${lead.status}`);
        console.log(`   Priority: ${lead.priority}`);
        console.log(`   Score: ${lead.score}`);
        console.log(`   Plan: ${lead.interestedPlan}`);
        console.log(`   Source: ${lead.source}`);
        console.log(`   Created: ${lead.createdAt}`);
        console.log(`   Assigned To: ${lead.assignedTo || 'Unassigned'}`);
        console.log('');
      });
    }

    // Check sales users
    const SalesUser = require('./src/models/SalesUser');
    const salesUsers = await SalesUser.find();
    
    console.log(`👥 Sales Users: ${salesUsers.length}`);
    if (salesUsers.length > 0) {
      salesUsers.forEach(user => {
        console.log(`  - ${user.name} (${user.email}) - Active: ${user.isActive}`);
      });
    } else {
      console.log('  ⚠️ No sales users found - leads will be unassigned');
    }

    await mongoose.connection.close();
    console.log('');
    console.log('✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkLeads();
