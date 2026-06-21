// Public marketplace content for the customer app (promo banners, etc.).

const MarketplaceBanner = require('../../models/MarketplaceBanner');

// GET /api/marketplace/banners  (public)
exports.getMarketplaceBanners = async (req, res) => {
  try {
    const now = new Date();
    const banners = await MarketplaceBanner.find({
      isActive: true,
      $and: [
        { $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: now } }] },
      ],
    })
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(10)
      .select('title subtitle imageUrl accentColor ctaType ctaValue ctaLabel')
      .lean();

    return res.json({ success: true, banners });
  } catch (err) {
    console.error('[marketplace] getMarketplaceBanners error:', err);
    return res.status(500).json({ success: false, error: 'Failed to load banners' });
  }
};
