const User = require('../../models/User');
const Branch = require('../../models/Branch');
const { addTenancyFilter } = require('../../middlewares/tenancyMiddleware');
const { 
  sendSuccess, 
  sendError, 
  asyncHandler,
  getPagination,
  formatPaginationResponse
} = require('../../utils/helpers');

// @desc    Get all branch admins for tenancy
// @route   GET /api/admin/branch-admins
// @access  Private (Admin - Tenancy level)
const getBranchAdmins = asyncHandler(async (req, res) => {
  const tenancyId = req.tenancyId || req.user?.tenancy;
  const { page, limit, skip } = getPagination(req.query);
  const { branchId, search, isActive } = req.query;

  // Build query
  let query = { 
    role: 'branch_admin',
    tenancy: tenancyId 
  };

  if (branchId) {
    query.assignedBranch = branchId;
  }

  if (isActive !== undefined) {
    query.isActive = isActive === 'true';
  }

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }

  const [branchAdmins, total] = await Promise.all([
    User.find(query)
      .select('-password')
      .populate('assignedBranch', 'name code address')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(query)
  ]);

  sendSuccess(res, formatPaginationResponse(branchAdmins, total, page, limit), 'Branch admins fetched successfully');
});

// @desc    Get single branch admin
// @route   GET /api/admin/branch-admins/:id
// @access  Private (Admin - Tenancy level)
const getBranchAdminById = asyncHandler(async (req, res) => {
  const tenancyId = req.tenancyId || req.user?.tenancy;
  const { id } = req.params;

  const branchAdmin = await User.findOne({
    _id: id,
    role: 'branch_admin',
    tenancy: tenancyId
  })
    .select('-password')
    .populate('assignedBranch', 'name code address');

  if (!branchAdmin) {
    return sendError(res, 'NOT_FOUND', 'Branch admin not found', 404);
  }

  sendSuccess(res, { branchAdmin }, 'Branch admin fetched successfully');
});

// @desc    Create new branch admin
// @route   POST /api/admin/branch-admins
// @access  Private (Admin - Tenancy level)
const createBranchAdmin = asyncHandler(async (req, res) => {
  const tenancyId = req.tenancyId || req.user?.tenancy;
  const { name, email, phone, password, assignedBranch, permissions } = req.body;

  // Validation
  if (!name || !email || !phone || !password || !assignedBranch) {
    return sendError(res, 'MISSING_DATA', 'Name, email, phone, password, and assigned branch are required', 400);
  }

  // Check if email already exists
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return sendError(res, 'EMAIL_EXISTS', 'Email already registered', 400);
  }

  // Verify branch exists and belongs to same tenancy
  const branch = await Branch.findOne({ _id: assignedBranch, tenancy: tenancyId });
  if (!branch) {
    return sendError(res, 'BRANCH_NOT_FOUND', 'Branch not found or does not belong to your tenancy', 404);
  }

  // Get default branch admin permissions or use provided ones
  const defaultPermissions = User.getDefaultBranchAdminPermissions();
  const finalPermissions = permissions || defaultPermissions;

  // Create branch admin
  const branchAdmin = new User({
    name,
    email: email.toLowerCase(),
    phone,
    password,
    role: 'branch_admin',
    tenancy: tenancyId,
    assignedBranch,
    permissions: finalPermissions,
    isActive: true,
    isEmailVerified: true
  });

  await branchAdmin.save();

  // Update branch with manager reference
  branch.manager = branchAdmin._id;
  await branch.save();

  const createdAdmin = await User.findById(branchAdmin._id)
    .select('-password')
    .populate('assignedBranch', 'name code address');

  sendSuccess(res, { branchAdmin: createdAdmin }, 'Branch admin created successfully', 201);
});

// @desc    Update branch admin
// @route   PUT /api/admin/branch-admins/:id
// @access  Private (Admin - Tenancy level)
const updateBranchAdmin = asyncHandler(async (req, res) => {
  const tenancyId = req.tenancyId || req.user?.tenancy;
  const { id } = req.params;
  const { name, phone, assignedBranch, permissions, isActive } = req.body;

  const branchAdmin = await User.findOne({
    _id: id,
    role: 'branch_admin',
    tenancy: tenancyId
  });

  if (!branchAdmin) {
    return sendError(res, 'NOT_FOUND', 'Branch admin not found', 404);
  }

  // If changing branch, verify new branch
  if (assignedBranch && assignedBranch !== branchAdmin.assignedBranch?.toString()) {
    const branch = await Branch.findOne({ _id: assignedBranch, tenancy: tenancyId });
    if (!branch) {
      return sendError(res, 'BRANCH_NOT_FOUND', 'Branch not found', 404);
    }

    // Check if new branch already has an admin
    const existingAdmin = await User.findOne({
      role: 'branch_admin',
      assignedBranch: assignedBranch,
      tenancy: tenancyId,
      isActive: true,
      _id: { $ne: id }
    });

    if (existingAdmin) {
      return sendError(res, 'BRANCH_HAS_ADMIN', 'Target branch already has an active admin', 400);
    }

    // Update old branch to remove manager
    if (branchAdmin.assignedBranch) {
      await Branch.findByIdAndUpdate(branchAdmin.assignedBranch, { $unset: { manager: 1 } });
    }

    // Update new branch with manager
    branch.manager = branchAdmin._id;
    await branch.save();

    branchAdmin.assignedBranch = assignedBranch;
  }

  // Update fields
  if (name) branchAdmin.name = name;
  if (phone) branchAdmin.phone = phone;
  if (permissions) branchAdmin.permissions = permissions;
  if (isActive !== undefined) branchAdmin.isActive = isActive;

  await branchAdmin.save();

  const updatedAdmin = await User.findById(id)
    .select('-password')
    .populate('assignedBranch', 'name code address');

  sendSuccess(res, { branchAdmin: updatedAdmin }, 'Branch admin updated successfully');
});

// @desc    Delete/Deactivate branch admin
// @route   DELETE /api/admin/branch-admins/:id
// @access  Private (Admin - Tenancy level)
const deleteBranchAdmin = asyncHandler(async (req, res) => {
  const tenancyId = req.tenancyId || req.user?.tenancy;
  const { id } = req.params;

  const branchAdmin = await User.findOne({
    _id: id,
    role: 'branch_admin',
    tenancy: tenancyId
  });

  if (!branchAdmin) {
    return sendError(res, 'NOT_FOUND', 'Branch admin not found', 404);
  }

  // Soft delete - deactivate instead of removing
  branchAdmin.isActive = false;
  await branchAdmin.save();

  // Remove manager from branch
  if (branchAdmin.assignedBranch) {
    await Branch.findByIdAndUpdate(branchAdmin.assignedBranch, { $unset: { manager: 1 } });
  }

  sendSuccess(res, null, 'Branch admin deactivated successfully');
});

// @desc    Reactivate branch admin
// @route   PUT /api/admin/branch-admins/:id/reactivate
// @access  Private (Admin - Tenancy level)
const reactivateBranchAdmin = asyncHandler(async (req, res) => {
  const tenancyId = req.tenancyId || req.user?.tenancy;
  const { id } = req.params;

  const branchAdmin = await User.findOne({
    _id: id,
    role: 'branch_admin',
    tenancy: tenancyId
  });

  if (!branchAdmin) {
    return sendError(res, 'NOT_FOUND', 'Branch admin not found', 404);
  }

  if (branchAdmin.isActive) {
    return sendError(res, 'ALREADY_ACTIVE', 'Branch admin is already active', 400);
  }

  // Check if branch already has another active admin
  if (branchAdmin.assignedBranch) {
    const existingAdmin = await User.findOne({
      role: 'branch_admin',
      assignedBranch: branchAdmin.assignedBranch,
      tenancy: tenancyId,
      isActive: true,
      _id: { $ne: id }
    });

    if (existingAdmin) {
      return sendError(res, 'BRANCH_HAS_ADMIN', 'Branch already has an active admin. Deactivate them first.', 400);
    }

    // Update branch with manager
    await Branch.findByIdAndUpdate(branchAdmin.assignedBranch, { manager: branchAdmin._id });
  }

  branchAdmin.isActive = true;
  await branchAdmin.save();

  const updatedAdmin = await User.findById(id)
    .select('-password')
    .populate('assignedBranch', 'name code address');

  sendSuccess(res, { branchAdmin: updatedAdmin }, 'Branch admin reactivated successfully');
});

// @desc    Update branch admin permissions
// @route   PUT /api/admin/branch-admins/:id/permissions
// @access  Private (Admin - Tenancy level)
const updateBranchAdminPermissions = asyncHandler(async (req, res) => {
  const tenancyId = req.tenancyId || req.user?.tenancy;
  const { id } = req.params;
  const { permissions } = req.body;

  if (!permissions) {
    return sendError(res, 'MISSING_DATA', 'Permissions are required', 400);
  }

  const branchAdmin = await User.findOne({
    _id: id,
    role: 'branch_admin',
    tenancy: tenancyId
  });

  if (!branchAdmin) {
    return sendError(res, 'NOT_FOUND', 'Branch admin not found', 404);
  }

  branchAdmin.permissions = permissions;
  await branchAdmin.save();

  const updatedAdmin = await User.findById(id)
    .select('-password')
    .populate('assignedBranch', 'name code address');

  sendSuccess(res, { branchAdmin: updatedAdmin }, 'Permissions updated successfully');
});

module.exports = {
  getBranchAdmins,
  getBranchAdminById,
  createBranchAdmin,
  updateBranchAdmin,
  deleteBranchAdmin,
  reactivateBranchAdmin,
  updateBranchAdminPermissions
};
