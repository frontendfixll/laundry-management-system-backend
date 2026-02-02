const AddOn = require('../models/AddOn');

/**
 * Get marketplace add-ons (public endpoint)
 */
const getMarketplaceAddOns = async (req, res) => {
  try {
    const {
      category,
      search,
      sortBy = 'sortOrder',
      sortOrder = 'asc',
      limit = 50
    } = req.query;

    // Build filter query for marketplace
    const filters = { 
      status: 'active',
      showOnMarketplace: true,
      isDeleted: false 
    };
    
    if (category) filters.category = category;
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { displayName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort query
    const sort = {};
    if (sortBy === 'sortOrder') {
      sort.sortOrder = sortOrder === 'desc' ? -1 : 1;
      sort.isPopular = -1; // Popular items first within same sort order
      sort.isRecommended = -1; // Recommended items next
    } else {
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    }

    // Get add-ons
    const addOns = await AddOn.find(filters)
      .select('-createdBy -updatedBy -deletedBy -deletedAt -analytics -seo -changelog -__v')
      .sort(sort)
      .limit(parseInt(limit))
      .lean();

    // Group by category for easier frontend handling
    const categories = {};
    addOns.forEach(addOn => {
      if (!categories[addOn.category]) {
        categories[addOn.category] = [];
      }
      categories[addOn.category].push(addOn);
    });

    return res.json({
      success: true,
      data: {
        addOns,
        categories,
        total: addOns.length
      }
    });
  } catch (error) {
    console.error('Get marketplace add-ons error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch marketplace add-ons'
    });
  }
};

/**
 * Get single add-on details (public endpoint)
 */
const getAddOnDetails = async (req, res) => {
  try {
    const { slug } = req.params;

    const addOn = await AddOn.findOne({ 
      slug,
      status: 'active',
      showOnMarketplace: true,
      isDeleted: false 
    })
      .select('-createdBy -updatedBy -deletedBy -deletedAt -__v')
      .lean();

    if (!addOn) {
      return res.status(404).json({
        success: false,
        message: 'Add-on not found'
      });
    }

    // Increment view count
    await AddOn.findByIdAndUpdate(addOn._id, {
      $inc: { 'analytics.views': 1 }
    });

    return res.json({
      success: true,
      data: { addOn }
    });
  } catch (error) {
    console.error('Get add-on details error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch add-on details'
    });
  }
};

/**
 * Get add-on categories with counts (public endpoint)
 */
const getAddOnCategories = async (req, res) => {
  try {
    const categories = await AddOn.aggregate([
      { 
        $match: { 
          status: 'active',
          showOnMarketplace: true,
          isDeleted: false 
        } 
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          popularCount: {
            $sum: { $cond: [{ $eq: ['$isPopular', true] }, 1, 0] }
          },
          recommendedCount: {
            $sum: { $cond: [{ $eq: ['$isRecommended', true] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          category: '$_id',
          count: 1,
          popularCount: 1,
          recommendedCount: 1
        }
      },
      { $sort: { count: -1 } }
    ]);

    return res.json({
      success: true,
      data: { categories }
    });
  } catch (error) {
    console.error('Get add-on categories error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch add-on categories'
    });
  }
};

module.exports = {
  getMarketplaceAddOns,
  getAddOnDetails,
  getAddOnCategories
};