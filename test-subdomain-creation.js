#!/usr/bin/env node

/**
 * Test script for dynamic subdomain creation
 * Usage: node test-subdomain-creation.js <business-name>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const subdomainService = require('./src/services/subdomainService');

async function testSubdomainCreation() {
  try {
    const businessName = process.argv[2] || 'Test Laundry';
    
    console.log('🧪 Testing Dynamic Subdomain Creation');
    console.log('=====================================');
    console.log(`Business Name: ${businessName}`);
    console.log(`DNS Provider: ${process.env.DNS_PROVIDER || 'Not configured'}`);
    console.log(`Main Domain: ${process.env.MAIN_DOMAIN || 'Not configured'}`);
    console.log('');

    // Test 1: Generate unique subdomain
    console.log('📝 Step 1: Generating unique subdomain...');
    const subdomain = await subdomainService.generateUniqueSubdomain(businessName);
    console.log(`✅ Generated subdomain: ${subdomain}`);
    console.log('');

    // Test 2: Validate subdomain format
    console.log('📝 Step 2: Validating subdomain format...');
    const isValid = subdomainService.isValidSubdomain(subdomain);
    console.log(`✅ Subdomain format valid: ${isValid}`);
    console.log('');

    // Test 3: Check if subdomain exists
    console.log('📝 Step 3: Checking if subdomain already exists...');
    const exists = await subdomainService.checkSubdomainExists(subdomain);
    console.log(`✅ Subdomain exists: ${exists}`);
    console.log('');

    // Test 4: Create DNS record (only if DNS provider is configured)
    if (process.env.DNS_PROVIDER && process.env.MAIN_DOMAIN) {
      console.log('📝 Step 4: Creating DNS record...');
      
      if (!exists) {
        try {
          const result = await subdomainService.createSubdomain(subdomain, 'test-tenant-id');
          console.log('✅ DNS record created successfully:');
          console.log(`   - Subdomain: ${result.subdomain}`);
          console.log(`   - URL: ${result.url}`);
          console.log(`   - Record ID: ${result.recordId}`);
          console.log(`   - Provider: ${result.provider}`);
          console.log('');

          // Test 5: Verify subdomain (wait a bit for DNS propagation)
          console.log('📝 Step 5: Verifying subdomain (waiting 10 seconds for DNS propagation)...');
          setTimeout(async () => {
            try {
              const isWorking = await subdomainService.verifySubdomain(subdomain);
              console.log(`✅ Subdomain verification: ${isWorking ? 'Working' : 'Not working yet (DNS propagation may take time)'}`);
              
              // Cleanup: Delete the test record
              console.log('');
              console.log('🧹 Cleaning up: Deleting test DNS record...');
              await subdomainService.deleteSubdomain(subdomain, result.recordId);
              console.log('✅ Test DNS record deleted successfully');
              
              console.log('');
              console.log('🎉 All tests completed successfully!');
              process.exit(0);
            } catch (error) {
              console.error('❌ Verification or cleanup failed:', error.message);
              process.exit(1);
            }
          }, 10000);

        } catch (error) {
          console.error('❌ Failed to create DNS record:', error.message);
          console.log('');
          console.log('💡 Make sure you have configured:');
          console.log('   - DNS_PROVIDER (cloudflare/route53)');
          console.log('   - MAIN_DOMAIN (your domain name)');
          console.log('   - Provider-specific credentials (API tokens)');
          process.exit(1);
        }
      } else {
        console.log('⚠️ Subdomain already exists, skipping DNS creation test');
        console.log('');
        console.log('🎉 Tests completed (DNS creation skipped)!');
        process.exit(0);
      }
    } else {
      console.log('⚠️ DNS provider not configured, skipping DNS creation test');
      console.log('');
      console.log('💡 To test DNS creation, configure:');
      console.log('   - DNS_PROVIDER=cloudflare (or route53)');
      console.log('   - MAIN_DOMAIN=yourdomain.com');
      console.log('   - CLOUDFLARE_API_TOKEN=your-token (if using Cloudflare)');
      console.log('   - CLOUDFLARE_ZONE_ID=your-zone-id (if using Cloudflare)');
      console.log('');
      console.log('🎉 Basic tests completed successfully!');
      process.exit(0);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Test terminated');
  process.exit(0);
});

// Run the test
console.log('🚀 Starting subdomain creation test...\n');
testSubdomainCreation();