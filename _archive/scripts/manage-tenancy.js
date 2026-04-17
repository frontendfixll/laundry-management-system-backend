#!/usr/bin/env node

/**
 * Tenancy Management Script
 * Usage: node manage-tenancy.js <command> [options]
 */

const mongoose = require('mongoose');
const Tenancy = require('./src/models/Tenancy');
const User = require('./src/models/User');
require('dotenv').config();

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`)
};

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    log.success('Connected to MongoDB');
  } catch (error) {
    log.error(`Database connection failed: ${error.message}`);
    process.exit(1);
  }
}

async function createTenancy(options) {
  const { name, subdomain, email, phone, primaryColor } = options;
  
  try {
    // Check if subdomain is available
    const existing = await Tenancy.findOne({ 
      $or: [{ subdomain }, { slug: subdomain }] 
    });
    
    if (existing) {
      log.error(`Subdomain '${subdomain}' is already taken`);
      return;
    }
    
    // Validate subdomain format
    if (!/^[a-z0-9-]+$/.test(subdomain)) {
      log.error('Subdomain can only contain lowercase letters, numbers, and hyphens');
      return;
    }
    
    // Reserved subdomains
    const reserved = ['api', 'admin', 'superadmin', 'www', 'mail', 'ftp'];
    if (reserved.includes(subdomain)) {
      log.error(`Subdomain '${subdomain}' is reserved`);
      return;
    }
    
    // Create owner user first
    const ownerUser = new User({
      name: name + ' Admin',
      email: email,
      phone: phone,
      password: 'temp123', // Will be reset on first login
      role: 'admin',
      isActive: true,
      mustChangePassword: true
    });
    
    await ownerUser.save();
    log.success(`Owner user created: ${email}`);
    
    // Create tenancy
    const tenancy = new Tenancy({
      name: name,
      slug: subdomain,
      subdomain: subdomain,
      description: `${name} - Professional laundry service`,
      owner: ownerUser._id,
      status: 'active',
      contact: {
        email: email,
        phone: phone
      },
      branding: {
        theme: {
          primaryColor: primaryColor || '#3B82F6',
          secondaryColor: '#10B981'
        }
      },
      subscription: {
        plan: 'basic',
        status: 'trial',
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      }
    });
    
    await tenancy.save();
    
    // Update user with tenancy reference
    ownerUser.tenancy = tenancy._id;
    await ownerUser.save();
    
    log.success(`Tenancy created successfully!`);
    log.info(`Portal URL: ${tenancy.portalUrl}`);
    log.info(`Admin Email: ${email}`);
    log.info(`Temporary Password: temp123 (must be changed on first login)`);
    log.info(`Trial expires: ${tenancy.subscription.trialEndsAt.toDateString()}`);
    
  } catch (error) {
    log.error(`Failed to create tenancy: ${error.message}`);
  }
}

async function listTenancies() {
  try {
    const tenancies = await Tenancy.find({ isDeleted: { $ne: true } })
      .populate('owner', 'name email')
      .sort({ createdAt: -1 });
    
    if (tenancies.length === 0) {
      log.info('No tenancies found');
      return;
    }
    
    console.log('\n📋 Tenancies List:\n');
    console.log('Name'.padEnd(25) + 'Subdomain'.padEnd(20) + 'Status'.padEnd(12) + 'Owner'.padEnd(25) + 'Created');
    console.log('─'.repeat(100));
    
    tenancies.forEach(t => {
      const name = (t.name || '').substring(0, 24).padEnd(25);
      const subdomain = (t.subdomain || '').substring(0, 19).padEnd(20);
      const status = t.status.padEnd(12);
      const owner = (t.owner?.name || 'Unknown').substring(0, 24).padEnd(25);
      const created = t.createdAt.toLocaleDateString();
      
      console.log(`${name}${subdomain}${status}${owner}${created}`);
    });
    
    console.log(`\nTotal: ${tenancies.length} tenancies`);
    
  } catch (error) {
    log.error(`Failed to list tenancies: ${error.message}`);
  }
}

async function checkSubdomain(subdomain) {
  try {
    const existing = await Tenancy.findOne({ 
      $or: [{ subdomain }, { slug: subdomain }] 
    });
    
    if (existing) {
      log.error(`Subdomain '${subdomain}' is already taken by: ${existing.name}`);
    } else {
      log.success(`Subdomain '${subdomain}' is available!`);
      log.info(`Portal URL would be: https://${subdomain}.laundry`);
    }
    
  } catch (error) {
    log.error(`Failed to check subdomain: ${error.message}`);
  }
}

async function updateTenancy(subdomain, updates) {
  try {
    const tenancy = await Tenancy.findOne({ subdomain });
    
    if (!tenancy) {
      log.error(`Tenancy with subdomain '${subdomain}' not found`);
      return;
    }
    
    Object.keys(updates).forEach(key => {
      if (key === 'primaryColor') {
        tenancy.branding.theme.primaryColor = updates[key];
      } else if (key === 'status') {
        tenancy.status = updates[key];
      } else {
        tenancy[key] = updates[key];
      }
    });
    
    await tenancy.save();
    log.success(`Tenancy '${subdomain}' updated successfully`);
    
  } catch (error) {
    log.error(`Failed to update tenancy: ${error.message}`);
  }
}

async function deleteTenancy(subdomain, confirm = false) {
  try {
    const tenancy = await Tenancy.findOne({ subdomain });
    
    if (!tenancy) {
      log.error(`Tenancy with subdomain '${subdomain}' not found`);
      return;
    }
    
    if (!confirm) {
      log.warn(`This will delete tenancy '${tenancy.name}' (${subdomain})`);
      log.warn('Add --confirm flag to proceed with deletion');
      return;
    }
    
    // Soft delete
    tenancy.isDeleted = true;
    tenancy.deletedAt = new Date();
    tenancy.status = 'inactive';
    await tenancy.save();
    
    log.success(`Tenancy '${subdomain}' deleted successfully`);
    
  } catch (error) {
    log.error(`Failed to delete tenancy: ${error.message}`);
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    console.log(`
🏪 Tenancy Management Tool

Usage: node manage-tenancy.js <command> [options]

Commands:
  create <name> <subdomain> <email> <phone> [primaryColor]
    Create a new tenancy
    
  list
    List all tenancies
    
  check <subdomain>
    Check if subdomain is available
    
  update <subdomain> <field=value> [field=value...]
    Update tenancy fields (status, name, primaryColor)
    
  delete <subdomain> [--confirm]
    Delete a tenancy (soft delete)

Examples:
  node manage-tenancy.js create "Quick Wash" quickwash admin@quickwash.com +919876543210
  node manage-tenancy.js list
  node manage-tenancy.js check speedyclean
  node manage-tenancy.js update quickwash status=inactive
  node manage-tenancy.js delete quickwash --confirm
    `);
    process.exit(0);
  }
  
  await connectDB();
  
  try {
    switch (command) {
      case 'create':
        if (args.length < 5) {
          log.error('Usage: create <name> <subdomain> <email> <phone> [primaryColor]');
          break;
        }
        await createTenancy({
          name: args[1],
          subdomain: args[2],
          email: args[3],
          phone: args[4],
          primaryColor: args[5]
        });
        break;
        
      case 'list':
        await listTenancies();
        break;
        
      case 'check':
        if (!args[1]) {
          log.error('Usage: check <subdomain>');
          break;
        }
        await checkSubdomain(args[1]);
        break;
        
      case 'update':
        if (args.length < 3) {
          log.error('Usage: update <subdomain> <field=value> [field=value...]');
          break;
        }
        const updates = {};
        args.slice(2).forEach(arg => {
          const [key, value] = arg.split('=');
          if (key && value) updates[key] = value;
        });
        await updateTenancy(args[1], updates);
        break;
        
      case 'delete':
        if (!args[1]) {
          log.error('Usage: delete <subdomain> [--confirm]');
          break;
        }
        await deleteTenancy(args[1], args.includes('--confirm'));
        break;
        
      default:
        log.error(`Unknown command: ${command}`);
    }
  } catch (error) {
    log.error(`Command failed: ${error.message}`);
  } finally {
    await mongoose.connection.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  createTenancy,
  listTenancies,
  checkSubdomain,
  updateTenancy,
  deleteTenancy
};