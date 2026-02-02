const User = require('../../models/User');
const Ticket = require('../../models/Ticket');
const { 
  sendSuccess, 
  sendError, 
  asyncHandler,
  getPagination,
  formatPaginationResponse
} = require('../../utils/helpers');
const bcrypt = require('bcryptjs');

// @desc    Create support user
// @route   POST /api/admin/support/users
// @access  Private (Admin)
const createSupportUser = asyncHandler(async (req, res) => {
  const { name, email, phone, password, assignedBranch } = req.body;
  const tenancyId = req.tenancyId;

  if (!name || !email || !phone || !password) {
    return sendError(res, 'MISSING_FIELDS', 'Name, email, phone and password are required', 400);
  }

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return sendError(res, 'USER_EXISTS', 'User with this email already exists', 400);
  }

  // Create support user
  const supportUser = await User.create({
    name,
    email,
    phone,
    password,
    role: 'support',
    tenancy: tenancyId,
    assignedBranch: assignedBranch || null,
    isActive: true,
    permissions: User.getDefaultSupportPermissions()
  });

  // Remove password from response
  const userResponse = supportUser.toObject();
  delete userResponse.password;

  sendSuccess(res, { user: userResponse }, 'Support user created successfully', 201);
});

// @desc    Get all support users
// @route   GET /api/admin/support/users
// @access  Private (Admin)
const getSupportUsers = asyncHandler(async (req, res) => {
  const tenancyId = req.tenancyId;
  const { page = 1, limit = 10, branch, status } = req.query;
  const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit);

  let query = { 
    role: 'support',
    tenancy: tenancyId
  };

  if (branch) {
    query.assignedBranch = branch;
  }

  if (status) {
    query.isActive = status === 'active';
  }

  const total = await User.countDocuments(query);
  const supportUsers = await User.find(query)
    .populate('assignedBranch', 'name location')
    .select('-password -passwordResetToken -emailVerificationToken')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

  // Get ticket stats for each support user
  const usersWithStats = await Promise.all(
    supportUsers.map(async (user) => {
      const ticketStats = await Ticket.aggregate([
        { $match: { assignedTo: user._id } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const stats = {
        total: 0,
        open: 0,
        inProgress: 0,
        resolved: 0
      };

      ticketStats.forEach(stat => {
        stats.total += stat.count;
        if (stat._id === 'open') stats.open = stat.count;
        if (stat._id === 'in_progress') stats.inProgress = stat.count;
        if (stat._id === 'resolved') stats.resolved = stat.count;
      });

      return {
        ...user.toObject(),
        ticketStats: stats
      };
    })
  );

  const response = formatPaginationResponse(usersWithStats, total, pageNum, limitNum);
  sendSuccess(res, response, 'Support users retrieved successfully');
});

// @desc    Get single support user
// @route   GET /api/admin/support/users/:userId
// @access  Private (Admin)
const getSupportUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const tenancyId = req.tenancyId;

  const supportUser = await User.findOne({ 
    _id: userId, 
    role: 'support',
    tenancy: tenancyId
  })
    .populate('assignedBranch', 'name location')
    .select('-password -passwordResetToken -emailVerificationToken');

  if (!supportUser) {
    return sendError(res, 'USER_NOT_FOUND', 'Support user not found', 404);
  }

  // Get detailed ticket stats
  const ticketStats = await Ticket.aggregate([
    { $match: { assignedTo: supportUser._id } },
    {
      $group: {
        _id: {
          status: '$status',
          priority: '$priority'
        },
        count: { $sum: 1 }
      }
    }
  ]);

  const recentTickets = await Ticket.find({ assignedTo: supportUser._id })
    .populate('raisedBy', 'name email')
    .select('ticketNumber title status priority createdAt')
    .sort({ updatedAt: -1 })
    .limit(10);

  const userResponse = {
    ...supportUser.toObject(),
    ticketStats,
    recentTickets
  };

  sendSuccess(res, { user: userResponse }, 'Support user retrieved successfully');
});

// @desc    Update support user
// @route   PUT /api/admin/support/users/:userId
// @access  Private (Admin)
const updateSupportUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { name, phone, assignedBranch, isActive, permissions } = req.body;
  const tenancyId = req.tenancyId;

  const supportUser = await User.findOne({ 
    _id: userId, 
    role: 'support',
    tenancy: tenancyId
  });

  if (!supportUser) {
    return sendError(res, 'USER_NOT_FOUND', 'Support user not found', 404);
  }

  // Update fields
  if (name) supportUser.name = name;
  if (phone) supportUser.phone = phone;
  if (assignedBranch !== undefined) supportUser.assignedBranch = assignedBranch;
  if (isActive !== undefined) supportUser.isActive = isActive;
  if (permissions) {
    // Only allow updating ticket-related permissions for support users
    if (permissions.tickets) {
      supportUser.permissions.tickets = { ...supportUser.permissions.tickets, ...permissions.tickets };
    }
  }

  await supportUser.save();

  const updatedUser = await User.findById(userId)
    .populate('assignedBranch', 'name location')
    .select('-password -passwordResetToken -emailVerificationToken');

  sendSuccess(res, { user: updatedUser }, 'Support user updated successfully');
});

// @desc    Delete support user
// @route   DELETE /api/admin/support/users/:userId
// @access  Private (Admin)
const deleteSupportUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const tenancyId = req.tenancyId;

  const supportUser = await User.findOne({ 
    _id: userId, 
    role: 'support',
    tenancy: tenancyId
  });

  if (!supportUser) {
    return sendError(res, 'USER_NOT_FOUND', 'Support user not found', 404);
  }

  // Check if user has assigned tickets
  const assignedTickets = await Ticket.countDocuments({ 
    assignedTo: userId,
    status: { $in: ['open', 'in_progress'] }
  });

  if (assignedTickets > 0) {
    return sendError(res, 'USER_HAS_TICKETS', 'Cannot delete user with active assigned tickets', 400);
  }

  await User.findByIdAndDelete(userId);

  sendSuccess(res, null, 'Support user deleted successfully');
});

// @desc    Reset support user password
// @route   POST /api/admin/support/users/:userId/reset-password
// @access  Private (Admin)
const resetSupportUserPassword = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body;
  const tenancyId = req.tenancyId;

  if (!newPassword || newPassword.length < 6) {
    return sendError(res, 'INVALID_PASSWORD', 'Password must be at least 6 characters', 400);
  }

  const supportUser = await User.findOne({ 
    _id: userId, 
    role: 'support',
    tenancy: tenancyId
  });

  if (!supportUser) {
    return sendError(res, 'USER_NOT_FOUND', 'Support user not found', 404);
  }

  supportUser.password = newPassword;
  await supportUser.save();

  sendSuccess(res, null, 'Password reset successfully');
});

// @desc    Get support dashboard stats
// @route   GET /api/admin/support/dashboard
// @access  Private (Admin)
const getSupportDashboard = asyncHandler(async (req, res) => {
  const tenancyId = req.tenancyId;

  // Get total support users
  const totalSupportUsers = await User.countDocuments({ 
    role: 'support',
    tenancy: tenancyId,
    isActive: true
  });

  // Get ticket stats
  const ticketStats = await Ticket.aggregate([
    { $match: req.isSuperAdmin ? {} : { tenancy: tenancyId } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);

  // Get unassigned tickets
  const unassignedTickets = await Ticket.countDocuments({
    tenancy: tenancyId,
    assignedTo: null,
    status: { $in: ['open', 'in_progress'] }
  });

  // Get overdue tickets
  const overdueTickets = await Ticket.countDocuments({
    tenancy: tenancyId,
    'sla.isOverdue': true,
    status: { $in: ['open', 'in_progress'] }
  });

  // Get recent tickets
  const recentTickets = await Ticket.find(req.isSuperAdmin ? {} : { tenancy: tenancyId })
    .populate('raisedBy', 'name email')
    .populate('assignedTo', 'name')
    .select('ticketNumber title status priority createdAt assignedTo')
    .sort({ createdAt: -1 })
    .limit(10);

  // Get support user performance
  const supportPerformance = await User.aggregate([
    { $match: { role: 'support', ...(req.isSuperAdmin ? {} : { tenancy: tenancyId }), isActive: true } },
    {
      $lookup: {
        from: 'tickets',
        localField: '_id',
        foreignField: 'assignedTo',
        as: 'tickets'
      }
    },
    {
      $project: {
        name: 1,
        email: 1,
        totalTickets: { $size: '$tickets' },
        resolvedTickets: {
          $size: {
            $filter: {
              input: '$tickets',
              cond: { $eq: ['$$this.status', 'resolved'] }
            }
          }
        }
      }
    }
  ]);

  const dashboardData = {
    totalSupportUsers,
    ticketStats: {
      total: ticketStats.reduce((sum, stat) => sum + stat.count, 0),
      byStatus: ticketStats,
      unassigned: unassignedTickets,
      overdue: overdueTickets
    },
    recentTickets,
    supportPerformance
  };

  sendSuccess(res, dashboardData, 'Support dashboard data retrieved successfully');
});

module.exports = {
  createSupportUser,
  getSupportUsers,
  getSupportUser,
  updateSupportUser,
  deleteSupportUser,
  resetSupportUserPassword,
  getSupportDashboard
};