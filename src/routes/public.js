const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { trackOrder } = require('../controllers/publicController');

// Rate limiter for public tracking endpoint
// Limit: 20 requests per minute per IP
const trackingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: {
    success: false,
    message: 'Too many tracking requests. Please try again in a minute.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// @route   GET /api/public/track/:orderNumber
// @desc    Track order by order number (no authentication required)
// @access  Public
router.get('/track/:orderNumber', trackingLimiter, trackOrder);

module.exports = router;
