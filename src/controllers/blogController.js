const BlogPost = require('../models/BlogPost');
const BlogCategory = require('../models/BlogCategory');
const BlogAnalytics = require('../models/BlogAnalytics');

// SuperAdmin Blog Management Controllers

// Get all blog posts for admin
exports.getAllPosts = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, category, search } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (search) {
      query.$text = { $search: search };
    }
    
    const posts = await BlogPost.find(query)
      .populate('category', 'name color')
      .populate('author', 'name email')
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

// Get single blog post for admin
exports.getPost = async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id)
      .populate('category')
      .populate('author', 'name email')
      .populate('relatedPosts', 'title slug');
    
    if (!post) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }
    
    res.json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create new blog post
exports.createPost = async (req, res) => {
  try {
    const postData = {
      ...req.body,
      author: req.user.id
    };
    
    const post = new BlogPost(postData);
    await post.save();
    
    await post.populate('category', 'name color');
    await post.populate('author', 'name email');
    
    res.status(201).json({ success: true, data: post });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Slug already exists' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update blog post
exports.updatePost = async (req, res) => {
  try {
    const post = await BlogPost.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('category', 'name color')
      .populate('author', 'name email');
    
    if (!post) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }
    
    res.json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete blog post
exports.deletePost = async (req, res) => {
  try {
    const post = await BlogPost.findByIdAndDelete(req.params.id);
    
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

// Category Management

// Get all categories
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await BlogCategory.find({ isActive: true })
      .populate('postCount')
      .sort({ sortOrder: 1, name: 1 });
    
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create category
exports.createCategory = async (req, res) => {
  try {
    const category = new BlogCategory(req.body);
    await category.save();
    
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Category slug already exists' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update category
exports.updateCategory = async (req, res) => {
  try {
    const category = await BlogCategory.findByIdAndUpdate(
      req.params.id,
      req.body,
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

// Delete category
exports.deleteCategory = async (req, res) => {
  try {
    const category = await BlogCategory.findById(req.params.id);
    
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    // Check if category has posts
    const postCount = await BlogPost.countDocuments({ category: req.params.id });
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

// Analytics

// Get blog analytics dashboard
exports.getAnalytics = async (req, res) => {
  try {
    const { timeframe = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - timeframe);
    
    // Total stats
    const totalPosts = await BlogPost.countDocuments({ status: 'published' });
    const totalViews = await BlogAnalytics.countDocuments({ 
      action: 'view',
      createdAt: { $gte: startDate }
    });
    
    // Popular posts
    const popularPosts = await BlogAnalytics.getPopularPosts(timeframe, 10);
    
    // Category performance
    const categoryStats = await BlogAnalytics.aggregate([
      {
        $match: {
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
    
    // Helpfulness stats
    const helpfulnessStats = await BlogPost.aggregate([
      {
        $match: { status: 'published' }
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