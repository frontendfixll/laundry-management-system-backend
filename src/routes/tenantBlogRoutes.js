const express = require('express');
const router = express.Router();
const tenantBlogController = require('../controllers/tenantBlogController');
const { protect } = require('../middlewares/auth');

// All routes require tenant admin authentication
router.use(protect);

// Blog Posts
router.get('/posts', tenantBlogController.getTenantPosts);
router.get('/posts/:id', tenantBlogController.getTenantPost);
router.post('/posts', tenantBlogController.createTenantPost);
router.put('/posts/:id', tenantBlogController.updateTenantPost);
router.delete('/posts/:id', tenantBlogController.deleteTenantPost);

// Categories
router.get('/categories', tenantBlogController.getTenantCategories);
router.post('/categories', tenantBlogController.createTenantCategory);
router.put('/categories/:id', tenantBlogController.updateTenantCategory);
router.delete('/categories/:id', tenantBlogController.deleteTenantCategory);

// Analytics
router.get('/analytics', tenantBlogController.getTenantAnalytics);

module.exports = router;