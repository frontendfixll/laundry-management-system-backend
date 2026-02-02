const BlogPost = require('../models/BlogPost');
const BlogCategory = require('../models/BlogCategory');
const BlogAnalytics = require('../models/BlogAnalytics');

// Tenant Admin Blog Management Controllers

// Get all blog posts for tenant admin
exports.getTenantPosts = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, category, search } = req.query;
    const tenantId = req.user.tenancy;
    
    const query = { tenantId };
    if (status) query.status = status;
    if (category) query.category = category;
    if (search) {
      query.$text = { $search: search };
    }
    
    const posts = await BlogPost.find(query)
      .populate('category', 'name color')
      .populate('tenantAuthor', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await BlogPost.countDocuments(query);
    
    res.json({
      success: true,
      data: posts,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single blog post for tenant admin
exports.getTenantPost = async (req, res) => {
  try {
    const tenantId = req.user.tenancy;
    const post = await BlogPost.findOne({ 
      _id: req.params.id, 
      tenantId 
    })
      .populate('category')
      .populate('tenantAuthor', 'name email')
      .populate('relatedPosts', 'title slug');
    
    if (!post) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }
    
    res.json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create new tenant blog post
exports.createTenantPost = async (req, res) => {
  try {
    const tenantId = req.user.tenancy;
    const postData = {
      ...req.body,
      tenantId,
      tenantAuthor: req.user.id,
      author: req.user.id, // For compatibility
      visibility: 'tenant', // Force tenant visibility
      targetAudience: req.body.targetAudience || 'customer'
    };
    
    const post = new BlogPost(postData);
    await post.save();
    
    await post.populate('category', 'name color');
    await post.populate('tenantAuthor', 'name email');
    
    res.status(201).json({ success: true, data: post });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Slug already exists' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update tenant blog post
exports.updateTenantPost = async (req, res) => {
  try {
    const tenantId = req.user.tenancy;
    const post = await BlogPost.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { ...req.body, visibility: 'tenant' }, // Force tenant visibility
      { new: true, runValidators: true }
    )
      .populate('category', 'name color')
      .populate('tenantAuthor', 'name email');
    
    if (!post) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }
    
    res.json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete tenant blog post
exports.deleteTenantPost = async (req, res) => {
  try {
    const tenantId = req.user.tenancy;
    const post = await BlogPost.findOneAndDelete({ 
      _id: req.params.id, 
      tenantId 
    });
    
    if (!post) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }
    
    // Also delete related analytics
    await BlogAnalytics.deleteMany({ blogPost: req.params.id });
    
    res.json({ success: true, message: 'Blog post deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Tenant Category Management

// Get tenant categories
exports.getTenantCategories = async (req, res) => {
  try {
    const tenantId = req.user.tenancy;
    
    // Get both platform categories (for reference) and tenant-specific categories
    const [platformCategories, tenantCategories] = await Promise.all([
      BlogCategory.find({ tenantId: null, isActive: true })
        .populate('postCount')
        .sort({ sortOrder: 1, name: 1 }),
      BlogCategory.find({ tenantId, isActive: true })
        .populate('postCount')
        .sort({ sortOrder: 1, name: 1 })
    ]);
    
    res.json({ 
      success: true, 
      data: {
        platformCategories,
        tenantCategories,
        allCategories: [...platformCategories, ...tenantCategories]
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create tenant category
exports.createTenantCategory = async (req, res) => {
  try {
    const tenantId = req.user.tenancy;
    const category = new BlogCategory({
      ...req.body,
      tenantId,
      visibility: 'tenant' // Force tenant visibility
    });
    await category.save();
    
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Category slug already exists' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update tenant category
exports.updateTenantCategory = async (req, res) => {
  try {
    const tenantId = req.user.tenancy;
    const category = await BlogCategory.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { ...req.body, visibility: 'tenant' }, // Force tenant visibility
      { new: true, runValidators: true }
    );
    
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete tenant category
exports.deleteTenantCategory = async (req, res) => {
  try {
    const tenantId = req.user.tenancy;
    const category = await BlogCategory.findOne({ 
      _id: req.params.id, 
      tenantId 
    });
    
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    // Check if category has posts
    const postCount = await BlogPost.countDocuments({ 
      category: req.params.id, 
      tenantId 
    });
    if (postCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot delete category with ${postCount} posts. Please move or delete posts first.` 
      });
    }
    
    await BlogCategory.findByIdAndDelete(req.params.id);
    
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get tenant blog analytics
exports.getTenantAnalytics = async (req, res) => {
  try {
    const { timeframe = 30 } = req.query;
    const tenantId = req.user.tenancy;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeframe);
    
    // Total stats for tenant
    const totalPosts = await BlogPost.countDocuments({ 
      tenantId, 
      status: 'published' 
    });
    
    const totalViews = await BlogAnalytics.countDocuments({ 
      tenantId,
      action: 'view',
      createdAt: { $gte: startDate }
    });
    
    // Popular posts for tenant
    const popularPosts = await BlogAnalytics.aggregate([
      {
        $match: {
          tenantId: tenantId,
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
        $match: {
          'post.tenantId': tenantId
        }
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
        $limit: 10
      }
    ]);
    
    // Category performance for tenant
    const categoryStats = await BlogAnalytics.aggregate([
      {
        $match: {
          tenantId: tenantId,
          action: 'view',
          createdAt: { $gte: startDate }
        }
      },
      {
        $lookup: {
          from: 'blogposts',
          localField: 'blogPost',
          foreignField: '_id',
          as: 'post'
        }
      },
      {
        $unwind: '$post'
      },
      {
        $match: {
          'post.tenantId': tenantId
        }
      },
      {
        $lookup: {
          from: 'blogcategories',
          localField: 'post.category',
          foreignField: '_id',
          as: 'category'
        }
      },
      {
        $unwind: '$category'
      },
      {
        $group: {
          _id: '$category._id',
          name: { $first: '$category.name' },
          color: { $first: '$category.color' },
          views: { $sum: 1 }
        }
      },
      {
        $sort: { views: -1 }
      }
    ]);
    
    // Helpfulness stats for tenant
    const helpfulnessStats = await BlogPost.aggregate([
      {
        $match: { 
          tenantId: tenantId,
          status: 'published' 
        }
      },
      {
        $project: {
          title: 1,
          helpfulCount: 1,
          notHelpfulCount: 1,
          totalFeedback: { $add: ['$helpfulCount', '$notHelpfulCount'] },
          helpfulPercentage: {
            $cond: {
              if: { $eq: [{ $add: ['$helpfulCount', '$notHelpfulCount'] }, 0] },
              then: 0,
              else: {
                $multiply: [
                  { $divide: ['$helpfulCount', { $add: ['$helpfulCount', '$notHelpfulCount'] }] },
                  100
                ]
              }
            }
          }
        }
      },
      {
        $match: { totalFeedback: { $gt: 0 } }
      },
      {
        $sort: { helpfulPercentage: -1 }
      },
      {
        $limit: 10
      }
    ]);
    
    res.json({
      success: true,
      data: {
        overview: {
          totalPosts,
          totalViews,
          timeframe
        },
        popularPosts,
        categoryStats,
        helpfulnessStats
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = exports;