const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  excerpt: {
    type: String,
    required: true,
    maxlength: 500
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlogCategory',
    required: true
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  // Targeting options
  visibility: {
    type: String,
    enum: ['platform', 'tenant', 'both'],
    default: 'both'
  },
  targetAudience: {
    type: String,
    enum: ['admin', 'customer', 'both'],
    default: 'both'
  },
  
  // SEO fields
  metaTitle: {
    type: String,
    maxlength: 60
  },
  metaDescription: {
    type: String,
    maxlength: 160
  },
  featuredImage: {
    type: String // URL to image
  },
  
  // Status and publishing
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  publishedAt: {
    type: Date
  },
  
  // Analytics
  viewCount: {
    type: Number,
    default: 0
  },
  helpfulCount: {
    type: Number,
    default: 0
  },
  notHelpfulCount: {
    type: Number,
    default: 0
  },
  
  // Author info
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuperAdmin',
    required: true
  },
  
  // Tenant-specific fields
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: false // null for platform posts, set for tenant posts
  },
  tenantAuthor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Tenant admin who created the post
    required: false
  },
  
  // Related articles
  relatedPosts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlogPost'
  }],
  
  // Search optimization
  searchKeywords: [{
    type: String,
    lowercase: true
  }]
}, {
  timestamps: true
});

// Indexes for better performance
blogPostSchema.index({ slug: 1 });
blogPostSchema.index({ category: 1, status: 1 });
blogPostSchema.index({ visibility: 1, targetAudience: 1, status: 1 });
blogPostSchema.index({ publishedAt: -1 });
blogPostSchema.index({ viewCount: -1 });
blogPostSchema.index({ title: 'text', content: 'text', excerpt: 'text' });
blogPostSchema.index({ tenantId: 1, status: 1 }); // For tenant-specific queries

// Pre-save middleware to generate slug and set publishedAt
blogPostSchema.pre('save', function(next) {
  if (this.isModified('title') && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  
  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  next();
});

// Virtual for reading time estimation
blogPostSchema.virtual('readingTime').get(function() {
  const wordsPerMinute = 200;
  const wordCount = this.content.split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
});

// Method to increment view count
blogPostSchema.methods.incrementView = function() {
  this.viewCount += 1;
  return this.save();
};

// Method to record feedback
blogPostSchema.methods.recordFeedback = function(isHelpful) {
  if (isHelpful) {
    this.helpfulCount += 1;
  } else {
    this.notHelpfulCount += 1;
  }
  return this.save();
};

module.exports = mongoose.model('BlogPost', blogPostSchema);