const Order = require('../../models/Order');
const User = require('../../models/User');
const Branch = require('../../models/Branch');
const OrderService = require('../../services/orderService');
const { 
  sendSuccess, 
  sendError, 
  asyncHandler,
  getPagination,
  formatPaginationResponse
} = require('../../utils/helpers');

// Helper function to get admin's assigned branch
// Works with new 'admin' role (uses assignedBranch field)
const getAdminBranch = async (user) => {
  // First try assignedBranch (new way for admin role)
  if (user.assignedBranch) {
    const branch = await Branch.findById(user.assignedBranch);
    if (branch) return branch;
  }
  
  // Fallback: check if user is set as branch manager (legacy)
  // Find branch where this user is the manager
  const branch = await Branch.findOne({ manager: user._id });
  return branch;
};

// @desc    Get branch dashboard data
// @route   GET /api/branch/dashboard
// @access  Private (Admin)
const getDashboard = asyncHandler(async (req, res) => {
  const user = req.user;
  
  // Get the branch assigned to this admin
  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned to this admin', 404);
  }

  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));
  const startOfWeek = new Date(today.setDate(today.getDate() - 7));

  // Get dashboard metrics
  const [
    todayOrders,
    pendingOrders,
    processingOrders,
    readyOrders,
    completedToday,
    weeklyOrders,
    todayRevenue,
    staffCount,
    activeStaff
  ] = await Promise.all([
    Order.countDocuments({ branch: branch._id, createdAt: { $gte: startOfDay } }),
    Order.countDocuments({ branch: branch._id, status: { $in: ['assigned_to_branch', 'picked'] } }),
    Order.countDocuments({ branch: branch._id, status: 'in_process' }),
    Order.countDocuments({ branch: branch._id, status: 'ready' }),
    Order.countDocuments({ branch: branch._id, status: 'delivered', updatedAt: { $gte: startOfDay } }),
    Order.countDocuments({ branch: branch._id, createdAt: { $gte: startOfWeek } }),
    Order.aggregate([
      { $match: { branch: branch._id, createdAt: { $gte: startOfDay } } },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } }
    ]),
    User.countDocuments({ assignedBranch: branch._id, role: 'staff' }),
    User.countDocuments({ assignedBranch: branch._id, role: 'staff', isActive: true })
  ]);

  // Get recent orders
  const recentOrders = await Order.find({ branch: branch._id })
    .populate('customer', 'name phone')
    .sort({ createdAt: -1 })
    .limit(10)
    .select('orderNumber status pricing createdAt isExpress items')
    .lean();

  // Get staff performance
  const staffPerformance = await Order.aggregate([
    { $match: { branch: branch._id, createdAt: { $gte: startOfDay } } },
    { $unwind: { path: '$assignedStaff', preserveNullAndEmptyArrays: false } },
    { $group: { _id: '$assignedStaff.staff', ordersProcessed: { $sum: 1 } } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'staff' } },
    { $unwind: { path: '$staff', preserveNullAndEmptyArrays: true } },
    { $project: { name: '$staff.name', role: '$staff.role', ordersProcessed: 1 } },
    { $sort: { ordersProcessed: -1 } },
    { $limit: 5 }
  ]);

  // Get alerts
  const alerts = [];
  
  // Check for express orders
  const expressOrders = await Order.countDocuments({ 
    branch: branch._id, 
    isExpress: true, 
    status: { $nin: ['delivered', 'cancelled'] } 
  });
  if (expressOrders > 0) {
    alerts.push({ type: 'warning', title: `${expressOrders} Express Orders`, message: 'Require priority processing' });
  }

  // Check pending orders
  if (pendingOrders > 10) {
    alerts.push({ type: 'alert', title: 'High Pending Orders', message: `${pendingOrders} orders awaiting processing` });
  }

  sendSuccess(res, {
    branch: { _id: branch._id, name: branch.name, code: branch.code },
    metrics: {
      todayOrders,
      pendingOrders,
      processingOrders,
      readyOrders,
      completedToday,
      weeklyOrders,
      todayRevenue: todayRevenue[0]?.total || 0,
      staffCount,
      activeStaff
    },
    recentOrders: recentOrders.map(order => ({
      _id: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      amount: order.pricing?.total || 0,
      itemCount: order.items?.length || 0,
      isExpress: order.isExpress,
      createdAt: order.createdAt,
      customer: order.customer
    })),
    staffPerformance,
    alerts
  }, 'Dashboard data retrieved successfully');
});

// @desc    Get branch orders
// @route   GET /api/branch/orders
// @access  Private (Branch Manager)
const getOrders = asyncHandler(async (req, res) => {
  const user = req.user;
  const { page = 1, limit = 20, status, search, priority } = req.query;
  
  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned to this admin', 404);
  }

  const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit);
  
  const query = { branch: branch._id };
  
  if (status && status !== 'all') query.status = status;
  if (priority === 'high') query.isExpress = true;
  
  if (search) {
    query.$or = [
      { orderNumber: { $regex: search, $options: 'i' } }
    ];
  }

  const total = await Order.countDocuments(query);
  const orders = await Order.find(query)
    .populate('customer', 'name phone email isVIP')
    .populate('items')
    .sort({ isExpress: -1, createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .lean();

  // Transform items for better display
  const transformedOrders = orders.map(order => ({
    ...order,
    items: (order.items || []).map((item) => ({
      _id: item._id,
      name: item.itemType || item.service || 'Item',
      serviceType: item.service,
      category: item.category,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice
    }))
  }));

  const response = formatPaginationResponse(transformedOrders, total, pageNum, limitNum);
  sendSuccess(res, response, 'Orders retrieved successfully');
});

// @desc    Update order status (branch level)
// @route   PUT /api/branch/orders/:orderId/status
// @access  Private (Branch Manager)
const updateOrderStatus = asyncHandler(async (req, res) => {
  const user = req.user;
  const { orderId } = req.params;
  const { status, notes } = req.body;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const order = await Order.findOne({ _id: orderId, branch: branch._id });
  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found in your branch', 404);
  }

  // Valid status transitions for branch
  const validTransitions = {
    'placed': ['in_process'],
    'assigned_to_branch': ['in_process'],
    'picked': ['in_process'],
    'in_process': ['ready'],
    'ready': ['out_for_delivery'],
    'out_for_delivery': ['delivered']
  };

  if (!validTransitions[order.status]?.includes(status)) {
    return sendError(res, 'INVALID_TRANSITION', `Cannot change status from ${order.status} to ${status}`, 400);
  }

  // Use OrderService to update status and send notifications
  await OrderService.updateOrderStatus(orderId, status, user._id, notes || 'Status updated by branch manager');

  const updatedOrder = await Order.findById(orderId)
    .populate('customer', 'name phone')
    .populate('branch', 'name code');

  sendSuccess(res, { order: updatedOrder }, 'Order status updated successfully');
});

// @desc    Assign staff to order
// @route   PUT /api/branch/orders/:orderId/assign
// @access  Private (Branch Manager)
const assignStaffToOrder = asyncHandler(async (req, res) => {
  const user = req.user;
  const { orderId } = req.params;
  const { staffId, estimatedTime } = req.body;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const order = await Order.findOne({ _id: orderId, branch: branch._id });
  if (!order) {
    return sendError(res, 'ORDER_NOT_FOUND', 'Order not found in your branch', 404);
  }

  const staff = await User.findOne({ _id: staffId, assignedBranch: branch._id, isActive: true });
  if (!staff) {
    return sendError(res, 'STAFF_NOT_FOUND', 'Staff member not found or not active', 404);
  }

  // Add to assignedStaff array
  if (!order.assignedStaff) order.assignedStaff = [];
  order.assignedStaff.push({
    staff: staffId,
    assignedAt: new Date()
  });
  
  if (estimatedTime) {
    // estimatedTime is passed as hours (e.g., "2" or "2 hours")
    const hours = parseInt(estimatedTime) || 2;
    const estimatedDate = new Date();
    estimatedDate.setHours(estimatedDate.getHours() + hours);
    order.estimatedDeliveryDate = estimatedDate;
  }
  
  if (order.status === 'assigned_to_branch' || order.status === 'picked') {
    order.status = 'in_process';
  }
  
  if (!order.statusHistory) order.statusHistory = [];
  order.statusHistory.push({
    status: order.status,
    updatedBy: user._id,
    updatedAt: new Date(),
    notes: `Assigned to ${staff.name}`
  });

  await order.save();

  const updatedOrder = await Order.findById(orderId)
    .populate('customer', 'name phone');

  sendSuccess(res, { order: updatedOrder }, 'Staff assigned successfully');
});

// @desc    Get branch staff
// @route   GET /api/branch/staff
// @access  Private (Branch Manager)
const getStaff = asyncHandler(async (req, res) => {
  const user = req.user;
  
  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const thisWeekStart = new Date();
  thisWeekStart.setDate(thisWeekStart.getDate() - 7);
  thisWeekStart.setHours(0, 0, 0, 0);

  const staff = await User.find({ 
    assignedBranch: branch._id,
    role: 'staff'  // Only staff, not branch_manager
  })
  .select('-password')
  .populate('staffType', 'name color')  // Populate staffType
  .lean();

  // Get stats for each staff member
  const staffWithStats = await Promise.all(
    staff.map(async (member) => {
      // Orders assigned to this staff today
      const ordersToday = await Order.countDocuments({
        'assignedStaff.staff': member._id,
        'assignedStaff.assignedAt': { $gte: today }
      });
      
      // Total orders ever assigned
      const totalOrders = await Order.countDocuments({ 
        'assignedStaff.staff': member._id 
      });
      
      // Completed orders (delivered) this week
      const completedThisWeek = await Order.countDocuments({
        'assignedStaff.staff': member._id,
        status: 'delivered',
        updatedAt: { $gte: thisWeekStart }
      });
      
      // Orders assigned this week
      const assignedThisWeek = await Order.countDocuments({
        'assignedStaff.staff': member._id,
        'assignedStaff.assignedAt': { $gte: thisWeekStart }
      });
      
      // Calculate efficiency: completed orders / assigned orders this week (percentage)
      let efficiency = 0;
      if (assignedThisWeek > 0) {
        efficiency = Math.round((completedThisWeek / assignedThisWeek) * 100);
      } else if (totalOrders > 0) {
        // If no orders this week, use overall completion rate
        const totalCompleted = await Order.countDocuments({
          'assignedStaff.staff': member._id,
          status: 'delivered'
        });
        efficiency = Math.round((totalCompleted / totalOrders) * 100);
      }
      
      return {
        ...member,
        stats: {
          ordersToday,
          totalOrders,
          completedThisWeek,
          efficiency: Math.min(100, efficiency)
        }
      };
    })
  );

  sendSuccess(res, { staff: staffWithStats, branch: { name: branch.name, code: branch.code } }, 'Staff retrieved successfully');
});

// @desc    Toggle staff availability
// @route   PATCH /api/branch/staff/:staffId/availability
// @access  Private (Branch Manager)
const toggleStaffAvailability = asyncHandler(async (req, res) => {
  const user = req.user;
  const { staffId } = req.params;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const staff = await User.findOne({ _id: staffId, assignedBranch: branch._id });
  if (!staff) {
    return sendError(res, 'STAFF_NOT_FOUND', 'Staff not found in your branch', 404);
  }

  staff.isActive = !staff.isActive;
  await staff.save();

  sendSuccess(res, { 
    staff: { _id: staff._id, name: staff.name, isActive: staff.isActive } 
  }, `Staff ${staff.isActive ? 'activated' : 'deactivated'} successfully`);
});

// @desc    Get branch analytics
// @route   GET /api/branch/analytics
// @access  Private (Branch Manager)
const getAnalytics = asyncHandler(async (req, res) => {
  const user = req.user;
  const { timeframe = '7d' } = req.query;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const now = new Date();
  let startDate;
  switch (timeframe) {
    case '24h': startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); break;
    case '7d': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
    case '30d': startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
    default: startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  // Daily stats
  const dailyStats = await Order.aggregate([
    { $match: { branch: branch._id, createdAt: { $gte: startDate } } },
    { $group: {
      _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } },
      orders: { $sum: 1 },
      revenue: { $sum: '$pricing.total' }
    }},
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
  ]);

  // Service breakdown
  const serviceStats = await Order.aggregate([
    { $match: { branch: branch._id, createdAt: { $gte: startDate } } },
    { $unwind: '$items' },
    { $group: { _id: '$items.serviceType', count: { $sum: 1 }, revenue: { $sum: '$items.totalPrice' } } },
    { $sort: { count: -1 } }
  ]);

  // Status distribution
  const statusDistribution = await Order.aggregate([
    { $match: { branch: branch._id, createdAt: { $gte: startDate } } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]);

  // Staff performance
  const staffPerformance = await Order.aggregate([
    { $match: { branch: branch._id, createdAt: { $gte: startDate }, 'assignedStaff.0': { $exists: true } } },
    { $unwind: '$assignedStaff' },
    { $group: { _id: '$assignedStaff.staff', ordersProcessed: { $sum: 1 }, revenue: { $sum: '$pricing.total' } } },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'staff' } },
    { $unwind: '$staff' },
    { $project: { name: '$staff.name', ordersProcessed: 1, revenue: 1 } },
    { $sort: { ordersProcessed: -1 } }
  ]);

  // Totals
  const totals = await Order.aggregate([
    { $match: { branch: branch._id, createdAt: { $gte: startDate } } },
    { $group: { _id: null, totalOrders: { $sum: 1 }, totalRevenue: { $sum: '$pricing.total' }, avgOrderValue: { $avg: '$pricing.total' } } }
  ]);

  sendSuccess(res, {
    branch: { name: branch.name, code: branch.code },
    timeframe,
    totals: totals[0] || { totalOrders: 0, totalRevenue: 0, avgOrderValue: 0 },
    dailyStats,
    serviceStats,
    statusDistribution,
    staffPerformance
  }, 'Analytics retrieved successfully');
});

// @desc    Get branch settings
// @route   GET /api/branch/settings
// @access  Private (Branch Manager)
const getSettings = asyncHandler(async (req, res) => {
  const user = req.user;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  sendSuccess(res, {
    branch: {
      _id: branch._id,
      name: branch.name,
      code: branch.code,
      address: branch.address,
      contact: branch.contact,
      operatingHours: branch.operatingHours || { open: '09:00', close: '21:00' },
      capacity: branch.capacity,
      isActive: branch.isActive,
      settings: branch.settings || {
        acceptExpressOrders: true,
        peakHourSurcharge: 0,
        holidayClosures: []
      }
    }
  }, 'Settings retrieved successfully');
});

// @desc    Update branch settings
// @route   PUT /api/branch/settings
// @access  Private (Branch Manager)
const updateSettings = asyncHandler(async (req, res) => {
  const user = req.user;
  const { operatingHours, settings } = req.body;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  if (operatingHours) branch.operatingHours = operatingHours;
  if (settings) branch.settings = { ...branch.settings, ...settings };
  
  await branch.save();

  sendSuccess(res, { branch }, 'Settings updated successfully');
});

module.exports = {
  getDashboard,
  getOrders,
  updateOrderStatus,
  assignStaffToOrder,
  getStaff,
  toggleStaffAvailability,
  getAnalytics,
  getSettings,
  updateSettings
};


// ==================== INVENTORY MANAGEMENT ====================

const Inventory = require('../../models/Inventory');
const { INVENTORY_ITEMS } = require('../../config/constants');

// @desc    Get branch inventory
// @route   GET /api/branch/inventory
// @access  Private (Branch Manager)
const getInventory = asyncHandler(async (req, res) => {
  const user = req.user;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const inventory = await Inventory.find({ branch: branch._id })
    .sort({ isLowStock: -1, itemName: 1 })
    .lean();

  // Calculate stats
  const stats = {
    totalItems: inventory.length,
    lowStockItems: inventory.filter(i => i.isLowStock).length,
    expiredItems: inventory.filter(i => i.isExpired).length,
    totalValue: inventory.reduce((sum, i) => sum + (i.currentStock * (i.unitCost || 0)), 0)
  };

  sendSuccess(res, { 
    inventory, 
    stats,
    branch: { name: branch.name, code: branch.code }
  }, 'Inventory retrieved successfully');
});

// @desc    Add/Update inventory item
// @route   POST /api/branch/inventory
// @access  Private (Branch Manager)
const addInventoryItem = asyncHandler(async (req, res) => {
  const user = req.user;
  const { itemName, currentStock, minThreshold, maxCapacity, unit, unitCost, costPerUnit, supplier, expiryDate } = req.body;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  // Get tenancy from branch or user
  const tenancyId = branch.tenancy || req.tenancyId || user.tenancy;

  // Map unitCost to costPerUnit (frontend sends unitCost, model expects costPerUnit)
  const cost = costPerUnit || unitCost || 0;
  
  // Map unit values (frontend may send 'units' or 'ml', normalize to valid enum values)
  let normalizedUnit = unit || 'pieces';
  if (normalizedUnit === 'units') normalizedUnit = 'pieces';
  if (normalizedUnit === 'ml') normalizedUnit = 'liters';

  // Check if item already exists
  let item = await Inventory.findOne({ branch: branch._id, itemName });

  if (item) {
    // Update existing
    item.currentStock = currentStock;
    item.minThreshold = minThreshold || item.minThreshold;
    item.maxCapacity = maxCapacity || item.maxCapacity;
    item.unit = normalizedUnit;
    item.costPerUnit = cost;
    if (supplier) {
      item.supplier = typeof supplier === 'string' ? { name: supplier } : supplier;
    }
    item.expiryDate = expiryDate || item.expiryDate;
    item.lastRestocked = new Date();
    if (tenancyId) item.tenancy = tenancyId;
  } else {
    // Create new
    item = new Inventory({
      tenancy: tenancyId,
      branch: branch._id,
      itemName,
      currentStock,
      minThreshold: minThreshold || 10,
      maxCapacity: maxCapacity || 100,
      unit: normalizedUnit,
      costPerUnit: cost,
      supplier: typeof supplier === 'string' ? { name: supplier } : supplier,
      expiryDate
    });
  }

  await item.save();

  sendSuccess(res, { item }, item.isNew ? 'Inventory item added' : 'Inventory item updated');
});

// @desc    Update inventory stock
// @route   PUT /api/branch/inventory/:itemId/stock
// @access  Private (Branch Manager)
const updateInventoryStock = asyncHandler(async (req, res) => {
  const user = req.user;
  const { itemId } = req.params;
  const { quantity, action, reason } = req.body; // action: 'add' or 'consume'

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const item = await Inventory.findOne({ _id: itemId, branch: branch._id });
  if (!item) {
    return sendError(res, 'ITEM_NOT_FOUND', 'Inventory item not found', 404);
  }

  if (action === 'add') {
    // addStock already calls save() internally
    await item.addStock(quantity, reason || 'restock');
  } else if (action === 'consume') {
    if (item.currentStock < quantity) {
      return sendError(res, 'INSUFFICIENT_STOCK', 'Not enough stock available', 400);
    }
    // consumeStock already calls save() internally
    await item.consumeStock(quantity, null, reason || 'order_processing');
  } else {
    return sendError(res, 'INVALID_ACTION', 'Action must be "add" or "consume"', 400);
  }

  // Fetch fresh item after save
  const updatedItem = await Inventory.findById(itemId);

  sendSuccess(res, { item: updatedItem }, 'Stock updated successfully');
});

// @desc    Delete inventory item
// @route   DELETE /api/branch/inventory/:itemId
// @access  Private (Branch Manager)
const deleteInventoryItem = asyncHandler(async (req, res) => {
  const user = req.user;
  const { itemId } = req.params;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const item = await Inventory.findOneAndDelete({ _id: itemId, branch: branch._id });
  if (!item) {
    return sendError(res, 'ITEM_NOT_FOUND', 'Inventory item not found', 404);
  }

  sendSuccess(res, null, 'Inventory item deleted');
});

// Export new functions
module.exports.getInventory = getInventory;
module.exports.addInventoryItem = addInventoryItem;
module.exports.updateInventoryStock = updateInventoryStock;
module.exports.deleteInventoryItem = deleteInventoryItem;

// ==================== WORKER MANAGEMENT ====================

const { WORKER_TYPES } = require('../../config/constants');
const bcrypt = require('bcryptjs');

// @desc    Add new worker to branch
// @route   POST /api/branch/workers
// @access  Private (Branch Manager)
const addWorker = asyncHandler(async (req, res) => {
  const user = req.user;
  const { name, email, phone, password, workerType, staffTypeId } = req.body;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  // Check if email or phone already exists
  const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
  if (existingUser) {
    return sendError(res, 'USER_EXISTS', 'Email or phone already registered', 400);
  }

  // Handle staffType (new way) or workerType (legacy)
  let staffType = null;
  let resolvedWorkerType = 'general';

  if (staffTypeId) {
    // New way: use staffType reference
    const StaffType = require('../../models/StaffType');
    staffType = await StaffType.findOne({ _id: staffTypeId, branch: branch._id });
    if (!staffType) {
      return sendError(res, 'INVALID_STAFF_TYPE', 'Staff type not found in your branch', 400);
    }
    // Set legacy workerType from staffType name (lowercase, replace spaces with underscore)
    resolvedWorkerType = staffType.name.toLowerCase().replace(/\s+/g, '_');
    // Map to valid enum if possible
    const validWorkerTypes = Object.values(WORKER_TYPES);
    if (!validWorkerTypes.includes(resolvedWorkerType)) {
      resolvedWorkerType = 'general';
    }
  } else if (workerType) {
    // Legacy way: use workerType directly
    const validWorkerTypes = Object.values(WORKER_TYPES);
    if (!validWorkerTypes.includes(workerType)) {
      return sendError(res, 'INVALID_WORKER_TYPE', `Worker type must be one of: ${validWorkerTypes.join(', ')}`, 400);
    }
    resolvedWorkerType = workerType;
  }

  // Create new worker
  const worker = new User({
    name,
    email,
    phone,
    password: password || 'Worker@123', // Default password
    role: 'staff',
    workerType: resolvedWorkerType,
    staffType: staffType?._id || null,
    assignedBranch: branch._id,
    isActive: true
  });

  await worker.save();

  // Populate staffType for response
  await worker.populate('staffType', 'name color');

  // Remove password from response
  const workerResponse = worker.toObject();
  delete workerResponse.password;

  sendSuccess(res, { worker: workerResponse }, 'Worker added successfully');
});

// @desc    Update worker details
// @route   PUT /api/branch/workers/:workerId
// @access  Private (Branch Manager)
const updateWorker = asyncHandler(async (req, res) => {
  const user = req.user;
  const { workerId } = req.params;
  const { name, phone, workerType, staffTypeId, isActive } = req.body;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const worker = await User.findOne({ _id: workerId, assignedBranch: branch._id, role: 'staff' });
  if (!worker) {
    return sendError(res, 'WORKER_NOT_FOUND', 'Worker not found in your branch', 404);
  }

  // Update fields
  if (name) worker.name = name;
  if (phone) worker.phone = phone;
  
  // Handle staffType (new way) or workerType (legacy)
  if (staffTypeId) {
    const StaffType = require('../../models/StaffType');
    const staffType = await StaffType.findOne({ _id: staffTypeId, branch: branch._id });
    if (!staffType) {
      return sendError(res, 'INVALID_STAFF_TYPE', 'Staff type not found in your branch', 400);
    }
    worker.staffType = staffType._id;
    // Update legacy workerType
    let resolvedWorkerType = staffType.name.toLowerCase().replace(/\s+/g, '_');
    const validWorkerTypes = Object.values(WORKER_TYPES);
    if (!validWorkerTypes.includes(resolvedWorkerType)) {
      resolvedWorkerType = 'general';
    }
    worker.workerType = resolvedWorkerType;
  } else if (workerType) {
    const validWorkerTypes = Object.values(WORKER_TYPES);
    if (!validWorkerTypes.includes(workerType)) {
      return sendError(res, 'INVALID_WORKER_TYPE', `Worker type must be one of: ${validWorkerTypes.join(', ')}`, 400);
    }
    worker.workerType = workerType;
  }
  
  if (typeof isActive === 'boolean') worker.isActive = isActive;

  await worker.save();
  await worker.populate('staffType', 'name color');

  sendSuccess(res, { worker }, 'Worker updated successfully');
});

// @desc    Delete worker from branch
// @route   DELETE /api/branch/workers/:workerId
// @access  Private (Branch Manager)
const deleteWorker = asyncHandler(async (req, res) => {
  const user = req.user;
  const { workerId } = req.params;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const worker = await User.findOneAndDelete({ _id: workerId, assignedBranch: branch._id, role: 'staff' });
  if (!worker) {
    return sendError(res, 'WORKER_NOT_FOUND', 'Worker not found in your branch', 404);
  }

  sendSuccess(res, null, 'Worker deleted successfully');
});

// @desc    Get worker types
// @route   GET /api/branch/worker-types
// @access  Private (Branch Manager)
const getWorkerTypes = asyncHandler(async (req, res) => {
  const workerTypes = Object.entries(WORKER_TYPES).map(([key, value]) => ({
    key,
    value,
    label: value.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }));

  sendSuccess(res, { workerTypes }, 'Worker types retrieved successfully');
});

// Export worker management functions
module.exports.addWorker = addWorker;
module.exports.updateWorker = updateWorker;
module.exports.deleteWorker = deleteWorker;
module.exports.getWorkerTypes = getWorkerTypes;

// ==================== NOTIFICATIONS ====================

const NotificationService = require('../../services/notificationService');

// @desc    Get branch manager notifications
// @route   GET /api/branch/notifications
// @access  Private (Branch Manager)
const getNotifications = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, unreadOnly } = req.query;
  
  const result = await NotificationService.getUserNotifications(req.user._id, {
    page: parseInt(page),
    limit: parseInt(limit),
    unreadOnly: unreadOnly === 'true'
  });

  sendSuccess(res, result, 'Notifications retrieved successfully');
});

// @desc    Get unread notification count
// @route   GET /api/branch/notifications/unread-count
// @access  Private (Branch Manager)
const getUnreadNotificationCount = asyncHandler(async (req, res) => {
  const result = await NotificationService.getUserNotifications(req.user._id, {
    page: 1,
    limit: 1
  });

  sendSuccess(res, { unreadCount: result.unreadCount }, 'Unread count retrieved successfully');
});

// @desc    Mark notifications as read
// @route   PUT /api/branch/notifications/mark-read
// @access  Private (Branch Manager)
const markNotificationsAsRead = asyncHandler(async (req, res) => {
  const { notificationIds } = req.body;

  if (!notificationIds || !Array.isArray(notificationIds)) {
    return sendError(res, 'INVALID_DATA', 'Notification IDs array is required', 400);
  }

  await NotificationService.markAsRead(req.user._id, notificationIds);

  sendSuccess(res, null, 'Notifications marked as read');
});

// @desc    Mark all notifications as read
// @route   PUT /api/branch/notifications/mark-all-read
// @access  Private (Branch Manager)
const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  await NotificationService.markAllAsRead(req.user._id);

  sendSuccess(res, null, 'All notifications marked as read');
});

// Export notification functions
module.exports.getNotifications = getNotifications;
module.exports.getUnreadNotificationCount = getUnreadNotificationCount;
module.exports.markNotificationsAsRead = markNotificationsAsRead;
module.exports.markAllNotificationsAsRead = markAllNotificationsAsRead;

// ==================== SERVICE MANAGEMENT ====================

const Service = require('../../models/Service');

// @desc    Get services for branch (all admin services + branch-created)
// @route   GET /api/branch/services
// @access  Private (Branch Manager)
const getBranchServices = asyncHandler(async (req, res) => {
  const user = req.user;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  // Get ALL services created by admin/center admin (globally active)
  const adminServices = await Service.find({
    isActive: true
  }).lean();

  // Transform admin services - all are enabled globally now
  const transformedAdmin = adminServices.map(service => {
    return {
      _id: service._id,
      name: service.name,
      code: service.code,
      displayName: service.displayName,
      description: service.description,
      icon: service.icon,
      category: service.category,
      turnaroundTime: service.turnaroundTime,
      isExpressAvailable: service.isExpressAvailable,
      isActiveForBranch: service.isActive,
      priceMultiplier: service.basePriceMultiplier ?? 1.0,
      source: 'admin', // Created by admin/center admin
      canDelete: false
    };
  });

  // Transform branch-created services (none exist now since we removed this functionality)
  const transformedBranchCreated = [];

  const allServices = [...transformedAdmin, ...transformedBranchCreated];

  sendSuccess(res, { 
    services: allServices,
    branch: { _id: branch._id, name: branch.name, code: branch.code },
    stats: {
      total: allServices.length,
      adminAssigned: transformedAdmin.length,
      branchCreated: transformedBranchCreated.length,
      enabled: allServices.filter(s => s.isActiveForBranch).length
    }
  }, 'Branch services retrieved successfully');
});

// @desc    Create service for branch
// @route   POST /api/branch/services
// @access  Private (Branch Manager)
const createBranchService = asyncHandler(async (req, res) => {
  const user = req.user;
  const { name, displayName, description, category, icon, turnaroundTime, isExpressAvailable } = req.body;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  // Validate required fields
  if (!name || !displayName) {
    return sendError(res, 'MISSING_FIELDS', 'Name and display name are required', 400);
  }

  // Generate unique code for branch service
  const code = `${branch.code.toLowerCase()}_${name.toLowerCase().replace(/\s+/g, '_')}_${Date.now().toString(36)}`;

  // Check if service with same name exists for this branch
  const existingService = await Service.findOne({
    createdByBranch: branch._id,
    name: { $regex: new RegExp(`^${name}$`, 'i') }
  });

  if (existingService) {
    return sendError(res, 'SERVICE_EXISTS', 'A service with this name already exists for your branch', 400);
  }

  // Create service
  const service = await Service.create({
    name,
    code,
    displayName,
    description: description || '',
    category: category || 'other',
    icon: icon || 'Sparkles',
    turnaroundTime: turnaroundTime || { standard: 48, express: 24 },
    isExpressAvailable: isExpressAvailable !== false,
    isActive: true,
    createdBy: user._id,
    createdByBranch: branch._id, // Mark as branch-created
    branches: [{
      branch: branch._id,
      isActive: true,
      priceMultiplier: 1.0
    }]
  });

  sendSuccess(res, { 
    service: {
      _id: service._id,
      name: service.name,
      code: service.code,
      displayName: service.displayName,
      description: service.description,
      category: service.category,
      icon: service.icon,
      turnaroundTime: service.turnaroundTime,
      isExpressAvailable: service.isExpressAvailable,
      isActiveForBranch: true,
      source: 'branch',
      canDelete: true
    }
  }, 'Service created successfully', 201);
});

// @desc    Delete branch-created service
// @route   DELETE /api/branch/services/:serviceId
// @access  Private (Branch Manager)
const deleteBranchService = asyncHandler(async (req, res) => {
  const user = req.user;
  const { serviceId } = req.params;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const service = await Service.findById(serviceId);
  if (!service) {
    return sendError(res, 'SERVICE_NOT_FOUND', 'Service not found', 404);
  }

  // Only allow deleting branch-created services
  if (!service.createdByBranch || service.createdByBranch.toString() !== branch._id.toString()) {
    return sendError(res, 'CANNOT_DELETE', 'You can only delete services created by your branch', 403);
  }

  await Service.findByIdAndDelete(serviceId);

  sendSuccess(res, null, 'Service deleted successfully');
});

// @desc    Toggle service status for branch
// @desc    Toggle service status (simplified - no branch-specific logic)
// @route   PUT /api/branch/services/:serviceId/toggle
// @access  Private (Branch Manager)
const toggleBranchService = asyncHandler(async (req, res) => {
  const user = req.user;
  const { serviceId } = req.params;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const service = await Service.findById(serviceId);
  if (!service) {
    return sendError(res, 'SERVICE_NOT_FOUND', 'Service not found', 404);
  }

  // Since we removed branch-specific functionality, just return current status
  // In a simplified system, all services are globally managed
  sendSuccess(res, { 
    service: {
      _id: service._id,
      name: service.name,
      displayName: service.displayName,
      isActiveForBranch: service.isActive
    }
  }, 'Service status retrieved (global services cannot be toggled per branch)');
});

// @desc    Update service settings (simplified - global settings only)
// @route   PUT /api/branch/services/:serviceId/settings
// @access  Private (Branch Manager)
const updateBranchServiceSettings = asyncHandler(async (req, res) => {
  const user = req.user;
  const { serviceId } = req.params;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const service = await Service.findById(serviceId);
  if (!service) {
    return sendError(res, 'SERVICE_NOT_FOUND', 'Service not found', 404);
  }

  // Since we removed branch-specific functionality, just return current settings
  sendSuccess(res, { 
    service: {
      _id: service._id,
      name: service.name,
      displayName: service.displayName,
      priceMultiplier: service.basePriceMultiplier,
      turnaroundTime: service.turnaroundTime
    }
  }, 'Service settings retrieved (global services cannot be modified per branch)');
});

// Export service management functions
module.exports.getBranchServices = getBranchServices;
module.exports.createBranchService = createBranchService;
module.exports.deleteBranchService = deleteBranchService;
module.exports.toggleBranchService = toggleBranchService;
module.exports.updateBranchServiceSettings = updateBranchServiceSettings;


// ==================== SERVICE ITEMS MANAGEMENT ====================

const ServiceItem = require('../../models/ServiceItem');

// @desc    Get service items for a branch service
// @route   GET /api/branch/services/:serviceId/items
// @access  Private (Branch Manager)
const getServiceItems = asyncHandler(async (req, res) => {
  const user = req.user;
  const { serviceId } = req.params;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const service = await Service.findById(serviceId);
  if (!service) {
    return sendError(res, 'SERVICE_NOT_FOUND', 'Service not found', 404);
  }

  // Get items for this service (global items + branch-created items)
  const items = await ServiceItem.find({
    service: service.code,
    $or: [
      { createdByBranch: { $exists: false } },
      { createdByBranch: null },
      { createdByBranch: branch._id }
    ],
    isActive: true
  }).sort({ sortOrder: 1, name: 1 });

  sendSuccess(res, { 
    items: items.map(item => ({
      _id: item._id,
      name: item.name,
      itemId: item.itemId,
      category: item.category,
      basePrice: item.basePrice,
      description: item.description,
      canDelete: item.createdByBranch?.toString() === branch._id.toString()
    })),
    service: { _id: service._id, name: service.name, code: service.code }
  }, 'Service items retrieved successfully');
});

// @desc    Add item to branch service
// @route   POST /api/branch/services/:serviceId/items
// @access  Private (Branch Manager)
const addServiceItem = asyncHandler(async (req, res) => {
  const user = req.user;
  const { serviceId } = req.params;
  const { name, category, basePrice, description } = req.body;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const service = await Service.findById(serviceId);
  if (!service) {
    return sendError(res, 'SERVICE_NOT_FOUND', 'Service not found', 404);
  }

  // Validate
  if (!name || !category || basePrice === undefined) {
    return sendError(res, 'MISSING_FIELDS', 'Name, category and base price are required', 400);
  }

  // Generate unique itemId
  const itemId = `${branch.code.toLowerCase()}_${service.code}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36)}`;

  // Create item
  const item = await ServiceItem.create({
    name,
    itemId,
    service: service.code,
    category,
    basePrice,
    description: description || '',
    createdByBranch: branch._id,
    isActive: true
  });

  sendSuccess(res, { 
    item: {
      _id: item._id,
      name: item.name,
      itemId: item.itemId,
      category: item.category,
      basePrice: item.basePrice,
      description: item.description,
      canDelete: true
    }
  }, 'Item added successfully', 201);
});

// @desc    Update service item
// @route   PUT /api/branch/services/:serviceId/items/:itemId
// @access  Private (Branch Manager)
const updateServiceItem = asyncHandler(async (req, res) => {
  const user = req.user;
  const { serviceId, itemId } = req.params;
  const { name, category, basePrice, description } = req.body;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const item = await ServiceItem.findById(itemId);
  if (!item) {
    return sendError(res, 'ITEM_NOT_FOUND', 'Item not found', 404);
  }

  // Only allow editing branch-created items
  if (!item.createdByBranch || item.createdByBranch.toString() !== branch._id.toString()) {
    return sendError(res, 'CANNOT_EDIT', 'You can only edit items created by your branch', 403);
  }

  // Update fields
  if (name) item.name = name;
  if (category) item.category = category;
  if (basePrice !== undefined) item.basePrice = basePrice;
  if (description !== undefined) item.description = description;

  await item.save();

  sendSuccess(res, { 
    item: {
      _id: item._id,
      name: item.name,
      itemId: item.itemId,
      category: item.category,
      basePrice: item.basePrice,
      description: item.description,
      canDelete: true
    }
  }, 'Item updated successfully');
});

// @desc    Delete service item
// @route   DELETE /api/branch/services/:serviceId/items/:itemId
// @access  Private (Branch Manager)
const deleteServiceItem = asyncHandler(async (req, res) => {
  const user = req.user;
  const { serviceId, itemId } = req.params;

  const branch = await getAdminBranch(user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const item = await ServiceItem.findById(itemId);
  if (!item) {
    return sendError(res, 'ITEM_NOT_FOUND', 'Item not found', 404);
  }

  // Only allow deleting branch-created items
  if (!item.createdByBranch || item.createdByBranch.toString() !== branch._id.toString()) {
    return sendError(res, 'CANNOT_DELETE', 'You can only delete items created by your branch', 403);
  }

  await ServiceItem.findByIdAndDelete(itemId);

  sendSuccess(res, null, 'Item deleted successfully');
});

// Export service items functions
module.exports.getServiceItems = getServiceItems;
module.exports.addServiceItem = addServiceItem;
module.exports.updateServiceItem = updateServiceItem;
module.exports.deleteServiceItem = deleteServiceItem;
