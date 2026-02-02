const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const BlogCategory = require('../src/models/BlogCategory');

const defaultCategories = [
  {
    name: 'Getting Started',
    description: 'Essential guides for new users to get up and running quickly',
    color: '#3B82F6',
    icon: 'FileText',
    visibility: 'both',
    sortOrder: 1
  },
  {
    name: 'Troubleshooting',
    description: 'Solutions to common problems and technical issues',
    color: '#EF4444',
    icon: 'AlertTriangle',
    visibility: 'both',
    sortOrder: 2
  },
  {
    name: 'Features & How-to',
    description: 'Detailed guides on using platform features effectively',
    color: '#10B981',
    icon: 'Settings',
    visibility: 'both',
    sortOrder: 3
  },
  {
    name: 'Billing & Payments',
    description: 'Information about pricing, billing, and payment processes',
    color: '#F59E0B',
    icon: 'CreditCard',
    visibility: 'both',
    sortOrder: 4
  },
  {
    name: 'Business Management',
    description: 'Tips and guides for managing your laundry business',
    color: '#8B5CF6',
    icon: 'Briefcase',
    visibility: 'tenant',
    sortOrder: 5
  },
  {
    name: 'Customer Support',
    description: 'Help with customer service and support processes',
    color: '#06B6D4',
    icon: 'Headphones',
    visibility: 'tenant',
    sortOrder: 6
  },
  {
    name: 'Platform Updates',
    description: 'Latest updates, new features, and announcements',
    color: '#84CC16',
    icon: 'Megaphone',
    visibility: 'both',
    sortOrder: 7
  },
  {
    name: 'Best Practices',
    description: 'Industry best practices and optimization tips',
    color: '#F97316',
    icon: 'Star',
    visibility: 'both',
    sortOrder: 8
  }
];

async function seedBlogCategories() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Check if categories already exist
    const existingCategories = await BlogCategory.countDocuments();
    if (existingCategories > 0) {
      console.log(`⚠️ Found ${existingCategories} existing categories. Skipping seed.`);
      process.exit(0);
    }

    // Create categories
    console.log('🌱 Seeding blog categories...');
    
    for (const categoryData of defaultCategories) {
      const category = new BlogCategory(categoryData);
      await category.save();
      console.log(`✅ Created category: ${category.name}`);
    }

    console.log(`🎉 Successfully seeded ${defaultCategories.length} blog categories!`);
    
  } catch (error) {
    console.error('❌ Error seeding blog categories:', error);
  } finally {
    await mongoose.disconnect();
    console.log('📡 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the seed function
seedBlogCategories();