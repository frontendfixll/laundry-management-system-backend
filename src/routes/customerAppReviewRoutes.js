// Authenticated review actions for the customer app.
// Read endpoints stay public under /api/marketplace/branches/:id/reviews —
// only WRITE operations need auth.

const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { createReview } = require('../controllers/marketplace/customerReviewController');

router.post('/', protect, createReview);

module.exports = router;
