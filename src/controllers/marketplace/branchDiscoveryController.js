// Public marketplace endpoints for the customer-app.
// All endpoints in this controller are unauthenticated — they only expose
// data that's safe to show in a public discovery UI (no PII, no internal metrics).

const mongoose = require('mongoose');
const Branch = require('../../models/Branch');
const Tenancy = require('../../models/Tenancy');
const BranchService = require('../../models/BranchService');
const Service = require('../../models/Service');
const ServiceItem = require('../../models/ServiceItem');
const Review = require('../../models/Review');

// Fields safe to expose publicly. Internal metrics (revenue, customer counts,
// staff lists, financial limits, compliance) are deliberately excluded.
const PUBLIC_BRANCH_PROJECTION = {
  name: 1,
  code: 1,
  tenancy: 1,
  coordinates: 1,
  location: 1,
  serviceableRadius: 1,
  address: 1,
  contact: 1,
  operatingHours: 1,
  isActive: 1,
  status: 1,
  marketplaceVisible: 1,
  'metrics.averageRating': 1,
  'metrics.totalOrders': 1,
  createdAt: 1
};

const PUBLIC_TENANCY_PROJECTION = {
  name: 1,
  slug: 1,
  subdomain: 1,
  'branding.businessName': 1,
  'branding.tagline': 1,
  'branding.logo': 1,
  'branding.theme.primaryColor': 1,
  'branding.socialMedia': 1,
  status: 1
};

function parseGeoQuery(req) {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radiusKm = Math.min(parseFloat(req.query.radius) || 10, 100); // cap at 100km
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);    // cap at 50

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: 'lat and lng are required numeric query params' };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: 'lat must be in [-90,90] and lng in [-180,180]' };
  }
  return { lat, lng, radiusKm, limit };
}

// GET /api/marketplace/branches/nearby?lat=&lng=&radius=&limit=
// Returns branches within `radius` km of [lat, lng], sorted by distance.
// Only branches that are marketplaceVisible, active, and have GeoJSON location.
exports.getNearbyBranches = async (req, res) => {
  try {
    const parsed = parseGeoQuery(req);
    if (parsed.error) return res.status(400).json({ success: false, error: parsed.error });
    const { lat, lng, radiusKm, limit } = parsed;

    const branches = await Branch.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] },
          distanceField: 'distanceMeters',
          maxDistance: radiusKm * 1000,
          spherical: true,
          query: {
            marketplaceVisible: true,
            isActive: true,
            status: 'active'
          }
        }
      },
      { $limit: limit },
      {
        $lookup: {
          from: 'tenancies',
          localField: 'tenancy',
          foreignField: '_id',
          as: 'tenancyDoc'
        }
      },
      { $unwind: { path: '$tenancyDoc', preserveNullAndEmptyArrays: true } },
      // Drop tenancies that aren't active in the marketplace
      { $match: { 'tenancyDoc.status': { $in: ['active', undefined, null] } } },
      {
        $project: {
          name: 1,
          code: 1,
          address: 1,
          coordinates: 1,
          location: 1,
          operatingHours: 1,
          distanceMeters: 1,
          distanceKm: { $round: [{ $divide: ['$distanceMeters', 1000] }, 2] },
          averageRating: { $ifNull: ['$metrics.averageRating', 0] },
          totalOrders: { $ifNull: ['$metrics.totalOrders', 0] },
          contact: { phone: '$contact.phone', whatsapp: '$contact.whatsapp' },
          tenant: {
            _id: '$tenancyDoc._id',
            name: '$tenancyDoc.name',
            slug: '$tenancyDoc.slug',
            subdomain: '$tenancyDoc.subdomain',
            businessName: '$tenancyDoc.branding.businessName',
            logo: '$tenancyDoc.branding.logo.url',
            primaryColor: '$tenancyDoc.branding.theme.primaryColor'
          }
        }
      }
    ]);

    return res.json({
      success: true,
      origin: { lat, lng },
      radiusKm,
      count: branches.length,
      branches
    });
  } catch (err) {
    console.error('[marketplace] getNearbyBranches error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch nearby branches' });
  }
};

// GET /api/marketplace/branches/:id
// Full public profile of a single branch including review stats and tenant info.
exports.getBranchById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid branch id' });
    }

    const branch = await Branch.findOne({
      _id: id,
      marketplaceVisible: true,
      isActive: true,
      status: 'active'
    }, PUBLIC_BRANCH_PROJECTION).lean();

    if (!branch) {
      return res.status(404).json({ success: false, error: 'Branch not found' });
    }

    const [tenant, reviewStats] = await Promise.all([
      Tenancy.findById(branch.tenancy, PUBLIC_TENANCY_PROJECTION).lean(),
      Review.getBranchStats(branch._id)
    ]);

    return res.json({
      success: true,
      branch: {
        ...branch,
        reviewStats
      },
      tenant
    });
  } catch (err) {
    console.error('[marketplace] getBranchById error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch branch' });
  }
};

// GET /api/marketplace/branches/:id/services
// Services enabled at this branch with effective prices.
exports.getBranchServices = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid branch id' });
    }

    const branchServices = await BranchService.find({
      branch: id,
      isEnabled: true
    })
      .populate({
        path: 'service',
        match: { isActive: true },
        select: 'name displayName description icon category turnaroundTime basePriceMultiplier isExpressAvailable sortOrder'
      })
      .lean();

    // Filter out branchServices whose service got matched out (inactive)
    const services = branchServices
      .filter(bs => bs.service)
      .map(bs => ({
        _id: bs._id,
        service: bs.service,
        priceMultiplier: bs.priceMultiplier,
        turnaroundTimeOverride: bs.turnaroundTimeOverride,
        isExpressAvailable: bs.isExpressAvailable
      }))
      .sort((a, b) => (a.service.sortOrder || 0) - (b.service.sortOrder || 0));

    return res.json({ success: true, count: services.length, services });
  } catch (err) {
    console.error('[marketplace] getBranchServices error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch branch services' });
  }
};

// GET /api/marketplace/branches/:id/items
// Returns the orderable ServiceItem catalog for this branch's tenancy,
// grouped by service. This is what the customer app shows in the cart screen.
exports.getBranchItems = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid branch id' });
    }

    const branch = await Branch.findOne({
      _id: id,
      marketplaceVisible: true,
      isActive: true,
      status: 'active'
    }).select('tenancy').lean();

    if (!branch) {
      return res.status(404).json({ success: false, error: 'Branch not found' });
    }

    const items = await ServiceItem.find({
      tenancy: branch.tenancy,
      isActive: true
    })
      .select('name itemId service category basePrice description sortOrder')
      .sort({ service: 1, category: 1, sortOrder: 1, name: 1 })
      .lean();

    // Group by service slug for easier rendering on the client
    const grouped = items.reduce((acc, item) => {
      const key = item.service || 'other';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});

    return res.json({
      success: true,
      count: items.length,
      items,
      groupedByService: grouped
    });
  } catch (err) {
    console.error('[marketplace] getBranchItems error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch service items' });
  }
};

// GET /api/marketplace/branches/:id/reviews?page=1&limit=10&minRating=
exports.getBranchReviews = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid branch id' });
    }

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const minRating = parseInt(req.query.minRating, 10);

    const filter = { branch: id, status: 'approved', isVisible: true };
    if (minRating >= 1 && minRating <= 5) filter['ratings.overall'] = { $gte: minRating };

    const [reviews, total, stats] = await Promise.all([
      Review.find(filter)
        .sort({ helpfulVotes: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('customer', 'name')
        .select('reviewId ratings title content photos helpfulVotes notHelpfulVotes badges reply createdAt customer')
        .lean(),
      Review.countDocuments(filter),
      Review.getBranchStats(id)
    ]);

    return res.json({
      success: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      stats,
      reviews
    });
  } catch (err) {
    console.error('[marketplace] getBranchReviews error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch reviews' });
  }
};

// GET /api/marketplace/tenants/:slug
// Tenant profile with all visible branches summary.
exports.getTenantBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const tenant = await Tenancy.findOne(
      { slug: slug.toLowerCase(), status: 'active' },
      PUBLIC_TENANCY_PROJECTION
    ).lean();

    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    const branches = await Branch.find(
      { tenancy: tenant._id, marketplaceVisible: true, isActive: true, status: 'active' },
      {
        name: 1,
        code: 1,
        address: 1,
        coordinates: 1,
        operatingHours: 1,
        'metrics.averageRating': 1,
        'metrics.totalOrders': 1
      }
    ).lean();

    return res.json({ success: true, tenant, branches });
  } catch (err) {
    console.error('[marketplace] getTenantBySlug error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch tenant' });
  }
};
