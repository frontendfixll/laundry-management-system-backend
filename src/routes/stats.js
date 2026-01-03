const express = require('express');
const router = express.Router();

// Import controllers
const {
  getHomepageStats,
  getServiceStats
} = require('../controllers/statsController');

// Import middleware (optional auth for some stats)
const { optionalAuth } = require('../middlewares/auth');

// Public routes (no authentication required)
router.get('/homepage', getHomepageStats);
router.get('/services', getServiceStats);

// Optional auth routes (enhanced data for authenticated users)
router.get('/dashboard', optionalAuth, getHomepageStats);

module.exports = router;