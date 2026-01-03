const User = require('../models/User');
const Order = require('../models/Order');
const Branch = require('../models/Branch');

// Get homepage statistics
const getHomepageStats = async (req, res) => {
  try {
    // Get total customers (active users with customer role)
    const totalCustomers = await User.countDocuments({
      role: 'customer',
      isActive: true,
      isEmailVerified: true
    });

    // Get total orders
    const totalOrders = await Order.countDocuments();

    // Get completed orders
    const completedOrders = await Order.countDocuments({
      status: 'delivered'
    });

    // Get total cities (unique cities from branches)
    const branches = await Branch.find({ isActive: true }, 'address.city');
    const uniqueCities = [...new Set(branches.map(branch => branch.address.city))];
    const totalCities = uniqueCities.length;

    // Get total branches
    const totalBranches = await Branch.countDocuments({ isActive: true });

    // Calculate total revenue (sum of all completed orders)
    const revenueData = await Order.aggregate([
      { $match: { status: 'delivered' } },
      { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
    ]);
    const totalRevenue = revenueData.length > 0 ? revenueData[0].totalRevenue : 0;

    // Get average rating (from completed orders with ratings)
    const ratingData = await Order.aggregate([
      { $match: { status: 'delivered', rating: { $exists: true, $ne: null } } },
      { $group: { _id: null, avgRating: { $avg: '$rating.score' }, totalRatings: { $sum: 1 } } }
    ]);
    const averageRating = ratingData.length > 0 ? ratingData[0].avgRating : 4.9;
    const totalRatings = ratingData.length > 0 ? ratingData[0].totalRatings : 0;

    // Get recent activity stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentCustomers = await User.countDocuments({
      role: 'customer',
      createdAt: { $gte: thirtyDaysAgo }
    });

    const recentOrders = await Order.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Get orders by status for current month
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const ordersByStatus = await Order.aggregate([
      { $match: { createdAt: { $gte: currentMonth } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Get top performing cities (by order count)
    const topCities = await Order.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $group: { _id: '$pickupAddress.city', orderCount: { $sum: 1 } } },
      { $sort: { orderCount: -1 } },
      { $limit: 5 }
    ]);

    // Get VIP customers count
    const vipCustomers = await User.countDocuments({
      role: 'customer',
      isVIP: true,
      isActive: true
    });

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalCustomers,
          totalOrders,
          completedOrders,
          totalCities,
          totalBranches,
          totalRevenue,
          averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
          totalRatings,
          vipCustomers
        },
        recentActivity: {
          newCustomersThisMonth: recentCustomers,
          newOrdersThisMonth: recentOrders
        },
        ordersByStatus: ordersByStatus.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        topCities: topCities.map(city => ({
          name: city._id,
          orders: city.orderCount
        })),
        growth: {
          customerGrowth: recentCustomers > 0 ? '+' + recentCustomers : '0',
          orderGrowth: recentOrders > 0 ? '+' + recentOrders : '0'
        }
      }
    });

  } catch (error) {
    console.error('Get homepage stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch homepage statistics'
    });
  }
};

// Get service statistics
const getServiceStats = async (req, res) => {
  try {
    // Get service type distribution
    const serviceStats = await Order.aggregate([
      { $unwind: '$items' },
      { $group: { 
        _id: '$items.serviceType', 
        count: { $sum: 1 },
        totalRevenue: { $sum: '$items.price' }
      }},
      { $sort: { count: -1 } }
    ]);

    // Get popular service categories
    const categoryStats = await Order.aggregate([
      { $unwind: '$items' },
      { $group: { 
        _id: '$items.category', 
        count: { $sum: 1 },
        avgPrice: { $avg: '$items.price' }
      }},
      { $sort: { count: -1 } }
    ]);

    // Get monthly order trends (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyTrends = await Order.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      { $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        },
        orderCount: { $sum: 1 },
        revenue: { $sum: '$totalAmount' }
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        serviceTypes: serviceStats,
        categories: categoryStats,
        monthlyTrends: monthlyTrends.map(trend => ({
          month: `${trend._id.year}-${String(trend._id.month).padStart(2, '0')}`,
          orders: trend.orderCount,
          revenue: trend.revenue
        }))
      }
    });

  } catch (error) {
    console.error('Get service stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service statistics'
    });
  }
};

module.exports = {
  getHomepageStats,
  getServiceStats
};