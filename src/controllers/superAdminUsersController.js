const User = require('../models/User');
const Branch = require('../models/Branch');
const bcrypt = require('bcryptjs');

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 50, role, search, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};

    if (role && role !== 'all') {
      query.role = role;
    }

    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('name email phone role isActive createdAt assignedBranch')
        .populate('assignedBranch', 'name code')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query)
    ]);

    // Transform data for frontend
    const transformedUsers = users.map(user => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive !== false,
      createdAt: user.createdAt,
      branch: user.assignedBranch ? {
        _id: user.assignedBranch._id,
        name: user.assignedBranch.name
      } : null
    }));

    res.json({
      success: true,
      data: {
        users: transformedUsers,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total
        }
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
};

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('-password')
      .populate('branchId', 'name code')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, data: { user } });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user' });
  }
};

// Update user status (activate/deactivate)
exports.updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { isActive },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: { user }
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user status' });
  }
};

// Update user role
exports.updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role, assignedBranch } = req.body;

    const validRoles = ['customer', 'branch_manager', 'staff', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // If changing to branch_manager, handle branch assignment
    if (role === 'branch_manager' && assignedBranch) {
      // Remove from old branch if was branch_manager
      if (user.role === 'branch_manager' && user.assignedBranch) {
        await Branch.findByIdAndUpdate(user.assignedBranch, { $unset: { manager: 1 } });
      }
      
      // Check if branch already has a manager
      const existingManager = await User.findOne({
        _id: { $ne: userId },
        role: 'branch_manager',
        assignedBranch: assignedBranch
      });
      
      if (existingManager) {
        return res.status(400).json({ 
          success: false, 
          message: 'This branch already has a manager assigned' 
        });
      }
      
      // Assign to new branch
      await Branch.findByIdAndUpdate(assignedBranch, { manager: userId });
      user.assignedBranch = assignedBranch;
    } else if (role !== 'branch_manager') {
      // If changing away from branch_manager, remove from branch
      if (user.role === 'branch_manager' && user.assignedBranch) {
        await Branch.findByIdAndUpdate(user.assignedBranch, { $unset: { manager: 1 } });
      }
      user.assignedBranch = undefined;
    }

    user.role = role;
    await user.save();

    const updatedUser = await User.findById(userId)
      .select('-password')
      .populate('assignedBranch', 'name code');

    res.json({
      success: true,
      message: 'User role updated successfully',
      data: { user: updatedUser }
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user role' });
  }
};

// Create new user
exports.createUser = async (req, res) => {
  try {
    const { name, email, phone, password, role, assignedBranch } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, email and password are required' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, ...(phone ? [{ phone }] : [])]
    });

    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'User with this email or phone already exists' 
      });
    }

    // Validate role
    const validRoles = ['customer', 'branch_manager', 'staff', 'admin'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    // If branch_manager, validate branch assignment
    if (role === 'branch_manager' && assignedBranch) {
      const branch = await Branch.findById(assignedBranch);
      if (!branch) {
        return res.status(400).json({ success: false, message: 'Branch not found' });
      }

      // Check if branch already has a manager
      const existingManager = await User.findOne({
        role: 'branch_manager',
        assignedBranch: assignedBranch
      });

      if (existingManager) {
        return res.status(400).json({ 
          success: false, 
          message: 'This branch already has a manager assigned' 
        });
      }
    }

    // Create user
    const user = new User({
      name,
      email,
      phone,
      password, // Will be hashed by pre-save hook
      role: role || 'customer',
      assignedBranch: (role === 'branch_manager' || role === 'staff') ? assignedBranch : undefined,
      isActive: true,
      isEmailVerified: true // Auto-verify for admin-created users
    });

    await user.save();

    // If branch_manager, update branch with manager reference
    if (role === 'branch_manager' && assignedBranch) {
      await Branch.findByIdAndUpdate(assignedBranch, { manager: user._id });
    }

    // Return user without password
    const createdUser = await User.findById(user._id)
      .select('-password')
      .populate('assignedBranch', 'name code');

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { user: createdUser }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Failed to create user' });
  }
};
