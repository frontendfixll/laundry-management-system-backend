const BlogPost = require('../models/BlogPost');
const BlogCategory = require('../models/BlogCategory');
const BlogAnalytics = require('../models/BlogAnalytics');

// Public Blog Controllers (for frontend-marketing and frontend)

// Get published blog posts with filtering
exports.getPublishedPosts = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 12, 
      category, 
      search, 
      visibility = 'both',
      audience = 'both',
      tags,
      tenantId // New parameter for tenant-specific queries
    } = req.query;
    
    const query = { status: 'published' };
    
    // Filter by tenant (for tenant landing pages)
    if (tenantId) {
      query.tenantId = tenantId;
    } else {
      // For platform queries, exclude tenant-specific posts
      query.tenantId = null;
    }
    
    // Filter by visibility (platform/tenant/both)
    if (visibility !== 'both') {
      query.visibility = { $in: [visibility, 'both'] };
    }
    
    // Filter by target audience
    if (audience !== 'both') {
      query.targetAudience = { $in: [audience, 'both'] };
    }
    
    // Filter by category
    if (category) {
      query.category = category;
    }
    
    // Filter by tags
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim());
      query.tags = { $in: tagArray };
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }
    
    const posts = await BlogPost.find(query)
      .populate('category', 'name slug color icon')
      .populate('author', 'name')
      .populate('tenantAuthor', 'name')
      .select('-content') // Don't send full content in list view
      .sort({ publishedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await BlogPost.countDocuments(query);
    
    res.json({
      success: true,
      data: posts,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single blog post by slug
exports.getPostBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const { visibility = 'both', audience = 'both', tenantId } = req.query;
    
    const query = { 
      slug, 
      status: 'published'
    };
    
    // Filter by tenant if specified
    if (tenantId) {
      query.tenantId = tenantId;
    } else {
      query.tenantId = null; // Platform posts only
    }
    
    // Apply visibility and audience filters
    if (visibility !== 'both') {
      query.visibility = { $in: [visibility, 'both'] };
    }
    
    if (audience !== 'both') {
      query.targetAudience = { $in: [audience, 'both'] };
    }
    
    const post = await BlogPost.findOne(query)
      .populate('category', 'name slug color icon')
      .populate('author', 'name')
      .populate('tenantAuthor', 'name')
      .populate('relatedPosts', 'title slug excerpt featuredImage publishedAt readingTime');
    
    if (!post) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }
    
    // Increment view count
    await post.incrementView();
    
    // Record analytics
    await BlogAnalytics.recordAction({
      blogPost: post._id,
      action: 'view',
      tenantId: tenantId || null,
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip,
      referrer: req.get('Referrer')
    });
    
    // Get related posts if not already populated
    if (!post.relatedPosts || post.relatedPosts.length === 0) {
      const relatedQuery = {
        _id: { $ne: post._id },
        category: post.category._id,
        status: 'published',
        visibility: { $in: [visibility, 'both'] },
        targetAudience: { $in: [audience, 'both'] }
      };
      
      // Same tenant context for related posts
      if (tenantId) {
        relatedQuery.tenantId = tenantId;
      } else {
        relatedQuery.tenantId = null;
      }
      
      const relatedPosts = await BlogPost.find(relatedQuery)
        .select('title slug excerpt featuredImage publishedAt')
        .limit(3)
        .sort({ viewCount: -1 });
      
      post.relatedPosts = relatedPosts;
    }
    
    res.json({ success: true, data: post });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get blog categories for public use
exports.getPublicCategories = async (req, res) => {
  try {
    const { visibility = 'both', tenantId } = req.query;
    
    const query = { isActive: true };
    
    // Filter by tenant if specified
    if (tenantId) {
      query.tenantId = tenantId;
    } else {
      query.tenantId = null; // Platform categories only
    }
    
    if (visibility !== 'both') {
      query.visibility = { $in: [visibility, 'both'] };
    }
    
    const categories = await BlogCategory.find(query)
      .sort({ sortOrder: 1, name: 1 });
    
    // Get post count for each category
    const categoriesWithCount = await Promise.all(
      categories.map(async (category) => {
        const postQuery = {
          category: category._id,
          status: 'published',
          visibility: { $in: [visibility, 'both'] }
        };
        
        // Same tenant context for post count
        if (tenantId) {
          postQuery.tenantId = tenantId;
        } else {
          postQuery.tenantId = null;
        }
        
        const postCount = await BlogPost.countDocuments(postQuery);
        
        return {
          ...category.toObject(),
          postCount
        };
      })
    );
    
    res.json({ success: true, data: categoriesWithCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Search blog posts
exports.searchPosts = async (req, res) => {
  try {
    const { 
      q: query, 
      page = 1, 
      limit = 10,
      visibility = 'both',
      audience = 'both'
    } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Search query must be at least 2 characters long' 
      });
    }
    
    const searchQuery = {
      status: 'published',
      $or: [
        { title: { $regex: query, $options: 'i' } },
        { excerpt: { $regex: query, $options: 'i' } },
        { content: { $regex: query, $options: 'i' } },
        { tags: { $in: [new RegExp(query, 'i')] } },
        { searchKeywords: { $in: [new RegExp(query, 'i')] } }
      ]
    };
    
    // Apply visibility and audience filters
    if (visibility !== 'both') {
      searchQuery.visibility = { $in: [visibility, 'both'] };
    }
    
    if (audience !== 'both') {
      searchQuery.targetAudience = { $in: [audience, 'both'] };
    }
    
    const posts = await BlogPost.find(searchQuery)
      .populate('category', 'name slug color')
      .select('title slug excerpt featuredImage publishedAt viewCount category')
      .sort({ viewCount: -1, publishedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await BlogPost.countDocuments(searchQuery);
    
    // Record search analytics
    if (posts.length > 0) {
      await BlogAnalytics.recordAction({
        blogPost: posts[0]._id, // Record for the first result
        action: 'search_result_click',
        searchQuery: query,
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip
      });
    }
    
    res.json({
      success: true,
      data: posts,
      searchQuery: query,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Record feedback (helpful/not helpful)
exports.recordFeedback = async (req, res) => {
  try {
    const { slug } = req.params;
    const { helpful, userId, userType, tenantId } = req.body;
    
    const post = await BlogPost.findOne({ slug, status: 'published' });
    
    if (!post) {
      return res.status(404).json({ success: false, message: 'Blog post not found' });
    }
    
    // Record feedback
    await post.recordFeedback(helpful);
    
    // Record analytics
    await BlogAnalytics.recordAction({
      blogPost: post._id,
      action: helpful ? 'helpful' : 'not_helpful',
      userId,
      userType: userType || 'anonymous',
      tenantId,
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip
    });
    
    res.json({ 
      success: true, 
      message: 'Feedback recorded successfully',
      data: {
        helpfulCount: post.helpfulCount,
        notHelpfulCount: post.notHelpfulCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get popular/trending posts
exports.getPopularPosts = async (req, res) => {
  try {
    const { 
      limit = 5, 
      timeframe = 7,
      visibility = 'both',
      audience = 'both'
    } = req.query;
    
    const query = { 
      status: 'published'
    };
    
    // Apply filters
    if (visibility !== 'both') {
      query.visibility = { $in: [visibility, 'both'] };
    }
    
    if (audience !== 'both') {
      query.targetAudience = { $in: [audience, 'both'] };
    }
    
    const posts = await BlogPost.find(query)
      .populate('category', 'name slug color')
      .select('title slug excerpt featuredImage publishedAt viewCount')
      .sort({ viewCount: -1, publishedAt: -1 })
      .limit(parseInt(limit));
    
    res.json({ success: true, data: posts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get recent posts
exports.getRecentPosts = async (req, res) => {
  try {
    const { 
      limit = 5,
      visibility = 'both',
      audience = 'both'
    } = req.query;
    
    const query = { 
      status: 'published'
    };
    
    // Apply filters
    if (visibility !== 'both') {
      query.visibility = { $in: [visibility, 'both'] };
    }
    
    if (audience !== 'both') {
      query.targetAudience = { $in: [audience, 'both'] };
    }
    
    const posts = await BlogPost.find(query)
      .populate('category', 'name slug color')
      .select('title slug excerpt featuredImage publishedAt')
      .sort({ publishedAt: -1 })
      .limit(parseInt(limit));
    
    res.json({ success: true, data: posts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = exports;