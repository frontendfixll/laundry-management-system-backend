// Load Sample Automation Rules Script
// This script loads sample automation rules into the database for testing

require('dotenv').config();
const mongoose = require('mongoose');
const AutomationRule = require('../models/AutomationRule');
const { samplePlatformRules, sampleTenantRules } = require('../seeders/sampleAutomationRules');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected for sample data loading');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Load sample rules
const loadSampleRules = async () => {
  try {
    console.log('🚀 Loading sample automation rules...');

    // Clear existing sample rules (optional)
    const existingRules = await AutomationRule.find({
      ruleId: { $in: [...samplePlatformRules.map(r => r.ruleId), ...sampleTenantRules.map(r => r.ruleId)] }
    });

    if (existingRules.length > 0) {
      console.log(`🗑️ Removing ${existingRules.length} existing sample rules...`);
      await AutomationRule.deleteMany({
        ruleId: { $in: existingRules.map(r => r.ruleId) }
      });
    }

    // Create a sample superadmin user ID (you should replace this with actual user ID)
    const sampleUserId = new mongoose.Types.ObjectId();

    // Load platform rules
    console.log('📋 Loading platform-level automation rules...');
    for (const rule of samplePlatformRules) {
      const ruleData = {
        ...rule,
        createdBy: sampleUserId,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const newRule = new AutomationRule(ruleData);
      await newRule.save();
      console.log(`  ✅ Loaded: ${rule.name}`);
    }

    // Load tenant rules (these will need tenantId when actual tenants exist)
    console.log('🏢 Loading tenant-level automation rules...');
    for (const rule of sampleTenantRules) {
      const ruleData = {
        ...rule,
        createdBy: sampleUserId,
        // Skip tenantId for now - these are template rules
        tenantId: null,
        scope: 'TENANT', // Keep scope but make tenantId optional for templates
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Temporarily modify the rule to not require tenantId for templates
      const tempRule = { ...ruleData };
      delete tempRule.tenantId; // Remove tenantId to avoid validation error
      tempRule.scope = 'PLATFORM'; // Temporarily set as platform for templates

      const newRule = new AutomationRule(tempRule);
      await newRule.save();
      console.log(`  ✅ Loaded: ${rule.name} (as template)`);
    }

    console.log('🎉 Sample automation rules loaded successfully!');
    console.log(`📊 Total rules loaded: ${samplePlatformRules.length + sampleTenantRules.length}`);
    console.log(`   - Platform rules: ${samplePlatformRules.length}`);
    console.log(`   - Tenant rules: ${sampleTenantRules.length}`);

  } catch (error) {
    console.error('❌ Error loading sample rules:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await loadSampleRules();
  
  console.log('✅ Sample data loading complete');
  process.exit(0);
};

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { loadSampleRules };