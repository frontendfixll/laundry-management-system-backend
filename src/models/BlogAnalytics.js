const mongoose = require('mongoose');

const blogAnalyticsSchema = new mongoose.Schema({
  blogPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlogPost',
    required: true
  },
  
  // User info (optional, for tracking)
  userId: {
    type: String, // Can be tenant admin ID or customer ID
    required: false
  },
  userType: {
    type: String,
    enum: ['tenant_admin', 'customer', 'anonymous'],
    default: 'anonymous'
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenancy',
    required: false
  },
  
  // Analytics data
  action: {
    type: String,
    enum: ['view', 'helpful', 'not_helpful', 'share', 'search_result_click'],
    required: true
  },
  
  // Context information
  referrer: {
    type: String // Where they came from (search, related articles, etc.)
  },
  searchQuery: {
    type: String // If they found this through search
  },
  
  // Technical info
  userAgent: String,
  ipAddress: String,
  
  // Session tracking
  sessionId: String,
  
  // Time spent (for view actions)
  timeSpent: {
    type: Number, // in seconds
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for analytics queries
blogAnalyticsSchema.index({ blogPost: 1, action: 1 });
blogAnalyticsSchema.index({ createdAt: -1 });
blogAnalyticsSchema.index({ userType: 1, tenantId: 1 });
blogAnalyticsSchema.index({ action: 1, createdAt: -1 });

// Static method to record analytics
blogAnalyticsSchema.statics.recordAction = function(data) {
  return this.create(data);
};

// Static method to get popular posts
blogAnalyticsSchema.statics.getPopularPosts = function(timeframe = 30, limit = 10) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - timeframe);
  
  return this.aggregate([
    {
      $match: {
        action: 'view',
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$blogPost',
        viewCount: { $sum: 1 },
        uniqueUsers: { $addToSet: '$userId' }
      }
    },
    {
      $lookup: {
        from: 'blogposts',
        localField: '_id',
        foreignField: '_id',
        as: 'post'
      }
    },
    {
      $unwind: '$post'
    },
    {
      $project: {
        title: '$post.title',
        slug: '$post.slug',
        viewCount: 1,
        uniqueUserCount: { $size: '$uniqueUsers' }
      }
    },
    {
      $sort: { viewCount: -1 }
    },
    {
      $limit: limit
    }
  ]);
};

module.exports = mongoose.model('BlogAnalytics', blogAnalyticsSchema);