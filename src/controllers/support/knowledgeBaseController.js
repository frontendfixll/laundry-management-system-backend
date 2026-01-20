const KnowledgeBase = require('../../models/KnowledgeBase');
const KnowledgeCategory = require('../../models/KnowledgeCategory');
const { 
  sendSuccess, 
  sendError, 
  asyncHandler,
  getPagination,
  formatPaginationResponse
} = require('../../utils/helpers');

// @desc    Get knowledge base articles
// @route   GET /api/support/knowledge-base
// @access  Private (Support)
const getKnowledgeBase = asyncHandler(async (req, res) => {
  const tenancyId = req.tenancyId;
  const { 
    page = 1, 
    limit = 12, 
    category, 
    search,
    status = 'published'
  } = req.query;
  const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit);

  // Build query
  let query = { 
    tenancy: tenancyId,
    status: status
  };

  if (category && category !== 'all') {
    query.category = category;
  }

  if (search) {
    query.$text = { $search: search };
  }

  // Get articles
  const total = await KnowledgeBase.countDocuments(query);
  const articles = await KnowledgeBase.find(query)
    .populate('author', 'name email')
    .populate('lastUpdatedBy', 'name email')
    .select('title content category tags views likes helpfulPercentage createdAt updatedAt author')
    .sort(search ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  // Get categories with article counts
  const categories = await KnowledgeCategory.aggregate([
    { $match: { tenancy: tenancyId, isActive: true } },
    {
      $lookup: {
        from: 'knowledgebases',
        let: { categoryName: '$name' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$tenancy', tenancyId] },
                  { $eq: ['$category', '$$categoryName'] },
                  { $eq: ['$status', 'published'] }
                ]
              }
            }
          }
        ],
        as: 'articles'
      }
    },
    {
      $project: {
        name: 1,
        description: 1,
        color: 1,
        icon: 1,
        count: { $size: '$articles' },
        sortOrder: 1
      }
    },
    { $sort: { sortOrder: 1, name: 1 } }
  ]);

  const response = formatPaginationResponse(articles, total, pageNum, limitNum);
  response.categories = categories;

  sendSuccess(res, response, 'Knowledge base retrieved successfully');
});

// @desc    Get single knowledge base article
// @route   GET /api/support/knowledge-base/:articleId
// @access  Private (Support)
const getKnowledgeBaseArticle = asyncHandler(async (req, res) => {
  const { articleId } = req.params;
  const tenancyId = req.tenancyId;

  const article = await KnowledgeBase.findOne({
    _id: articleId,
    tenancy: tenancyId,
    status: 'published'
  })
    .populate('author', 'name email')
    .populate('lastUpdatedBy', 'name email')
    .populate('relatedArticles', 'title category views');

  if (!article) {
    return sendError(res, 'ARTICLE_NOT_FOUND', 'Article not found', 404);
  }

  // Increment views
  await article.incrementViews();

  sendSuccess(res, { article }, 'Article retrieved successfully');
});

// @desc    Create knowledge base article
// @route   POST /api/support/knowledge-base
// @access  Private (Support/Admin)
const createKnowledgeBaseArticle = asyncHandler(async (req, res) => {
  const {
    title,
    content,
    category,
    tags = [],
    status = 'published',
    visibility = 'tenancy',
    searchKeywords = [],
    relatedArticles = []
  } = req.body;

  const tenancyId = req.tenancyId;
  const userId = req.user._id;

  // Check if category exists, if not create it
  let categoryDoc = await KnowledgeCategory.findOne({
    name: category,
    tenancy: tenancyId
  });

  if (!categoryDoc) {
    categoryDoc = await KnowledgeCategory.create({
      name: category,
      tenancy: tenancyId,
      createdBy: userId
    });
  }

  const article = await KnowledgeBase.create({
    title,
    content,
    category,
    tags,
    status,
    visibility,
    searchKeywords,
    relatedArticles,
    tenancy: tenancyId,
    author: userId
  });

  const populatedArticle = await KnowledgeBase.findById(article._id)
    .populate('author', 'name email');

  sendSuccess(res, { article: populatedArticle }, 'Article created successfully', 201);
});

// @desc    Update knowledge base article
// @route   PUT /api/support/knowledge-base/:articleId
// @access  Private (Support/Admin)
const updateKnowledgeBaseArticle = asyncHandler(async (req, res) => {
  const { articleId } = req.params;
  const tenancyId = req.tenancyId;
  const userId = req.user._id;

  const article = await KnowledgeBase.findOne({
    _id: articleId,
    tenancy: tenancyId
  });

  if (!article) {
    return sendError(res, 'ARTICLE_NOT_FOUND', 'Article not found', 404);
  }

  // Update fields
  const updateFields = [
    'title', 'content', 'category', 'tags', 'status', 
    'visibility', 'searchKeywords', 'relatedArticles'
  ];

  updateFields.forEach(field => {
    if (req.body[field] !== undefined) {
      article[field] = req.body[field];
    }
  });

  article.lastUpdatedBy = userId;
  await article.save();

  const updatedArticle = await KnowledgeBase.findById(articleId)
    .populate('author', 'name email')
    .populate('lastUpdatedBy', 'name email');

  sendSuccess(res, { article: updatedArticle }, 'Article updated successfully');
});

// @desc    Delete knowledge base article
// @route   DELETE /api/support/knowledge-base/:articleId
// @access  Private (Support/Admin)
const deleteKnowledgeBaseArticle = asyncHandler(async (req, res) => {
  const { articleId } = req.params;
  const tenancyId = req.tenancyId;

  const article = await KnowledgeBase.findOne({
    _id: articleId,
    tenancy: tenancyId
  });

  if (!article) {
    return sendError(res, 'ARTICLE_NOT_FOUND', 'Article not found', 404);
  }

  await KnowledgeBase.findByIdAndDelete(articleId);

  sendSuccess(res, null, 'Article deleted successfully');
});

// @desc    Mark article as helpful/not helpful
// @route   POST /api/support/knowledge-base/:articleId/helpful
// @access  Private (Support)
const markArticleHelpful = asyncHandler(async (req, res) => {
  const { articleId } = req.params;
  const { helpful } = req.body;
  const tenancyId = req.tenancyId;
  const userId = req.user._id;

  const article = await KnowledgeBase.findOne({
    _id: articleId,
    tenancy: tenancyId,
    status: 'published'
  });

  if (!article) {
    return sendError(res, 'ARTICLE_NOT_FOUND', 'Article not found', 404);
  }

  await article.markHelpful(userId, helpful);

  sendSuccess(res, { 
    helpfulPercentage: article.helpfulPercentage 
  }, 'Feedback recorded successfully');
});

// @desc    Get knowledge base categories
// @route   GET /api/support/knowledge-base/categories
// @access  Private (Support)
const getKnowledgeBaseCategories = asyncHandler(async (req, res) => {
  const tenancyId = req.tenancyId;

  const categories = await KnowledgeCategory.find({
    tenancy: tenancyId,
    isActive: true
  })
    .populate('createdBy', 'name email')
    .sort({ sortOrder: 1, name: 1 });

  sendSuccess(res, { categories }, 'Categories retrieved successfully');
});

// @desc    Create knowledge base category
// @route   POST /api/support/knowledge-base/categories
// @access  Private (Support/Admin)
const createKnowledgeBaseCategory = asyncHandler(async (req, res) => {
  const { name, description, color, icon, sortOrder } = req.body;
  const tenancyId = req.tenancyId;
  const userId = req.user._id;

  // Check if category already exists
  const existingCategory = await KnowledgeCategory.findOne({
    name,
    tenancy: tenancyId
  });

  if (existingCategory) {
    return sendError(res, 'CATEGORY_EXISTS', 'Category already exists', 400);
  }

  const category = await KnowledgeCategory.create({
    name,
    description,
    color,
    icon,
    sortOrder,
    tenancy: tenancyId,
    createdBy: userId
  });

  const populatedCategory = await KnowledgeCategory.findById(category._id)
    .populate('createdBy', 'name email');

  sendSuccess(res, { category: populatedCategory }, 'Category created successfully', 201);
});

// @desc    Update knowledge base category
// @route   PUT /api/support/knowledge-base/categories/:categoryId
// @access  Private (Support/Admin)
const updateKnowledgeBaseCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const tenancyId = req.tenancyId;

  const category = await KnowledgeCategory.findOne({
    _id: categoryId,
    tenancy: tenancyId
  });

  if (!category) {
    return sendError(res, 'CATEGORY_NOT_FOUND', 'Category not found', 404);
  }

  const updateFields = ['name', 'description', 'color', 'icon', 'sortOrder', 'isActive'];
  updateFields.forEach(field => {
    if (req.body[field] !== undefined) {
      category[field] = req.body[field];
    }
  });

  await category.save();

  sendSuccess(res, { category }, 'Category updated successfully');
});

// @desc    Delete knowledge base category
// @route   DELETE /api/support/knowledge-base/categories/:categoryId
// @access  Private (Support/Admin)
const deleteKnowledgeBaseCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const tenancyId = req.tenancyId;

  const category = await KnowledgeCategory.findOne({
    _id: categoryId,
    tenancy: tenancyId
  });

  if (!category) {
    return sendError(res, 'CATEGORY_NOT_FOUND', 'Category not found', 404);
  }

  // Check if category has articles
  const articleCount = await KnowledgeBase.countDocuments({
    category: category.name,
    tenancy: tenancyId
  });

  if (articleCount > 0) {
    return sendError(res, 'CATEGORY_HAS_ARTICLES', 'Cannot delete category with articles', 400);
  }

  await KnowledgeCategory.findByIdAndDelete(categoryId);

  sendSuccess(res, null, 'Category deleted successfully');
});

module.exports = {
  getKnowledgeBase,
  getKnowledgeBaseArticle,
  createKnowledgeBaseArticle,
  updateKnowledgeBaseArticle,
  deleteKnowledgeBaseArticle,
  markArticleHelpful,
  getKnowledgeBaseCategories,
  createKnowledgeBaseCategory,
  updateKnowledgeBaseCategory,
  deleteKnowledgeBaseCategory
};