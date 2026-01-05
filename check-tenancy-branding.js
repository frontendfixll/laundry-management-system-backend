require('dotenv').config();
const mongoose = require('mongoose');
const Tenancy = require('./src/models/Tenancy');

async function checkBranding() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Find tenancy by slug
    const tenancy = await Tenancy.findOne({ slug: 'dgsfg' });
    
    if (!tenancy) {
      console.log('Tenancy not found with slug: dgsfg');
      
      // List all tenancies
      const all = await Tenancy.find({}, 'name slug subdomain branding.landingPageTemplate');
      console.log('\nAll tenancies:');
      all.forEach(t => {
        console.log(`- ${t.name} (slug: ${t.slug}, template: ${t.branding?.landingPageTemplate || 'not set'})`);
      });
    } else {
      console.log('\n=== Tenancy Found ===');
      console.log('Name:', tenancy.name);
      console.log('Slug:', tenancy.slug);
      console.log('Subdomain:', tenancy.subdomain);
      console.log('\n=== Branding ===');
      console.log('Landing Page Template:', tenancy.branding?.landingPageTemplate || 'NOT SET (default: original)');
      console.log('Primary Color:', tenancy.branding?.theme?.primaryColor);
      console.log('Logo URL:', tenancy.branding?.logo?.url ? 'SET (base64)' : 'NOT SET');
      console.log('\nFull branding object:');
      console.log(JSON.stringify({
        landingPageTemplate: tenancy.branding?.landingPageTemplate,
        theme: tenancy.branding?.theme,
        hasLogo: !!tenancy.branding?.logo?.url
      }, null, 2));
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

checkBranding();
