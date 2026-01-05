require('dotenv').config();
const mongoose = require('mongoose');
const Tenancy = require('./src/models/Tenancy');

async function updateTemplate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Find and update tenancy
    const tenancy = await Tenancy.findOne({ slug: 'dgsfg' });
    
    if (!tenancy) {
      console.log('Tenancy not found');
      return;
    }
    
    console.log('Before update:', tenancy.branding?.landingPageTemplate);
    
    // Update template to freshspin
    tenancy.branding.landingPageTemplate = 'freshspin';
    tenancy.markModified('branding');
    await tenancy.save();
    
    // Verify
    const updated = await Tenancy.findOne({ slug: 'dgsfg' });
    console.log('After update:', updated.branding?.landingPageTemplate);
    
    console.log('\n✅ Template updated to freshspin!');
    console.log('Now visit: http://localhost:3002/dgsfg');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

updateTemplate();
