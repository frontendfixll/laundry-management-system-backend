const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/laundry-management');
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// Add-on Schema (matching backend model)
const addOnSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  description: { type: String, required: true },
  shortDescription: { type: String },
  category: {
    type: String,
    enum: ['capacity', 'feature', 'usage', 'branding', 'integration', 'support'],
    required: true
  },
  subcategory: { type: String },
  tags: [{ type: String }],
  pricing: {
    monthly: { type: Number, default: 0 },
    yearly: { type: Number, default: 0 },
    oneTime: { type: Number, default: 0 }
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly', 'one-time', 'usage-based'],
    required: true
  },
  config: {
    capacity: {
      feature: { type: String },
      increment: { type: Number },
      unit: { type: String }
    },
    features: [{
      key: { type: String },
      value: { type: mongoose.Schema.Types.Mixed }
    }],
    usage: {
      type: { type: String, enum: ['credits', 'quota', 'allowance'] },
      amount: { type: Number },
      unit: { type: String },
      autoRenew: { type: Boolean, default: false },
      lowBalanceThreshold: { type: Number, default: 10 }
    }
  },
  icon: { type: String, default: 'package' },
  color: { type: String, default: '#3B82F6' },
  benefits: [{ type: String }],
  features: [{ type: String }],
  useCases: [{ type: String }],
  status: {
    type: String,
    enum: ['draft', 'active', 'hidden', 'deprecated'],
    default: 'active'
  },
  isPopular: { type: Boolean, default: false },
  isRecommended: { type: Boolean, default: false },
  isFeatured: { type: Boolean, default: false },
  showOnMarketplace: { type: Boolean, default: true },
  showOnPricingPage: { type: Boolean, default: false },
  sortOrder: { type: Number, default: 0 },
  trialDays: { type: Number, default: 0 },
  maxQuantity: { type: Number, default: 1 },
  analytics: {
    views: { type: Number, default: 0 },
    purchases: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 }
  },
  version: { type: String, default: '1.0.0' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'SuperAdmin' },
  isDeleted: { type: Boolean, default: false }
}, {
  timestamps: true
});

const AddOn = mongoose.model('AddOn', addOnSchema);

// Sample Add-ons Data
const sampleAddOns = [
  {
    name: 'extra-branch',
    slug: 'extra-branch',
    displayName: 'Extra Branch',
    description: 'Add additional branch locations to expand your business reach and manage multiple locations from a single dashboard.',
    shortDescription: 'Expand with additional branches',
    category: 'capacity',
    subcategory: 'locations',
    tags: ['branch', 'location', 'expansion', 'multi-location'],
    pricing: {
      monthly: 499,
      yearly: 4990
    },
    billingCycle: 'monthly',
    config: {
      capacity: {
        feature: 'max_branches',
        increment: 1,
        unit: 'branches'
      }
    },
    icon: 'building',
    color: '#3B82F6',
    benefits: [
      'Scale your business across multiple locations',
      'Centralized management dashboard',
      'Unified reporting and analytics',
      'Branch-wise performance tracking'
    ],
    features: [
      'Multi-location management',
      'Centralized dashboard',
      'Branch-wise analytics',
      'Staff management per branch',
      'Location-based pricing'
    ],
    useCases: [
      'Chain expansion',
      'Franchise management',
      'Multi-city operations',
      'Regional business growth'
    ],
    status: 'active',
    isPopular: true,
    isRecommended: false,
    isFeatured: true,
    showOnMarketplace: true,
    trialDays: 7,
    maxQuantity: 10,
    sortOrder: 1
  },
  {
    name: 'campaign-manager',
    slug: 'campaign-manager',
    displayName: 'Campaign Manager',
    description: 'Create and manage promotional campaigns, discount coupons, and email marketing to boost customer engagement and sales.',
    shortDescription: 'Advanced marketing campaigns',
    category: 'feature',
    subcategory: 'marketing',
    tags: ['campaigns', 'marketing', 'promotions', 'coupons', 'email'],
    pricing: {
      monthly: 799,
      yearly: 7990
    },
    billingCycle: 'monthly',
    config: {
      features: [
        { key: 'campaigns', value: true },
        { key: 'coupons', value: true },
        { key: 'email_marketing', value: true },
        { key: 'banners', value: true }
      ]
    },
    icon: 'megaphone',
    color: '#8B5CF6',
    benefits: [
      'Increase customer retention by 40%',
      'Boost sales with targeted campaigns',
      'Automated email marketing',
      'Professional campaign analytics'
    ],
    features: [
      'Discount coupons creation',
      'Promotional campaigns',
      'Email marketing automation',
      'Campaign performance analytics',
      'Customer segmentation',
      'A/B testing for campaigns'
    ],
    useCases: [
      'Seasonal promotions',
      'Customer retention campaigns',
      'New customer acquisition',
      'Loyalty program integration',
      'Holiday marketing'
    ],
    status: 'active',
    isPopular: true,
    isRecommended: true,
    isFeatured: true,
    showOnMarketplace: true,
    trialDays: 14,
    maxQuantity: 1,
    sortOrder: 2
  },
  {
    name: 'sms-pack-1000',
    slug: 'sms-pack-1000',
    displayName: 'SMS Pack (1000)',
    description: 'Send SMS notifications to customers for order updates, delivery alerts, and promotional messages. Includes delivery confirmations and status updates.',
    shortDescription: '1000 SMS credits for customer communication',
    category: 'usage',
    subcategory: 'communication',
    tags: ['sms', 'notifications', 'communication', 'alerts', 'delivery'],
    pricing: {
      oneTime: 300
    },
    billingCycle: 'usage-based',
    config: {
      usage: {
        type: 'credits',
        amount: 1000,
        unit: 'sms_credits',
        autoRenew: false,
        lowBalanceThreshold: 50
      }
    },
    icon: 'message-square',
    color: '#F59E0B',
    benefits: [
      'Better customer communication',
      'Reduced support calls by 60%',
      'Higher customer satisfaction',
      'Real-time order updates'
    ],
    features: [
      'Order status notifications',
      'Delivery alerts',
      'Promotional SMS campaigns',
      'Delivery confirmations',
      'Payment reminders',
      'Custom message templates'
    ],
    useCases: [
      'Order status updates',
      'Delivery notifications',
      'Marketing campaigns',
      'Payment reminders',
      'Customer service alerts'
    ],
    status: 'active',
    isPopular: true,
    isRecommended: false,
    isFeatured: false,
    showOnMarketplace: true,
    trialDays: 0,
    maxQuantity: 100,
    sortOrder: 3
  },
  {
    name: 'loyalty-program',
    slug: 'loyalty-program',
    displayName: 'Loyalty & Rewards',
    description: 'Build customer loyalty with points system, reward tiers, and referral programs to increase repeat business and customer lifetime value.',
    shortDescription: 'Customer loyalty and rewards system',
    category: 'feature',
    subcategory: 'customer-retention',
    tags: ['loyalty', 'rewards', 'points', 'referrals', 'retention'],
    pricing: {
      monthly: 599,
      yearly: 5990
    },
    billingCycle: 'monthly',
    config: {
      features: [
        { key: 'loyalty_points', value: true },
        { key: 'reward_tiers', value: true },
        { key: 'referral_program', value: true },
        { key: 'loyalty_analytics', value: true }
      ]
    },
    icon: 'gift',
    color: '#EC4899',
    benefits: [
      'Increase customer retention by 50%',
      'Higher repeat purchase rate',
      'Word-of-mouth marketing',
      'Improved customer lifetime value'
    ],
    features: [
      'Points-based reward system',
      'Multiple reward tiers',
      'Referral program management',
      'Loyalty program analytics',
      'Automated reward distribution',
      'Custom reward rules'
    ],
    useCases: [
      'Customer retention programs',
      'Repeat purchase incentives',
      'Brand advocacy building',
      'Customer engagement',
      'Referral marketing'
    ],
    status: 'active',
    isPopular: true,
    isRecommended: false,
    isFeatured: false,
    showOnMarketplace: true,
    trialDays: 14,
    maxQuantity: 1,
    sortOrder: 4
  },
  {
    name: 'custom-domain',
    slug: 'custom-domain',
    displayName: 'Custom Domain',
    description: 'Use your own domain name for your laundry platform to enhance brand recognition and customer trust. Includes SSL certificate and DNS management.',
    shortDescription: 'Your own domain (yourname.com)',
    category: 'branding',
    subcategory: 'domain',
    tags: ['domain', 'branding', 'custom', 'professional', 'ssl'],
    pricing: {
      yearly: 999
    },
    billingCycle: 'yearly',
    config: {
      features: [
        { key: 'custom_domain', value: true },
        { key: 'ssl_certificate', value: true },
        { key: 'dns_management', value: true }
      ]
    },
    icon: 'globe',
    color: '#10B981',
    benefits: [
      'Professional brand appearance',
      'Enhanced customer trust',
      'Better SEO rankings',
      'Memorable web address'
    ],
    features: [
      'Custom domain setup',
      'Free SSL certificate',
      'DNS management',
      'Email forwarding',
      'Subdomain support',
      '24/7 domain monitoring'
    ],
    useCases: [
      'Brand building',
      'Professional image',
      'Customer trust building',
      'SEO optimization',
      'Marketing campaigns'
    ],
    status: 'active',
    isPopular: false,
    isRecommended: false,
    isFeatured: false,
    showOnMarketplace: true,
    trialDays: 0,
    maxQuantity: 1,
    sortOrder: 5
  },
  {
    name: 'priority-support',
    slug: 'priority-support',
    displayName: 'Priority Support',
    description: 'Get priority support with faster response times, phone support, and dedicated assistance for your business operations.',
    shortDescription: '24/7 priority support with dedicated manager',
    category: 'support',
    subcategory: 'customer-service',
    tags: ['support', 'priority', '24/7', 'assistance', 'phone'],
    pricing: {
      monthly: 999,
      yearly: 9990
    },
    billingCycle: 'monthly',
    config: {
      features: [
        { key: 'priority_support', value: true },
        { key: 'phone_support', value: true },
        { key: 'dedicated_manager', value: true },
        { key: 'priority_queue', value: true }
      ]
    },
    icon: 'headphones',
    color: '#EF4444',
    benefits: [
      'Faster issue resolution',
      'Peace of mind for business',
      'Business continuity assurance',
      'Expert guidance available'
    ],
    features: [
      '24/7 priority support',
      'Priority ticket queue',
      'Phone support access',
      'Dedicated account manager',
      'Faster response times',
      'Business consultation'
    ],
    useCases: [
      'Critical business operations',
      'High-volume businesses',
      'Enterprise-level needs',
      'Mission-critical systems',
      'Complex integrations'
    ],
    status: 'active',
    isPopular: false,
    isRecommended: true,
    isFeatured: false,
    showOnMarketplace: true,
    trialDays: 7,
    maxQuantity: 1,
    sortOrder: 6
  },
  {
    name: 'advanced-analytics',
    slug: 'advanced-analytics',
    displayName: 'Advanced Analytics',
    description: 'Get detailed business insights with advanced analytics, custom reports, and data visualization to make informed business decisions.',
    shortDescription: 'Advanced business analytics and reporting',
    category: 'feature',
    subcategory: 'analytics',
    tags: ['analytics', 'reports', 'insights', 'data', 'visualization'],
    pricing: {
      monthly: 699,
      yearly: 6990
    },
    billingCycle: 'monthly',
    config: {
      features: [
        { key: 'advanced_analytics', value: true },
        { key: 'custom_reports', value: true },
        { key: 'data_export', value: true },
        { key: 'predictive_analytics', value: true }
      ]
    },
    icon: 'bar-chart-3',
    color: '#6366F1',
    benefits: [
      'Data-driven decision making',
      'Identify growth opportunities',
      'Optimize business operations',
      'Predict customer behavior'
    ],
    features: [
      'Advanced dashboard analytics',
      'Custom report builder',
      'Data visualization charts',
      'Predictive analytics',
      'Export to Excel/PDF',
      'Automated report scheduling'
    ],
    useCases: [
      'Business performance analysis',
      'Customer behavior insights',
      'Revenue optimization',
      'Operational efficiency',
      'Market trend analysis'
    ],
    status: 'active',
    isPopular: false,
    isRecommended: false,
    isFeatured: false,
    showOnMarketplace: true,
    trialDays: 14,
    maxQuantity: 1,
    sortOrder: 7
  },
  {
    name: 'api-integration',
    slug: 'api-integration',
    displayName: 'API Integration',
    description: 'Connect your laundry platform with third-party services, POS systems, and accounting software through our robust API integration.',
    shortDescription: 'Third-party API integrations',
    category: 'integration',
    subcategory: 'api',
    tags: ['api', 'integration', 'pos', 'accounting', 'third-party'],
    pricing: {
      monthly: 899,
      yearly: 8990
    },
    billingCycle: 'monthly',
    config: {
      features: [
        { key: 'api_access', value: true },
        { key: 'webhook_support', value: true },
        { key: 'pos_integration', value: true },
        { key: 'accounting_sync', value: true }
      ]
    },
    icon: 'plug',
    color: '#8B5CF6',
    benefits: [
      'Seamless system integration',
      'Automated data synchronization',
      'Reduced manual work',
      'Enhanced workflow efficiency'
    ],
    features: [
      'RESTful API access',
      'Webhook notifications',
      'POS system integration',
      'Accounting software sync',
      'Custom integrations',
      'API documentation'
    ],
    useCases: [
      'POS system integration',
      'Accounting software sync',
      'Custom app development',
      'Workflow automation',
      'Data synchronization'
    ],
    status: 'active',
    isPopular: false,
    isRecommended: false,
    isFeatured: false,
    showOnMarketplace: true,
    trialDays: 7,
    maxQuantity: 1,
    sortOrder: 8
  }
];

// Create sample add-ons
const createSampleAddOns = async () => {
  try {
    console.log('🚀 Creating sample add-ons...');
    
    // Clear existing add-ons
    await AddOn.deleteMany({});
    console.log('🧹 Cleared existing add-ons');
    
    // Create new add-ons
    const createdAddOns = await AddOn.insertMany(sampleAddOns);
    console.log(`✅ Created ${createdAddOns.length} sample add-ons:`);
    
    createdAddOns.forEach((addOn, index) => {
      console.log(`${index + 1}. ${addOn.displayName} (${addOn.category}) - ${addOn.status}`);
    });
    
    console.log('\n📊 Add-on Summary:');
    const summary = await AddOn.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }
        }
      }
    ]);
    
    summary.forEach(cat => {
      console.log(`- ${cat._id}: ${cat.count} total (${cat.active} active)`);
    });
    
    console.log('\n🎯 Featured Add-ons:');
    const featured = await AddOn.find({ isFeatured: true }).select('displayName category');
    featured.forEach(addOn => {
      console.log(`- ${addOn.displayName} (${addOn.category})`);
    });
    
    console.log('\n⭐ Popular Add-ons:');
    const popular = await AddOn.find({ isPopular: true }).select('displayName category');
    popular.forEach(addOn => {
      console.log(`- ${addOn.displayName} (${addOn.category})`);
    });
    
    console.log('\n✨ Sample add-ons created successfully!');
    console.log('🌐 You can now view them at:');
    console.log('- SuperAdmin: http://localhost:3001/addons');
    console.log('- Tenant Admin: http://localhost:3000/admin/addons/marketplace');
    console.log('- Marketing Site: http://localhost:3002/addons (if implemented)');
    
  } catch (error) {
    console.error('❌ Error creating sample add-ons:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await createSampleAddOns();
  
  console.log('\n🎉 All done! Closing database connection...');
  await mongoose.connection.close();
  process.exit(0);
};

// Run the script
main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});