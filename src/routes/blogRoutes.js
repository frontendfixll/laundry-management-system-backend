const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');
const { protectSuperAdmin } = require('../middlewares/superAdminAuth');

// SuperAdmin Blog Management Routes
router.use(protectSuperAdmin); // All routes require SuperAdmin authentication

// Blog Posts
router.get('/posts', blogController.getAllPosts);
router.get('/posts/:id', blogController.getPost);
router.post('/posts', blogController.createPost);
router.put('/posts/:id', blogController.updatePost);
router.delete('/posts/:id', blogController.deletePost);

// Categories
router.get('/categories', blogController.getAllCategories);
router.post('/categories', blogController.createCategory);
router.put('/categories/:id', blogController.updateCategory);
router.delete('/categories/:id', blogController.deleteCategory);

// Analytics
router.get('/analytics', blogController.getAnalytics);

module.exports = router;