const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const BlogPost = require('../src/models/BlogPost');
const BlogCategory = require('../src/models/BlogCategory');
const SuperAdmin = require('../src/models/SuperAdmin');

const samplePosts = [
  {
    title: 'How to Set Up Your First Laundry Service',
    excerpt: 'A comprehensive guide to getting your laundry business up and running on our platform. Learn the essential steps to configure your services, pricing, and customer management.',
    content: `# How to Set Up Your First Laundry Service

Welcome to LaundryLobby! This guide will walk you through setting up your first laundry service on our platform.

## Step 1: Complete Your Business Profile

Start by filling out your business information:
- Business name and description
- Contact information
- Operating hours
- Service area

## Step 2: Configure Your Services

Add the services you offer:
- Wash & Fold
- Dry Cleaning
- Ironing
- Pickup & Delivery

## Step 3: Set Your Pricing

Configure competitive pricing for each service:
- Per pound pricing
- Per item pricing
- Bulk discounts
- Special offers

## Step 4: Test Your Setup

Before going live:
- Create a test order
- Verify pricing calculations
- Test customer notifications
- Check pickup/delivery logistics

## Need Help?

If you encounter any issues during setup, don't hesitate to contact our support team. We're here to help you succeed!`,
    categoryName: 'Getting Started',
    visibility: 'tenant',
    targetAudience: 'admin',
    status: 'published',
    tags: ['setup', 'getting-started', 'business', 'configuration'],
    searchKeywords: ['setup', 'first service', 'laundry business', 'getting started']
  },
  {
    title: 'Understanding Your Dashboard Analytics',
    excerpt: 'Learn how to read and interpret the analytics on your dashboard to make data-driven decisions for your laundry business.',
    content: `# Understanding Your Dashboard Analytics

Your dashboard provides valuable insights into your business performance. Here's how to make the most of it.

## Key Metrics to Track

### Revenue Metrics
- Daily, weekly, and monthly revenue
- Average order value
- Revenue per customer

### Operational Metrics
- Order volume
- Processing times
- Customer satisfaction scores

### Customer Metrics
- New vs returning customers
- Customer lifetime value
- Churn rate

## Using Data to Improve

### Identify Peak Hours
Use the hourly breakdown to:
- Optimize staffing
- Plan capacity
- Offer off-peak discounts

### Track Service Performance
Monitor which services are:
- Most popular
- Most profitable
- Taking longest to complete

## Setting Goals

Use your analytics to set realistic goals:
- Monthly revenue targets
- Customer acquisition goals
- Operational efficiency improvements

Remember, consistent monitoring and adjustment based on data will help your business grow!`,
    categoryName: 'Features & How-to',
    visibility: 'tenant',
    targetAudience: 'admin',
    status: 'published',
    tags: ['analytics', 'dashboard', 'metrics', 'business-intelligence'],
    searchKeywords: ['dashboard', 'analytics', 'metrics', 'business data']
  },
  {
    title: 'Troubleshooting Common Login Issues',
    excerpt: 'Having trouble logging into your account? This guide covers the most common login problems and their solutions.',
    content: `# Troubleshooting Common Login Issues

Can't access your account? Don't worry! Here are solutions to the most common login problems.

## Forgot Your Password?

1. Click "Forgot Password" on the login page
2. Enter your email address
3. Check your email for reset instructions
4. Follow the link to create a new password

## Account Locked?

If you've entered the wrong password multiple times:
- Wait 15 minutes before trying again
- Or contact support for immediate assistance

## Email Not Recognized?

Make sure you're using:
- The correct email address
- The email used during registration
- Check for typos or extra spaces

## Browser Issues

Try these steps:
1. Clear your browser cache and cookies
2. Disable browser extensions
3. Try an incognito/private window
4. Use a different browser

## Still Having Problems?

If none of these solutions work:
- Contact our support team
- Provide your registered email
- Describe the exact error message you're seeing

We typically respond within 2 hours during business hours!`,
    categoryName: 'Troubleshooting',
    visibility: 'both',
    targetAudience: 'both',
    status: 'published',
    tags: ['login', 'troubleshooting', 'password', 'account-access'],
    searchKeywords: ['login problems', 'password reset', 'account locked', 'cant login']
  },
  {
    title: 'Understanding Our Pricing Plans',
    excerpt: 'A detailed breakdown of our pricing plans and features to help you choose the right plan for your business size and needs.',
    content: `# Understanding Our Pricing Plans

Choose the right plan for your laundry business with this comprehensive guide to our pricing structure.

## Starter Plan - $29/month

Perfect for small operations:
- Up to 100 orders per month
- Basic customer management
- Email support
- Standard reporting

## Professional Plan - $79/month

Ideal for growing businesses:
- Up to 500 orders per month
- Advanced analytics
- SMS notifications
- Priority support
- Custom branding

## Enterprise Plan - $199/month

For large operations:
- Unlimited orders
- Multi-location support
- API access
- Dedicated account manager
- Custom integrations

## Add-on Services

Enhance any plan with:
- **Pickup & Delivery Module** - $19/month
- **Loyalty Program** - $15/month
- **Advanced Reporting** - $25/month
- **White Label Solution** - $49/month

## Billing Information

- All plans are billed monthly
- No setup fees
- Cancel anytime
- 14-day free trial available

## Need Help Choosing?

Contact our sales team for a personalized recommendation based on your business needs!`,
    categoryName: 'Billing & Payments',
    visibility: 'platform',
    targetAudience: 'both',
    status: 'published',
    tags: ['pricing', 'plans', 'billing', 'features'],
    searchKeywords: ['pricing plans', 'cost', 'billing', 'subscription']
  },
  {
    title: 'Best Practices for Customer Communication',
    excerpt: 'Learn effective strategies for communicating with your customers to improve satisfaction and build long-term relationships.',
    content: `# Best Practices for Customer Communication

Effective communication is key to customer satisfaction and business success. Here are proven strategies.

## Proactive Communication

### Order Updates
- Send confirmation immediately after order placement
- Notify when items are picked up
- Update on processing status
- Confirm when ready for delivery/pickup

### Service Issues
- Inform customers of any delays immediately
- Explain the reason and expected resolution time
- Offer compensation when appropriate
- Follow up to ensure satisfaction

## Communication Channels

### SMS Notifications
- Quick updates for busy customers
- High open rates
- Perfect for time-sensitive information

### Email
- Detailed information
- Order summaries
- Promotional content
- Service announcements

### In-App Notifications
- Real-time updates
- Order tracking
- Special offers

## Tone and Style

### Be Professional but Friendly
- Use clear, simple language
- Avoid technical jargon
- Show empathy for customer concerns
- Maintain consistency across all channels

### Personalization
- Use customer names
- Reference their service history
- Tailor recommendations
- Remember preferences

## Handling Complaints

1. **Listen actively** - Let customers explain fully
2. **Acknowledge the issue** - Show you understand
3. **Apologize sincerely** - Even if not your fault
4. **Offer solutions** - Multiple options when possible
5. **Follow up** - Ensure satisfaction

## Building Relationships

- Remember regular customers
- Celebrate milestones (anniversaries, etc.)
- Ask for feedback regularly
- Reward loyalty

Great communication turns one-time customers into lifelong advocates!`,
    categoryName: 'Customer Support',
    visibility: 'tenant',
    targetAudience: 'admin',
    status: 'published',
    tags: ['customer-service', 'communication', 'best-practices', 'relationships'],
    searchKeywords: ['customer communication', 'customer service', 'support', 'satisfaction']
  }
];

async function seedSampleBlogPosts() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if posts already exist
    const existingPosts = await BlogPost.countDocuments();
    if (existingPosts > 0) {
      console.log(`⚠️ Found ${existingPosts} existing blog posts. Skipping seed.`);
      process.exit(0);
    }

    // Get categories and superadmin
    const categories = await BlogCategory.find();
    const superAdmin = await SuperAdmin.findOne();

    if (!superAdmin) {
      console.log('❌ No SuperAdmin found. Please create a SuperAdmin first.');
      process.exit(1);
    }

    if (categories.length === 0) {
      console.log('❌ No categories found. Please run seed-blog-categories.js first.');
      process.exit(1);
    }

    console.log('🌱 Seeding sample blog posts...');
    
    for (const postData of samplePosts) {
      // Find category by name
      const category = categories.find(cat => cat.name === postData.categoryName);
      if (!category) {
        console.log(`⚠️ Category "${postData.categoryName}" not found. Skipping post: ${postData.title}`);
        continue;
      }

      const post = new BlogPost({
        title: postData.title,
        excerpt: postData.excerpt,
        content: postData.content,
        category: category._id,
        visibility: postData.visibility,
        targetAudience: postData.targetAudience,
        status: postData.status,
        tags: postData.tags,
        searchKeywords: postData.searchKeywords,
        author: superAdmin._id,
        publishedAt: new Date()
      });

      await post.save();
      console.log(`✅ Created blog post: ${post.title}`);
    }

    console.log(`🎉 Successfully seeded ${samplePosts.length} sample blog posts!`);
    
  } catch (error) {
    console.error('❌ Error seeding sample blog posts:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the seed function
seedSampleBlogPosts();