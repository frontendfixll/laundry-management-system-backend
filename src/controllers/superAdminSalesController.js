const SalesUser = require('../models/SalesUser');
const Lead = require('../models/Lead');
const { sendSuccess, sendError, asyncHandler } = require('../utils/helpers');
const { validationResult } = require('express-validator');
const crypto = require('crypto');

/**
 * Get all sales users
 * GET /api/superadmin/sales-users
 */
exports.getSalesUsers = asyncHandler(async (req, res) => {
  const {
    search,
    isActive,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Build filter
  const filter = {};
  
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  
  // Search by name or email
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { employeeId: { $regex: search, $options: 'i' } }
    ];
  }

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  // Get sales users
  const salesUsers = await SalesUser.find(filter)
    .select('-password -sessions')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  // Get total count
  const total = await SalesUser.countDocuments(filter);

  sendSuccess(res, {
    salesUsers,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  }, 'Sales users retrieved');
});

/**
 * Get single sales user
 * GET /api/superadmin/sales-users/:id
 */
exports.getSalesUser = asyncHandler(async (req, res) => {
  const salesUser = await SalesUser.findById(req.params.id)
    .select('-password -sessions');

  if (!salesUser) {
    return sendError(res, 'NOT_FOUND', 'Sales user not found', 404);
  }

  // Get assigned leads count
  const leadsCount = await Lead.countDocuments({ assignedTo: salesUser._id });
  const convertedLeadsCount = await Lead.countDocuments({ 
    assignedTo: salesUser._id, 
    isConverted: true 
  });

  sendSuccess(res, {
    salesUser,
    stats: {
      leadsCount,
      convertedLeadsCount
    }
  }, 'Sales user retrieved');
});

/**
 * Create sales user
 * POST /api/superadmin/sales-users
 */
exports.createSalesUser = asyncHandler(async (req, res) => {
  console.log('📝 Create sales user request:', req.body);
  
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('❌ Validation errors:', errors.array());
    return sendError(res, 'VALIDATION_ERROR', errors.array().map(e => `${e.param}: ${e.msg}`).join(', '), 400);
  }

  const {
    name,
    email,
    password,
    phone,
    employeeId,
    designation,
    permissions
  } = req.body;

  // Check if email already exists
  const existingUser = await SalesUser.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return sendError(res, 'DUPLICATE_EMAIL', 'Email already exists', 400);
  }

  // Check if employeeId already exists
  if (employeeId) {
    const existingEmployee = await SalesUser.findOne({ employeeId });
    if (existingEmployee) {
      return sendError(res, 'DUPLICATE_EMPLOYEE_ID', 'Employee ID already exists', 400);
    }
  }

  // Create sales user
  const salesUser = await SalesUser.create({
    name,
    email: email.toLowerCase(),
    password,
    phone,
    employeeId,
    designation: designation || 'Sales Executive',
    permissions: permissions || undefined, // Use default permissions if not provided
    createdBy: req.admin?._id
  });

  // Remove password from response
  const salesUserResponse = salesUser.toObject();
  delete salesUserResponse.password;
  delete salesUserResponse.sessions;

  return sendSuccess(res, salesUserResponse, 'Sales user created successfully', 201);
});

/**
 * Update sales user
 * PUT /api/superadmin/sales-users/:id
 */
exports.updateSalesUser = asyncHandler(async (req, res) => {
  const salesUser = await SalesUser.findById(req.params.id);

  if (!salesUser) {
    return sendError(res, 'NOT_FOUND', 'Sales user not found', 404);
  }

  const {
    name,
    phone,
    employeeId,
    designation,
    permissions,
    isActive
  } = req.body;

  // Update fields
  if (name) salesUser.name = name;
  if (phone) salesUser.phone = phone;
  if (employeeId) {
    // Check if employeeId already exists for another user
    const existingEmployee = await SalesUser.findOne({ 
      employeeId, 
      _id: { $ne: salesUser._id } 
    });
    if (existingEmployee) {
      return sendError(res, 'DUPLICATE_EMPLOYEE_ID', 'Employee ID already exists', 400);
    }
    salesUser.employeeId = employeeId;
  }
  if (designation) salesUser.designation = designation;
  if (permissions) salesUser.permissions = permissions;
  if (isActive !== undefined) salesUser.isActive = isActive;

  salesUser.updatedBy = req.admin?._id;
  await salesUser.save();

  // Remove password from response
  const salesUserResponse = salesUser.toObject();
  delete salesUserResponse.password;
  delete salesUserResponse.sessions;

  sendSuccess(res, salesUserResponse, 'Sales user updated successfully');
});

/**
 * Delete sales user
 * DELETE /api/superadmin/sales-users/:id
 */
exports.deleteSalesUser = asyncHandler(async (req, res) => {
  const salesUser = await SalesUser.findById(req.params.id);

  if (!salesUser) {
    return sendError(res, 'NOT_FOUND', 'Sales user not found', 404);
  }

  // Check if user has assigned leads
  const assignedLeads = await Lead.countDocuments({ assignedTo: salesUser._id });
  if (assignedLeads > 0) {
    return sendError(res, 'HAS_ASSIGNED_LEADS', `Cannot delete sales user with ${assignedLeads} assigned leads. Please reassign leads first.`, 400);
  }

  await salesUser.deleteOne();

  sendSuccess(res, null, 'Sales user deleted successfully');
});

/**
 * Reset sales user password
 * POST /api/superadmin/sales-users/:id/reset-password
 */
exports.resetPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  
  if (!newPassword || newPassword.length < 8) {
    return sendError(res, 'INVALID_PASSWORD', 'Password must be at least 8 characters', 400);
  }

  const salesUser = await SalesUser.findById(req.params.id);

  if (!salesUser) {
    return sendError(res, 'NOT_FOUND', 'Sales user not found', 404);
  }

  // Update password
  salesUser.password = newPassword;
  await salesUser.save();

  sendSuccess(res, null, 'Password reset successfully');
});

/**
 * Update sales user permissions
 * PUT /api/superadmin/sales-users/:id/permissions
 */
exports.updatePermissions = asyncHandler(async (req, res) => {
  const { permissions } = req.body;

  if (!permissions || typeof permissions !== 'object') {
    return sendError(res, 'INVALID_PERMISSIONS', 'Valid permissions object required', 400);
  }

  const salesUser = await SalesUser.findById(req.params.id);

  if (!salesUser) {
    return sendError(res, 'NOT_FOUND', 'Sales user not found', 404);
  }

  salesUser.permissions = permissions;
  salesUser.updatedBy = req.admin?._id;
  await salesUser.save();

  const salesUserResponse = salesUser.toObject();
  delete salesUserResponse.password;
  delete salesUserResponse.sessions;

  sendSuccess(res, salesUserResponse, 'Permissions updated successfully');
});

/**
 * Update sales user performance
 * PUT /api/superadmin/sales-users/:id/performance
 */
exports.updatePerformance = asyncHandler(async (req, res) => {
  const { target } = req.body;

  const salesUser = await SalesUser.findById(req.params.id);

  if (!salesUser) {
    return sendError(res, 'NOT_FOUND', 'Sales user not found', 404);
  }

  if (target !== undefined) {
    salesUser.performance.target = target;
    
    // Recalculate target achieved percentage
    if (target > 0) {
      salesUser.performance.targetAchieved = 
        (salesUser.performance.totalRevenue / target) * 100;
    }
  }

  await salesUser.save();

  const salesUserResponse = salesUser.toObject();
  delete salesUserResponse.password;
  delete salesUserResponse.sessions;

  sendSuccess(res, salesUserResponse, 'Performance updated successfully');
});

/**
 * Get sales user statistics
 * GET /api/superadmin/sales-users/stats
 */
exports.getSalesStats = asyncHandler(async (req, res) => {
  const totalSalesUsers = await SalesUser.countDocuments();
  const activeSalesUsers = await SalesUser.countDocuments({ isActive: true });

  // Get performance aggregation
  const performanceStats = await SalesUser.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: null,
        totalLeadsAssigned: { $sum: '$performance.leadsAssigned' },
        totalLeadsConverted: { $sum: '$performance.leadsConverted' },
        totalRevenue: { $sum: '$performance.totalRevenue' },
        currentMonthRevenue: { $sum: '$performance.currentMonthRevenue' },
        avgConversionRate: { $avg: '$performance.conversionRate' }
      }
    }
  ]);

  // Get top performers
  const topPerformers = await SalesUser.find({ isActive: true })
    .select('name email performance')
    .sort({ 'performance.totalRevenue': -1 })
    .limit(5);

  const result = performanceStats[0] || {
    totalLeadsAssigned: 0,
    totalLeadsConverted: 0,
    totalRevenue: 0,
    currentMonthRevenue: 0,
    avgConversionRate: 0
  };

  sendSuccess(res, {
    totalSalesUsers,
    activeSalesUsers,
    performance: result,
    topPerformers
  }, 'Sales statistics retrieved');
});

/**
 * Deactivate sales user
 * POST /api/superadmin/sales-users/:id/deactivate
 */
exports.deactivateSalesUser = asyncHandler(async (req, res) => {
  const salesUser = await SalesUser.findById(req.params.id);

  if (!salesUser) {
    return sendError(res, 'NOT_FOUND', 'Sales user not found', 404);
  }

  salesUser.isActive = false;
  salesUser.updatedBy = req.admin?._id;
  await salesUser.save();

  sendSuccess(res, null, 'Sales user deactivated successfully');
});

/**
 * Activate sales user
 * POST /api/superadmin/sales-users/:id/activate
 */
exports.activateSalesUser = asyncHandler(async (req, res) => {
  const salesUser = await SalesUser.findById(req.params.id);

  if (!salesUser) {
    return sendError(res, 'NOT_FOUND', 'Sales user not found', 404);
  }

  salesUser.isActive = true;
  salesUser.updatedBy = req.admin?._id;
  await salesUser.save();

  sendSuccess(res, null, 'Sales user activated successfully');
});
