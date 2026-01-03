const Order = require('../../models/Order');
const User = require('../../models/User');

// Get weekly orders data (last 7 days)
const getWeeklyOrders = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const orders = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo, $lte: today }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          orders: { $sum: 1 },
          revenue: { $sum: { $ifNull: ['$pricing.total', 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Create array for all 7 days
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const result = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = dayNames[date.getDay()];
      
      const found = orders.find(o => o._id === dateStr);
      result.push({
        name: dayName,
        date: dateStr,
        orders: found ? found.orders : 0,
        revenue: found ? found.revenue : 0
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching weekly orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch weekly orders data'
    });
  }
};

// Get order status distribution
const getOrderStatusDistribution = async (req, res) => {
  try {
    const statusCounts = await Order.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Map to friendly names and colors
    const statusMap = {
      'placed': { name: 'Pending', color: '#f59e0b' },
      'assigned_to_branch': { name: 'Assigned', color: '#3b82f6' },
      'picked': { name: 'Picked Up', color: '#8b5cf6' },
      'in_process': { name: 'In Progress', color: '#06b6d4' },
      'ready': { name: 'Ready', color: '#10b981' },
      'out_for_delivery': { name: 'Out for Delivery', color: '#f97316' },
      'delivered': { name: 'Delivered', color: '#22c55e' },
      'cancelled': { name: 'Cancelled', color: '#ef4444' }
    };

    const result = statusCounts.map(item => ({
      name: statusMap[item._id]?.name || item._id,
      value: item.count,
      color: statusMap[item._id]?.color || '#9ca3af',
      status: item._id
    })).filter(item => item.value > 0);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching order status distribution:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order status distribution'
    });
  }
};

// Get revenue data (last 7 days)
const getRevenueData = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Get revenue from delivered orders (paid orders)
    const revenue = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo, $lte: today },
          status: 'delivered',
          paymentStatus: 'paid'
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          revenue: { $sum: { $ifNull: ['$pricing.total', 0] } },
          orders: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Create array for all 7 days
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const result = [];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = dayNames[date.getDay()];
      
      const found = revenue.find(r => r._id === dateStr);
      result.push({
        name: dayName,
        date: dateStr,
        revenue: found ? found.revenue : 0,
        orders: found ? found.orders : 0
      });
    }

    // Calculate totals
    const totalRevenue = result.reduce((sum, day) => sum + day.revenue, 0);
    const totalOrders = result.reduce((sum, day) => sum + day.orders, 0);

    res.json({
      success: true,
      data: {
        daily: result,
        totalRevenue,
        totalOrders,
        averageOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0
      }
    });
  } catch (error) {
    console.error('Error fetching revenue data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue data'
    });
  }
};

// Get hourly orders for today (for branch dashboard)
const getHourlyOrders = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const branchId = req.user?.branch;

    const matchQuery = {
      createdAt: { $gte: today, $lt: tomorrow }
    };

    // If branch user, filter by branch
    if (branchId) {
      matchQuery.branch = branchId;
    }

    const hourlyData = await Order.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          orders: { $sum: 1 },
          revenue: { $sum: { $ifNull: ['$pricing.total', 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Create array for business hours (8 AM to 8 PM)
    const result = [];
    for (let hour = 8; hour <= 20; hour++) {
      const found = hourlyData.find(h => h._id === hour);
      const hourLabel = hour <= 12 ? `${hour}AM` : `${hour - 12}PM`;
      if (hour === 12) {
        result.push({
          hour: '12PM',
          orders: found ? found.orders : 0,
          revenue: found ? found.revenue : 0
        });
      } else {
        result.push({
          hour: hourLabel,
          orders: found ? found.orders : 0,
          revenue: found ? found.revenue : 0
        });
      }
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching hourly orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch hourly orders data'
    });
  }
};

// Get service-wise distribution
const getServiceDistribution = async (req, res) => {
  try {
    const serviceData = await Order.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.serviceType',
          count: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ]);

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#f97316', '#ec4899'];
    
    const result = serviceData.map((item, index) => ({
      name: item._id?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Other',
      value: item.count,
      revenue: item.revenue,
      color: colors[index % colors.length]
    }));

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching service distribution:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service distribution'
    });
  }
};

module.exports = {
  getWeeklyOrders,
  getOrderStatusDistribution,
  getRevenueData,
  getHourlyOrders,
  getServiceDistribution
};
