const mongoose = require('mongoose');
const AddOn = require('../models/AddOn');
const SuperAdmin = require('../models/SuperAdmin');

const sampleAddOns = [
  // Capacity Add-ons
  {
    name: 'extra-branch',
    displayName: 'Extra Branch',
    description: 'Add one additional branch to your laundry business. Perfect for expanding your operations.',
    shortDescription: 'Add 1 more branch location',
    category: 'capacity',
    subcategory: 'locations',
    tags: ['branch', 'location', 'expansion'],
    pricing: {
      monthly: 499,
      yearly: 4990,
      regional: new Map([
        ['US', { monthly: 15, yearly: 150, currency: 'USD' }],
        ['GB', { monthly: 12, yearly: 120, currency: 'GBP' }]
      ])
    },
    billingCycle: 'monthly',
    config: {
      capacity: {
        feature: 'max_branches',
        increment: 1,
        unit: 'branches'
      }
    },
    eligibility: {
      plans: ['basic', 'standard', 'premium'],
      requiredFeatures: ['multi_branch']
    },
    icon: 'building',
    color: '#3B82F6',
    benefits: [
      'Manage multiple locations from one dashboard',
      'Location-specific reporting and analytics',
      'Staff assignment per branch',
      'Branch-wise inventory management'
    ],
    features: [
      'Unlimited orders per branch',
      'Branch-specific pricing',
      'Location-based customer management',
      'Branch performance analytics'
    ],
    useCases: [
      'Expanding to new neighborhoods',
      'Managing franchise locations',
      'Separate commercial and residential services'
    ],
    status: 'active',
    isPopular: true,
    showOnMarketplace: true,
    showOnPricingPage: true,
    sortOrder: 1,
    seo: {
      title: 'Extra Branch Add-on - Expand Your Laundry Business',
      description: 'Add additional branch locations to your laundry management system. Manage multiple locations from one dashboard.',
      keywords: ['branch', 'location', 'expansion', 'multi-location']
    }
  },

  {
    name: 'extra-staff',
    displayName: 'Extra Staff Pack',
    description: 'Add 5 additional staff members to your team. Includes role-based permissions and staff management tools.',
    shortDescription: 'Add 5 more staff members',
    category: 'capacity',
    subcategory: 'users',
    tags: ['staff', 'users', 'team'],
    pricing: {
      monthly: 299,
      yearly: 2990
    },
    billingCycle: 'monthly',
    config: {
      capacity: {
        feature: 'max_staff',
        increment: 5,
        unit: 'users'
      }
    },
    eligibility: {
      plans: ['standard', 'premium', 'enterprise']
    },
    icon: 'users',
    color: '#10B981',
    benefits: [
      'Role-based access control',
      'Staff performance tracking',
      'Shift management',
      'Commission calculations'
    ],
    features: [
      '5 additional staff accounts',
      'Custom role permissions',
      'Staff activity logs',
      'Performance analytics'
    ],
    status: 'active',
    showOnMarketplace: true,
    sortOrder: 2
  },

  // Feature Add-ons
  {
    name: 'campaigns-module',
    displayName: 'Campaigns & Marketing',
    description: 'Unlock powerful marketing tools including campaigns, coupons, banners, and customer engagement features.',
    shortDescription: 'Complete marketing toolkit',
    category: 'feature',
    subcategory: 'marketing',
    tags: ['campaigns', 'marketing', 'coupons', 'banners'],
    pricing: {
      monthly: 799,
      yearly: 7990
    },
    billingCycle: 'monthly',
    config: {
      features: [
        { key: 'campaigns', value: true },
        { key: 'coupons', value: true },
        { key: 'banners', value: true },
        { key: 'email_marketing', value: true },
        { key: 'customer_segments', value: true }
      ]
    },
    eligibility: {
      plans: ['standard', 'premium', 'enterprise'],
      minUsage: {
        feature: 'total_customers',
        threshold: 50
      }
    },
    icon: 'target',
    color: '#F59E0B',
    benefits: [
      'Increase customer retention by 40%',
      'Automated marketing campaigns',
      'Targeted customer segments',
      'Professional banner designs'
    ],
    features: [
      'Campaign builder with templates',
      'Coupon code generation',
      'Banner management system',
      'Email marketing automation',
      'Customer segmentation',
      'A/B testing for campaigns'
    ],
    useCases: [
      'Seasonal promotions and discounts',
      'Customer win-back campaigns',
      'New customer acquisition',
      'Loyalty program marketing'
    ],
    status: 'active',
    isPopular: true,
    isFeatured: true,
    showOnMarketplace: true,
    showOnPricingPage: true,
    trialDays: 14,
    sortOrder: 3,
    seo: {
      title: 'Marketing Campaigns Add-on - Grow Your Customer Base',
      description: 'Complete marketing toolkit with campaigns, coupons, banners and email marketing for your laundry business.',
      keywords: ['marketing', 'campaigns', 'coupons', 'customer retention']
    }
  },

  {
    name: 'loyalty-rewards',
    displayName: 'Loyalty & Rewards Program',
    description: 'Build customer loyalty with points, rewards, referrals, and gamification features.',
    shortDescription: 'Customer loyalty system',
    category: 'feature',
    subcategory: 'loyalty',
    tags: ['loyalty', 'rewards', 'points', 'referrals'],
    pricing: {
      monthly: 599,
      yearly: 5990
    },
    billingCycle: 'monthly',
    config: {
      features: [
        { key: 'loyalty_points', value: true },
        { key: 'referral_program', value: true },
        { key: 'reward_tiers', value: true },
        { key: 'gamification', value: true }
      ]
    },
    eligibility: {
      plans: ['basic', 'standard', 'premium', 'enterprise']
    },
    icon: 'star',
    color: '#8B5CF6',
    benefits: [
      'Increase repeat customers by 60%',
      'Automated referral tracking',
      'Customizable reward tiers',
      'Gamified customer experience'
    ],
    features: [
      'Points-based reward system',
      'Referral program with bonuses',
      'Tier-based customer levels',
      'Reward redemption management',
      'Loyalty analytics dashboard'
    ],
    status: 'active',
    showOnMarketplace: true,
    trialDays: 7,
    sortOrder: 4
  },

  // Usage Add-ons
  {
    name: 'sms-credits-1000',
    displayName: 'SMS Credits Pack (1000)',
    description: 'Send 1000 SMS notifications to customers for order updates, promotions, and reminders.',
    shortDescription: '1000 SMS notifications',
    category: 'usage',
    subcategory: 'communications',
    tags: ['sms', 'notifications', 'communications'],
    pricing: {
      oneTime: 300
    },
    billingCycle: 'usage-based',
    config: {
      usage: {
        type: 'credits',
        amount: 1000,
        unit: 'sms',
        autoRenew: false,
        lowBalanceThreshold: 50
      }
    },
    eligibility: {
      plans: ['basic', 'standard', 'premium', 'enterprise']
    },
    icon: 'message-square',
    color: '#06B6D4',
    benefits: [
      'Real-time order notifications',
      'Promotional SMS campaigns',
      'Payment reminders',
      'Delivery confirmations'
    ],
    features: [
      '1000 SMS credits',
      'Automated notifications',
      'Custom message templates',
      'Delivery reports',
      'Low balance alerts'
    ],
    status: 'active',
    showOnMarketplace: true,
    maxQuantity: 10,
    sortOrder: 5
  },

  {
    name: 'whatsapp-notifications',
    displayName: 'WhatsApp Business Notifications',
    description: 'Send rich WhatsApp messages with images, order details, and interactive buttons.',
    shortDescription: 'WhatsApp messaging',
    category: 'usage',
    subcategory: 'communications',
    tags: ['whatsapp', 'messaging', 'rich-media'],
    pricing: {
      monthly: 199,
      yearly: 1990
    },
    billingCycle: 'monthly',
    config: {
      usage: {
        type: 'quota',
        amount: 500,
        unit: 'whatsapp_messages',
        autoRenew: true
      },
      features: [
        { key: 'whatsapp_integration', value: true },
        { key: 'rich_messaging', value: true }
      ]
    },
    eligibility: {
      plans: ['standard', 'premium', 'enterprise']
    },
    icon: 'message-circle',
    color: '#25D366',
    benefits: [
      'Higher engagement than SMS',
      'Rich media support',
      'Interactive buttons',
      'Read receipts'
    ],
    features: [
      '500 WhatsApp messages/month',
      'Image and document sharing',
      'Interactive buttons',
      'Message templates',
      'Delivery analytics'
    ],
    status: 'active',
    showOnMarketplace: true,
    sortOrder: 6
  },

  // Integration Add-ons
  {
    name: 'api-access',
    displayName: 'API Access & Integrations',
    description: 'Connect with third-party systems, POS, accounting software, and build custom integrations.',
    shortDescription: 'API and integrations',
    category: 'integration',
    subcategory: 'api',
    tags: ['api', 'integrations', 'pos', 'accounting'],
    pricing: {
      monthly: 1999,
      yearly: 19990
    },
    billingCycle: 'monthly',
    config: {
      features: [
        { key: 'api_access', value: true },
        { key: 'webhooks', value: true },
        { key: 'custom_integrations', value: true }
      ],
      integrations: [
        {
          service: 'rest_api',
          endpoints: ['orders', 'customers', 'payments', 'inventory'],
          rateLimit: 1000
        },
        {
          service: 'webhooks',
          endpoints: ['order_events', 'payment_events'],
          rateLimit: 100
        }
      ]
    },
    eligibility: {
      plans: ['premium', 'enterprise'],
      minUsage: {
        feature: 'monthly_orders',
        threshold: 100
      }
    },
    icon: 'code',
    color: '#6366F1',
    benefits: [
      'Connect with existing systems',
      'Automate business processes',
      'Custom app development',
      'Real-time data sync'
    ],
    features: [
      'Full REST API access',
      'Webhook notifications',
      'API documentation',
      'Rate limiting: 1000 req/min',
      'Developer support'
    ],
    status: 'active',
    showOnMarketplace: true,
    sortOrder: 7
  },

  // Branding Add-ons
  {
    name: 'custom-domain',
    displayName: 'Custom Domain & White Label',
    description: 'Use your own domain name and remove LaundryLobby branding for a professional appearance.',
    shortDescription: 'Your domain, your brand',
    category: 'branding',
    subcategory: 'domain',
    tags: ['domain', 'branding', 'white-label'],
    pricing: {
      yearly: 2999
    },
    billingCycle: 'yearly',
    config: {
      branding: {
        customDomain: true,
        whiteLabel: true,
        customThemes: 3,
        logoUpload: true
      },
      features: [
        { key: 'custom_domain', value: true },
        { key: 'white_label', value: true },
        { key: 'custom_branding', value: true }
      ]
    },
    eligibility: {
      plans: ['premium', 'enterprise']
    },
    icon: 'globe',
    color: '#EC4899',
    benefits: [
      'Professional brand image',
      'Improved customer trust',
      'Better SEO rankings',
      'Complete brand control'
    ],
    features: [
      'Custom domain setup',
      'SSL certificate included',
      'Remove LaundryLobby branding',
      'Custom logo and colors',
      'Professional email addresses'
    ],
    status: 'active',
    showOnMarketplace: true,
    sortOrder: 8
  },

  // Support Add-ons
  {
    name: 'priority-support',
    displayName: 'Priority Support & Training',
    description: 'Get priority support with faster response times, dedicated account manager, and staff training.',
    shortDescription: 'Premium support experience',
    category: 'support',
    subcategory: 'premium',
    tags: ['support', 'training', 'priority'],
    pricing: {
      monthly: 999,
      yearly: 9990
    },
    billingCycle: 'monthly',
    config: {
      support: {
        priority: 'premium',
        responseTime: '2h',
        channels: ['email', 'chat', 'phone', 'video'],
        dedicatedManager: true
      },
      features: [
        { key: 'priority_support', value: true },
        { key: 'phone_support', value: true },
        { key: 'video_training', value: true }
      ]
    },
    eligibility: {
      plans: ['premium', 'enterprise']
    },
    icon: 'headphones',
    color: '#F97316',
    benefits: [
      '2-hour response time',
      'Dedicated account manager',
      'Phone and video support',
      'Staff training sessions'
    ],
    features: [
      'Priority ticket handling',
      'Phone support during business hours',
      'Monthly video training sessions',
      'Dedicated account manager',
      'Custom onboarding'
    ],
    status: 'active',
    showOnMarketplace: true,
    sortOrder: 9
  }
];

/**
 * Seed add-ons data
 */
const seedAddOns = async () => {
  try {
    console.log('🌱 Starting add-ons seeding...');

    // Check if add-ons already exist
    const existingCount = await AddOn.countDocuments();
    if (existingCount > 0) {
      console.log(`ℹ️ Found ${existingCount} existing add-ons. Skipping seeding.`);
      return;
    }

    // Get or create a super admin for createdBy field
    let superAdmin = await SuperAdmin.findOne();
    if (!superAdmin) {
      superAdmin = new SuperAdmin({
        name: 'System Admin',
        email: 'admin@laundrylobby.com',
        password: 'temp_password',
        role: 'super_admin',
        isActive: true
      });
      await superAdmin.save();
      console.log('📝 Created system super admin for seeding');
    }

    // Add createdBy to each add-on
    const addOnsWithCreator = sampleAddOns.map(addOn => ({
      ...addOn,
      createdBy: superAdmin._id,
      version: '1.0.0',
      changelog: [{
        version: '1.0.0',
        changes: ['Initial release'],
        date: new Date()
      }]
    }));

    // Insert add-ons
    const insertedAddOns = await AddOn.insertMany(addOnsWithCreator);
    console.log(`✅ Successfully seeded ${insertedAddOns.length} add-ons`);

    // Log summary by category
    const categorySummary = {};
    insertedAddOns.forEach(addOn => {
      categorySummary[addOn.category] = (categorySummary[addOn.category] || 0) + 1;
    });

    console.log('📊 Add-ons by category:');
    Object.entries(categorySummary).forEach(([category, count]) => {
      console.log(`   ${category}: ${count} add-ons`);
    });

    return insertedAddOns;
  } catch (error) {
    console.error('❌ Error seeding add-ons:', error);
    throw error;
  }
};

/**
 * Clear all add-ons (for development)
 */
const clearAddOns = async () => {
  try {
    console.log('🗑️ Clearing all add-ons...');
    const result = await AddOn.deleteMany({});
    console.log(`✅ Cleared ${result.deletedCount} add-ons`);
    return result;
  } catch (error) {
    console.error('❌ Error clearing add-ons:', error);
    throw error;
  }
};

/**
 * Update existing add-ons with new fields (for migrations)
 */
const updateAddOns = async () => {
  try {
    console.log('🔄 Updating existing add-ons...');
    
    // Add any missing fields to existing add-ons
    const updates = await AddOn.updateMany(
      { version: { $exists: false } },
      {
        $set: {
          version: '1.0.0',
          changelog: [{
            version: '1.0.0',
            changes: ['Initial version'],
            date: new Date()
          }]
        }
      }
    );

    console.log(`✅ Updated ${updates.modifiedCount} add-ons`);
    return updates;
  } catch (error) {
    console.error('❌ Error updating add-ons:', error);
    throw error;
  }
};

// Export functions
module.exports = {
  seedAddOns,
  clearAddOns,
  updateAddOns,
  sampleAddOns
};

// Run seeder if called directly
if (require.main === module) {
  const mongoose = require('mongoose');
  const { MONGODB_URI } = process.env;

  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI environment variable is required');
    process.exit(1);
  }

  mongoose.connect(MONGODB_URI)
    .then(async () => {
      console.log('📦 Connected to MongoDB');
      
      const command = process.argv[2];
      
      switch (command) {
        case 'clear':
          await clearAddOns();
          break;
        case 'update':
          await updateAddOns();
          break;
        case 'seed':
        default:
          await seedAddOns();
          break;
      }
      
      await mongoose.disconnect();
      console.log('👋 Disconnected from MongoDB');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ MongoDB connection error:', error);
      process.exit(1);
    });
}