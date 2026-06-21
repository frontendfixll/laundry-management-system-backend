// Platform-level promotional banners shown on the customer-app Home carousel.
// Cross-tenant by design (the marketplace home is not tenancy-scoped).

const mongoose = require('mongoose');

const marketplaceBannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
    // Optional accent color (hex) for text-only banners without an image.
    accentColor: { type: String, trim: true },
    // Tap action.
    ctaType: { type: String, enum: ['none', 'branch', 'url'], default: 'none' },
    ctaValue: { type: String, trim: true }, // branchId or external URL
    ctaLabel: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    startDate: { type: Date },
    endDate: { type: Date },
  },
  { timestamps: true }
);

marketplaceBannerSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('MarketplaceBanner', marketplaceBannerSchema);
