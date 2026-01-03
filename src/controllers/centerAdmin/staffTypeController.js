const StaffType = require('../../models/StaffType');
const User = require('../../models/User');
const Branch = require('../../models/Branch');
const { sendSuccess, sendError, asyncHandler } = require('../../utils/helpers');

// Helper to get admin's branch
const getAdminBranch = async (user) => {
  if (user.assignedBranch) {
    return await Branch.findById(user.assignedBranch);
  }
  return null;
};

// @desc    Get all staff types for branch
// @route   GET /api/branch/staff-types
// @access  Private (Admin)
const getStaffTypes = asyncHandler(async (req, res) => {
  const branch = await getAdminBranch(req.user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const staffTypes = await StaffType.find({ branch: branch._id, isActive: true })
    .sort({ isDefault: -1, name: 1 })
    .lean();

  // Get staff count for each type
  const typesWithCount = await Promise.all(
    staffTypes.map(async (type) => {
      const staffCount = await User.countDocuments({
        staffType: type._id,
        role: 'staff',
        assignedBranch: branch._id
      });
      return { ...type, staffCount };
    })
  );

  sendSuccess(res, { staffTypes: typesWithCount }, 'Staff types retrieved');
});

// @desc    Create new staff type
// @route   POST /api/branch/staff-types
// @access  Private (Admin)
const createStaffType = asyncHandler(async (req, res) => {
  const { name, description, color } = req.body;

  const branch = await getAdminBranch(req.user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  // Check if name already exists in branch
  const existing = await StaffType.findOne({ branch: branch._id, name: { $regex: new RegExp(`^${name}$`, 'i') } });
  if (existing) {
    return sendError(res, 'STAFF_TYPE_EXISTS', 'Staff type with this name already exists', 400);
  }

  const staffType = await StaffType.create({
    branch: branch._id,
    name,
    description,
    color: color || '#6B7280',
    isDefault: false
  });

  sendSuccess(res, { staffType }, 'Staff type created successfully', 201);
});

// @desc    Update staff type
// @route   PUT /api/branch/staff-types/:id
// @access  Private (Admin)
const updateStaffType = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, color } = req.body;

  const branch = await getAdminBranch(req.user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const staffType = await StaffType.findOne({ _id: id, branch: branch._id });
  if (!staffType) {
    return sendError(res, 'STAFF_TYPE_NOT_FOUND', 'Staff type not found', 404);
  }

  // Check name uniqueness if changing name
  if (name && name !== staffType.name) {
    const existing = await StaffType.findOne({ 
      branch: branch._id, 
      name: { $regex: new RegExp(`^${name}$`, 'i') },
      _id: { $ne: id }
    });
    if (existing) {
      return sendError(res, 'STAFF_TYPE_EXISTS', 'Staff type with this name already exists', 400);
    }
    staffType.name = name;
  }

  if (description !== undefined) staffType.description = description;
  if (color) staffType.color = color;

  await staffType.save();

  sendSuccess(res, { staffType }, 'Staff type updated successfully');
});

// @desc    Delete staff type
// @route   DELETE /api/branch/staff-types/:id
// @access  Private (Admin)
const deleteStaffType = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const branch = await getAdminBranch(req.user);
  if (!branch) {
    return sendError(res, 'NO_BRANCH', 'No branch assigned', 404);
  }

  const staffType = await StaffType.findOne({ _id: id, branch: branch._id });
  if (!staffType) {
    return sendError(res, 'STAFF_TYPE_NOT_FOUND', 'Staff type not found', 404);
  }

  // Check if staff are assigned to this type
  const staffCount = await User.countDocuments({ staffType: id, role: 'staff' });
  if (staffCount > 0) {
    return sendError(res, 'STAFF_ASSIGNED', `Cannot delete: ${staffCount} staff member(s) have this type`, 400);
  }

  // Ensure at least one type remains
  const typeCount = await StaffType.countDocuments({ branch: branch._id, isActive: true });
  if (typeCount <= 1) {
    return sendError(res, 'MIN_STAFF_TYPE', 'Cannot delete: Branch must have at least one staff type', 400);
  }

  await StaffType.findByIdAndDelete(id);

  sendSuccess(res, null, 'Staff type deleted successfully');
});

module.exports = {
  getStaffTypes,
  createStaffType,
  updateStaffType,
  deleteStaffType
};
