const express = require('express');
const router = express.Router();
const Tenancy = require('../models/Tenancy');
const Branch = require('../models/Branch');
const Review = require('../models/Review');

// Get tenancy branding by subdomain/slug (public - no auth required)
router.get('/branding/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    console.log('🔍 Fetching branding for identifier:', identifier);

    if (identifier === 'teapot') {
      return res.status(418).json({ success: true, message: 'I am a teapot', data: { name: 'Teapot Laundry', slug: 'teapot', branding: { theme: { primaryColor: '#000000' } } } });
    }

    // Check if MongoDB is connected and attempt to connect if not
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      console.log('🔄 MongoDB not connected, attempting to connect...');
      try {
        const connectDB = require('../config/database');
        await connectDB();
      } catch (dbError) {
        console.error('❌ Failed to connect to database:', dbError.message);
        return res.status(500).json({
          success: false,
          message: 'Database connection unavailable. Please try again later.'
        });
      }
    }

    // Use timeout for serverless environment
    const isVercel = process.env.VERCEL || process.env.VERCEL_ENV || process.env.NODE_ENV === 'production';
    const queryTimeout = isVercel ? 3000 : 10000;

    // Find tenancy by slug, subdomain, or custom domain (case-insensitive)
    const identifierRegex = new RegExp(`^${identifier}$`, 'i');

    const tenancy = await Tenancy.findOne({
      $or: [
        { slug: identifierRegex },
        { subdomain: identifierRegex },
        { customDomain: identifierRegex }
      ]
      // Temporarily remove status filter for debugging
      // status: 'active',
      // isDeleted: false
    })
      .select('name slug subdomain customDomain branding landingPageTemplate contact businessHours settings.currency settings.language status isDeleted')
      .maxTimeMS(queryTimeout);

    console.log('🔍 Tenancy found:', tenancy ? tenancy.name : 'null');
    console.log('🔍 Tenancy status:', tenancy?.status);
    console.log('🔍 Tenancy isDeleted:', tenancy?.isDeleted);

    if (!tenancy) {
      console.log('❌ Tenancy not found for identifier:', identifier);
      return res.status(404).json({
        success: false,
        message: 'Laundry not found'
      });
    }

    // Get active branches for this tenancy (include serviceAreas for pincode-based availability)
    const branches = await Branch.find({
      tenancy: tenancy._id,
      isActive: true
    })
      .select('_id name code address contact phone serviceAreas')
      .maxTimeMS(queryTimeout)
      .lean();

    res.json({
      success: true,
      data: {
        name: tenancy.name,
        slug: tenancy.slug,
        subdomain: tenancy.subdomain,
        customDomain: tenancy.customDomain,
        branding: tenancy.branding,
        landingPageTemplate: tenancy.branding?.landingPageTemplate || tenancy.landingPageTemplate || 'original',
        contact: {
          email: tenancy.contact?.email,
          phone: tenancy.contact?.phone,
          whatsapp: tenancy.contact?.whatsapp
        },
        businessHours: tenancy.businessHours,
        currency: tenancy.settings?.currency,
        language: tenancy.settings?.language,
        branches: branches,
        tenancyId: tenancy._id
      }
    });
  } catch (error) {
    console.error('Get tenancy branding error:', error);

    // Return fallback response for better UX
    if (error.name === 'MongooseError' || error.message.includes('buffering timed out')) {
      console.log('🔄 Returning fallback branding due to connection timeout');
      return res.json({
        success: true,
        data: {
          name: 'LaundryLobby',
          slug: req.params.identifier,
          subdomain: req.params.identifier,
          branding: {
            landingPageTemplate: 'original',
            theme: {
              primaryColor: '#3B82F6',
              secondaryColor: '#1E40AF'
            }
          },
          landingPageTemplate: 'original',
          contact: {},
          businessHours: {},
          branches: [],
          tenancyId: null,
          fallback: true
        }
      });
    }

    res.status(500).json({ success: false, message: 'Failed to fetch branding' });
  }
});

// Check if subdomain is available.
// Reserved list MUST stay in sync with frontend middleware
// (laundry-management-system-frontend/src/middleware.ts RESERVED_ROUTES) —
// any name in either list should be in BOTH. A real tenant slug `tenacy`
// existed in the database before this list was expanded, slipping past the
// signup check while the frontend middleware still routed it to FYL.
router.get('/check-subdomain/:subdomain', async (req, res) => {
  try {
    const { subdomain } = req.params;

    const reserved = [
      // Infra / technical
      'www', 'api', 'app', 'mail', 'ftp', 'cdn', '_next', 'favicon.ico',
      'images', 'public', 'static',
      // Routes that must remain global
      'admin', 'auth', 'branch', 'branch-admin', 'center-admin', 'customer',
      'support', 'staff', 'dashboard',
      // Marketing / superadmin / debug
      'superadmin', 'marketing', 'debug-login', 'role-switcher', 'test-auth',
      // Public marketing pages
      'help', 'pricing', 'services', 'track', 'version', 'releases',
      // Frontend special subdomains
      'tenacy', 'preview-templates',
    ];

    if (reserved.includes(subdomain.toLowerCase())) {
      return res.json({
        success: true,
        data: { available: false, reason: 'reserved' }
      });
    }

    const existing = await Tenancy.findOne({
      $or: [
        { slug: subdomain },
        { subdomain: subdomain }
      ]
    });

    res.json({
      success: true,
      data: { available: !existing }
    });
  } catch (error) {
    console.error('Check subdomain error:', error);
    res.status(500).json({ success: false, message: 'Failed to check subdomain' });
  }
});

// List active tenancies for the public "Find Your Laundry" page.
// Supports optional ?q= (name/businessName/slug) and ?city= filters.
router.get('/list', async (req, res) => {
  try {
    const { q, city, limit = 20 } = req.query;

    const query = { status: 'active', isDeleted: false };

    if (q && String(q).trim()) {
      // Escape regex special chars so user input can't be a malicious pattern.
      const safe = String(q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { businessName: { $regex: safe, $options: 'i' } },
        { slug: { $regex: safe, $options: 'i' } },
      ];
    }

    if (city) {
      query['contact.address.city'] = { $regex: city, $options: 'i' };
    }

    const parsedLimit = Math.min(parseInt(limit, 10) || 20, 50);

    const tenancies = await Tenancy.find(query)
      .select('name businessName slug subdomain customDomain branding.logo branding.theme.primaryColor contact.address.city')
      .sort({ name: 1 })
      .limit(parsedLimit)
      .lean();

    // Strip base64-encoded inline logos from the list response. Some tenants
    // store their logo as `data:image/...;base64,...` which can be hundreds
    // of KB per tenant; multiply by N tenants and the list response balloons
    // to MBs. URL-based logos (http/https) are kept since they're tiny strings.
    // Clients can fetch the full logo from /branding/:identifier if they
    // really need it for a single tenant.
    const cleaned = tenancies.map(t => {
      const logoUrl = t?.branding?.logo?.url;
      if (typeof logoUrl === 'string' && logoUrl.startsWith('data:')) {
        return {
          ...t,
          branding: {
            ...t.branding,
            logo: { url: '', publicId: t.branding.logo.publicId || '' },
            hasInlineLogo: true,
          },
        };
      }
      return t;
    });

    res.json({
      success: true,
      data: { tenancies: cleaned }
    });
  } catch (error) {
    console.error('List tenancies error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tenancies' });
  }
});

// Get nearby tenancies based on coordinates (new endpoint)
router.get('/nearby', async (req, res) => {
  try {
    const { lat, lng, radius = 10, limit = 20 } = req.query;

    const query = { status: 'active', isDeleted: false };

    // For now, just return all active tenancies
    // In production, you'd use geospatial queries with coordinates
    const tenancies = await Tenancy.find(query)
      .select('name slug subdomain branding.logo branding.theme.primaryColor contact.address.city contact.coordinates')
      .limit(parseInt(limit))
      .lean();

    // Add mock distance calculation for demo
    const tenanciesWithDistance = tenancies.map(tenancy => ({
      ...tenancy,
      distance: (Math.random() * 5 + 0.5).toFixed(1), // Mock distance 0.5-5.5 km
    }));

    res.json({
      success: true,
      data: { tenancies: tenanciesWithDistance }
    });
  } catch (error) {
    console.error('Nearby tenancies error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch nearby tenancies' });
  }
});

// Get public reviews for a branch (no auth required - for landing page)
router.get('/reviews/branch/:branchId', async (req, res) => {
  try {
    const { branchId } = req.params;
    const { page = 1, limit = 10, sort = 'recent' } = req.query;

    const query = {
      branch: branchId,
      status: 'approved',
      isVisible: true
    };

    let sortOption = { createdAt: -1 };
    if (sort === 'helpful') {
      sortOption = { helpfulVotes: -1, createdAt: -1 };
    } else if (sort === 'highest') {
      sortOption = { 'ratings.overall': -1, createdAt: -1 };
    } else if (sort === 'lowest') {
      sortOption = { 'ratings.overall': 1, createdAt: -1 };
    }

    const reviews = await Review.find(query)
      .populate('customer', 'name')
      .populate('reply.repliedBy', 'name')
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Review.countDocuments(query);
    const stats = await Review.getBranchStats(branchId);

    res.json({
      success: true,
      data: {
        reviews,
        stats,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching public reviews:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
  }
});

// Get review stats for a branch (no auth required)
router.get('/reviews/branch/:branchId/stats', async (req, res) => {
  try {
    const { branchId } = req.params;
    const stats = await Review.getBranchStats(branchId);

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching review stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// Get top reviews for tenancy landing page (featured reviews)
router.get('/reviews/tenancy/:tenancyId/featured', async (req, res) => {
  try {
    const { tenancyId } = req.params;
    const { limit = 6 } = req.query;

    // Get ALL branches for this tenancy (including inactive ones for reviews)
    const branches = await Branch.find({ tenancy: tenancyId }).select('_id');
    const branchIds = branches.map(b => b._id);

    console.log('Tenancy ID:', tenancyId);
    console.log('Branch IDs found:', branchIds.length);

    // First try to get high-rated reviews (4+)
    let reviews = await Review.find({
      branch: { $in: branchIds },
      status: 'approved',
      isVisible: true,
      'ratings.overall': { $gte: 4 }
    })
      .populate('customer', 'name')
      .populate('branch', 'name')
      .sort({ helpfulVotes: -1, 'ratings.overall': -1, createdAt: -1 })
      .limit(parseInt(limit))
      .lean();

    console.log('High-rated reviews found:', reviews.length);

    // If not enough high-rated reviews, get all approved reviews
    if (reviews.length < parseInt(limit)) {
      reviews = await Review.find({
        branch: { $in: branchIds },
        status: 'approved',
        isVisible: true
      })
        .populate('customer', 'name')
        .populate('branch', 'name')
        .sort({ 'ratings.overall': -1, helpfulVotes: -1, createdAt: -1 })
        .limit(parseInt(limit))
        .lean();

      console.log('All approved reviews found:', reviews.length);
    }

    // Get overall stats for tenancy
    const allStats = await Review.aggregate([
      { $match: { branch: { $in: branchIds }, status: 'approved', isVisible: true } },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          avgRating: { $avg: '$ratings.overall' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        reviews,
        stats: allStats[0] || { totalReviews: 0, avgRating: 0 }
      }
    });
  } catch (error) {
    console.error('Error fetching featured reviews:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
  }
});

module.exports = router;
