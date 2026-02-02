const express = require('express');
const router = express.Router();
const publicBlogController = require('../controllers/publicBlogController');

// Public Blog Routes (no authentication required)

// Get published posts with filtering
router.get('/posts', publicBlogController.getPublishedPosts);

// Get single post by slug
router.get('/posts/:slug', publicBlogController.getPostBySlug);

// Get categories
router.get('/categories', publicBlogController.getPublicCategories);

// Search posts
router.get('/search', publicBlogController.searchPosts);

// Get popular posts
router.get('/popular', publicBlogController.getPopularPosts);

// Get recent posts
router.get('/recent', publicBlogController.getRecentPosts);

// Record feedback (helpful/not helpful)
router.post('/posts/:slug/feedback', publicBlogController.recordFeedback);

module.exports = router;