// Review creation from the customer mobile app.
// Authenticated endpoint — uses our JWT, sets req.user from `protect` middleware.
//
// Verified-purchase logic: if the customer has any DELIVERED order at this
// branch we (a) tag the review with that order id, and (b) the Review model's
// pre-save hook auto-adds the 'verified_purchase' badge.

const mongoose = require('mongoose');
const Review = require('../../models/Review');
const Branch = require('../../models/Branch');
const Order = require('../../models/Order');

const RATING_KEYS = ['overall', 'serviceQuality', 'deliverySpeed', 'cleanliness', 'valueForMoney', 'staffBehavior'];

function sanitizeRatings(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const k of RATING_KEYS) {
    const v = Number(input[k]);
    if (Number.isFinite(v) && v >= 1 && v <= 5) {
      out[k] = Math.round(v);
    }
  }
  return out;
}

// POST /api/customer-app/reviews
// Body: { branchId, ratings: { overall, ...optional }, title?, content }
exports.createReview = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
    if (req.user.role !== 'customer') {
      return res.status(403).json({ success: false, error: 'Only customers can post reviews' });
    }

    const { branchId, title, content } = req.body || {};
    const ratings = sanitizeRatings(req.body?.ratings);

    if (!mongoose.isValidObjectId(branchId)) {
      return res.status(400).json({ success: false, error: 'Invalid branchId' });
    }
    if (!ratings.overall) {
      return res.status(400).json({ success: false, error: 'ratings.overall (1-5) is required' });
    }
    const trimmedContent = typeof content === 'string' ? content.trim() : '';
    if (trimmedContent.length < 5) {
      return res.status(400).json({ success: false, error: 'Review content must be at least 5 characters' });
    }
    if (trimmedContent.length > 1000) {
      return res.status(400).json({ success: false, error: 'Review content cannot exceed 1000 characters' });
    }
    const trimmedTitle = typeof title === 'string' ? title.trim().slice(0, 100) : undefined;

    // Branch must exist and be visible on the marketplace
    const branch = await Branch.findOne({
      _id: branchId,
      marketplaceVisible: true,
      isActive: true
    }).select('_id tenancy').lean();

    if (!branch) {
      return res.status(404).json({ success: false, error: 'Branch not found' });
    }

    // Prevent duplicate reviews per customer per branch (most platforms allow
    // editing, not multiple — keep this strict; an "edit" endpoint can be added
    // later).
    const existing = await Review.findOne({ branch: branch._id, customer: userId }).select('_id').lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'You have already reviewed this branch',
        reviewId: existing._id
      });
    }

    // Look up a delivered order from this customer at this branch for the
    // verified_purchase badge. Pick the most recent one for the order link.
    const verifyingOrder = await Order.findOne({
      customer: userId,
      branch: branch._id,
      status: 'delivered'
    }).sort({ createdAt: -1 }).select('_id').lean();

    const review = await Review.create({
      tenancy: branch.tenancy,
      branch: branch._id,
      customer: userId,
      order: verifyingOrder?._id,
      ratings,
      title: trimmedTitle,
      content: trimmedContent,
      status: 'approved' // marketplace reviews skip pre-moderation; flagging stays available
    });

    return res.status(201).json({
      success: true,
      review: {
        _id: review._id,
        reviewId: review.reviewId,
        ratings: review.ratings,
        title: review.title,
        content: review.content,
        badges: review.badges,
        createdAt: review.createdAt
      }
    });
  } catch (err) {
    console.error('[marketplace] createReview error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create review' });
  }
};
