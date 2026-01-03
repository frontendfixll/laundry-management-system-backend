const Branch = require('../models/Branch')
const User = require('../models/User')
const Role = require('../models/Role')
const Order = require('../models/Order')
const AuditLog = require('../models/AuditLog')
const { validationResult } = require('express-validator')

class CenterAdminBranchController {
  // Get all branches with filters and pagination
  async getBranches(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        status,
        city,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query

      // Build query
      const query = {}
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { code: { $regex: search, $options: 'i' } },
          { 'address.city': { $regex: search, $options: 'i' } }
        ]
      }
      
      if (status) {
        query.status = status
      }
      
      if (city) {
        query['address.city'] = { $regex: city, $options: 'i' }
      }

      // Execute query with pagination
      const branches = await Branch.find(query)
        .populate('manager', 'name email phone')
        .populate('staff.userId', 'name email')
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean()

      const total = await Branch.countDocuments(query)

      // Get order stats for all branches in one aggregation
      const branchIds = branches.map(b => b._id)
      const orderStats = await Order.aggregate([
        {
          $match: {
            $or: [
              { branchId: { $in: branchIds } },
              { branch: { $in: branchIds } }
            ]
          }
        },
        {
          $group: {
            _id: { $ifNull: ['$branchId', '$branch'] },
            totalOrders: { $sum: 1 },
            completedOrders: {
              $sum: { $cond: [{ $in: ['$status', ['delivered', 'completed']] }, 1, 0] }
            },
            totalRevenue: { $sum: { $ifNull: ['$totalAmount', { $ifNull: ['$pricing.total', 0] }] } }
          }
        }
      ])

      // Create a map for quick lookup
      const statsMap = {}
      orderStats.forEach(stat => {
        statsMap[stat._id.toString()] = stat
      })

      // Add computed fields with real data
      const branchesWithStats = branches.map(branch => {
        const branchStats = statsMap[branch._id.toString()] || { totalOrders: 0, completedOrders: 0, totalRevenue: 0 }
        const staffCount = branch.staff?.filter(s => s.isActive).length || 0
        
        // Calculate efficiency: (completed orders / total orders) * 100
        const efficiency = branchStats.totalOrders > 0 
          ? Math.round((branchStats.completedOrders / branchStats.totalOrders) * 100)
          : 0

        return {
          ...branch,
          staffCount,
          metrics: {
            ...branch.metrics,
            totalOrders: branchStats.totalOrders,
            completedOrders: branchStats.completedOrders,
            totalRevenue: branchStats.totalRevenue,
            efficiency
          },
          utilizationRate: branchStats.totalOrders 
            ? Math.round((branchStats.totalOrders / (branch.capacity?.maxOrdersPerDay || 100)) * 100)
            : 0
        }
      })

      return res.json({
        success: true,
        data: {
          branches: branchesWithStats,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
            limit: parseInt(limit)
          }
        }
      })
    } catch (error) {
      console.error('Get branches error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch branches'
      })
    }
  }

  // Get single branch details
  async getBranch(req, res) {
    try {
      // Check for validation errors
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const { branchId } = req.params

      const branch = await Branch.findById(branchId)
        .populate('manager', 'name email phone avatar')
        .populate('staff.userId', 'name email phone avatar')
        .populate('createdBy', 'name email')
        .populate('lastModifiedBy', 'name email')

      if (!branch) {
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        })
      }

      // Get recent orders for this branch - try both branchId and branch field
      let recentOrders = []
      try {
        recentOrders = await Order.find({ 
          $or: [{ branchId: branch._id }, { branch: branch._id }]
        })
          .populate('customerId', 'name email')
          .populate('customer', 'name email')
          .sort({ createdAt: -1 })
          .limit(10)
          .lean()
      } catch (orderError) {
        console.error('Error fetching recent orders:', orderError)
      }

      // Calculate additional metrics
      const today = new Date()
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      
      let monthlyData = {
        totalOrders: 0,
        totalRevenue: 0,
        completedOrders: 0
      }

      try {
        const monthlyStats = await Order.aggregate([
          {
            $match: {
              $or: [{ branchId: branch._id }, { branch: branch._id }],
              createdAt: { $gte: startOfMonth }
            }
          },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              totalRevenue: { $sum: { $ifNull: ['$totalAmount', { $ifNull: ['$pricing.total', 0] }] } },
              completedOrders: {
                $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
              }
            }
          }
        ])
        monthlyData = monthlyStats[0] || monthlyData
      } catch (statsError) {
        console.error('Error calculating monthly stats:', statsError)
      }

      // Safely call methods
      let isOperational = false
      let staffCount = 0
      
      try {
        isOperational = typeof branch.isOperationalToday === 'function' 
          ? branch.isOperationalToday() 
          : (branch.isActive && branch.status === 'active')
      } catch (e) {
        isOperational = branch.isActive && branch.status === 'active'
      }
      
      try {
        staffCount = typeof branch.getActiveStaffCount === 'function'
          ? branch.getActiveStaffCount()
          : (branch.staff?.filter(s => s.isActive).length || 0)
      } catch (e) {
        staffCount = branch.staff?.filter(s => s.isActive).length || 0
      }

      return res.json({
        success: true,
        data: {
          branch,
          recentOrders,
          monthlyStats: monthlyData,
          isOperational,
          staffCount
        }
      })
    } catch (error) {
      console.error('Get branch error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch branch details'
      })
    }
  }

  // Create new branch
  async createBranch(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const branchData = {
        ...req.body,
        createdBy: req.admin._id
      }

      // Check if branch code is unique
      const existingBranch = await Branch.findOne({ code: branchData.code })
      if (existingBranch) {
        return res.status(400).json({
          success: false,
          message: 'Branch code already exists'
        })
      }

      const branch = new Branch(branchData)
      await branch.save()

      // Create default staff types for the new branch
      const StaffType = require('../models/StaffType')
      try {
        await StaffType.createDefaultsForBranch(branch._id)
      } catch (staffTypeErr) {
        console.log('Staff types creation note:', staffTypeErr.message)
      }

      // Log the creation
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'create_branch',
        category: 'branches',
        description: `Created new branch: ${branch.name} (${branch.code})`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'branch',
        resourceId: branch._id.toString(),
        status: 'success',
        riskLevel: 'low',
        metadata: {
          branchName: branch.name,
          branchCode: branch.code,
          city: branch.address.city
        }
      })

      return res.status(201).json({
        success: true,
        message: 'Branch created successfully',
        data: { branch }
      })
    } catch (error) {
      console.error('Create branch error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to create branch'
      })
    }
  }

  // Update branch
  async updateBranch(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const { branchId } = req.params
      const updateData = req.body

      const branch = await Branch.findById(branchId)
      if (!branch) {
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        })
      }

      // Store original data for audit
      const originalData = branch.toObject()

      // Update branch
      Object.assign(branch, updateData)
      branch.lastModifiedBy = req.admin._id
      await branch.save()

      // Log the update
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'update_branch',
        category: 'branches',
        description: `Updated branch: ${branch.name} (${branch.code})`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'branch',
        resourceId: branch._id.toString(),
        status: 'success',
        riskLevel: 'medium',
        changes: {
          before: originalData,
          after: branch.toObject()
        }
      })

      return res.json({
        success: true,
        message: 'Branch updated successfully',
        data: { branch }
      })
    } catch (error) {
      console.error('Update branch error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to update branch'
      })
    }
  }

  // Delete/Deactivate branch
  async deleteBranch(req, res) {
    try {
      const { branchId } = req.params
      const { permanent = false } = req.query

      const branch = await Branch.findById(branchId)
      if (!branch) {
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        })
      }

      // Check if branch has active orders
      const activeOrders = await Order.countDocuments({
        branchId,
        status: { $in: ['placed', 'picked_up', 'in_progress', 'ready'] }
      })

      if (activeOrders > 0 && permanent) {
        return res.status(400).json({
          success: false,
          message: `Cannot permanently delete branch with ${activeOrders} active orders`
        })
      }

      if (permanent) {
        await Branch.findByIdAndDelete(branchId)
      } else {
        branch.isActive = false
        branch.status = 'inactive'
        branch.lastModifiedBy = req.admin._id
        await branch.save()
      }

      // Log the deletion
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: permanent ? 'delete_branch' : 'deactivate_branch',
        category: 'branches',
        description: `${permanent ? 'Deleted' : 'Deactivated'} branch: ${branch.name} (${branch.code})`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'branch',
        resourceId: branch._id.toString(),
        status: 'success',
        riskLevel: permanent ? 'high' : 'medium',
        metadata: {
          permanent,
          activeOrders
        }
      })

      return res.json({
        success: true,
        message: `Branch ${permanent ? 'deleted' : 'deactivated'} successfully`
      })
    } catch (error) {
      console.error('Delete branch error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to delete branch'
      })
    }
  }

  // Assign manager to branch
  async assignManager(req, res) {
    try {
      const { branchId } = req.params
      const { managerId } = req.body

      const branch = await Branch.findById(branchId)
      if (!branch) {
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        })
      }

      const manager = await User.findById(managerId)
      if (!manager) {
        return res.status(404).json({
          success: false,
          message: 'Manager not found'
        })
      }

      // Check if user has manager role
      if (manager.role !== 'branch_manager') {
        return res.status(400).json({
          success: false,
          message: 'User must have branch manager role'
        })
      }

      // Remove from previous branch if assigned
      if (manager.branchId) {
        const previousBranch = await Branch.findById(manager.branchId)
        if (previousBranch) {
          previousBranch.manager = null
          await previousBranch.save()
        }
      }

      // Assign to new branch
      branch.manager = managerId
      branch.lastModifiedBy = req.admin._id
      await branch.save()

      // Update user's branch assignment
      manager.branchId = branchId
      await manager.save()

      // Log the assignment
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'assign_branch_manager',
        category: 'branches',
        description: `Assigned ${manager.name} as manager of ${branch.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'branch',
        resourceId: branch._id.toString(),
        status: 'success',
        riskLevel: 'medium',
        metadata: {
          managerName: manager.name,
          managerEmail: manager.email,
          branchName: branch.name
        }
      })

      return res.json({
        success: true,
        message: 'Manager assigned successfully',
        data: { branch, manager }
      })
    } catch (error) {
      console.error('Assign manager error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to assign manager'
      })
    }
  }

  // Add staff to branch
  async addStaff(req, res) {
    try {
      const { branchId } = req.params
      const { userId, role, permissions, salary } = req.body

      const branch = await Branch.findById(branchId)
      if (!branch) {
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        })
      }

      const user = await User.findById(userId)
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        })
      }

      // Check if user is already staff at this branch
      const existingStaff = branch.staff.find(s => s.userId.equals(userId))
      if (existingStaff) {
        return res.status(400).json({
          success: false,
          message: 'User is already staff at this branch'
        })
      }

      // Add staff
      const staffData = {
        userId,
        role,
        permissions: permissions || {},
        salary,
        joinDate: new Date(),
        isActive: true
      }

      await branch.addStaff(staffData)

      // Update user's branch assignment
      user.branchId = branchId
      await user.save()

      // Log the addition
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'add_branch_staff',
        category: 'branches',
        description: `Added ${user.name} as ${role} to ${branch.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'branch',
        resourceId: branch._id.toString(),
        status: 'success',
        riskLevel: 'low',
        metadata: {
          staffName: user.name,
          staffRole: role,
          branchName: branch.name
        }
      })

      return res.json({
        success: true,
        message: 'Staff added successfully',
        data: { branch }
      })
    } catch (error) {
      console.error('Add staff error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to add staff'
      })
    }
  }

  // Remove staff from branch
  async removeStaff(req, res) {
    try {
      const { branchId, userId } = req.params

      const branch = await Branch.findById(branchId)
      if (!branch) {
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        })
      }

      const user = await User.findById(userId)
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        })
      }

      // Remove staff
      await branch.removeStaff(userId)

      // Clear user's branch assignment
      user.branchId = null
      await user.save()

      // Log the removal
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'remove_branch_staff',
        category: 'branches',
        description: `Removed ${user.name} from ${branch.name}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'branch',
        resourceId: branch._id.toString(),
        status: 'success',
        riskLevel: 'medium',
        metadata: {
          staffName: user.name,
          branchName: branch.name
        }
      })

      return res.json({
        success: true,
        message: 'Staff removed successfully'
      })
    } catch (error) {
      console.error('Remove staff error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to remove staff'
      })
    }
  }

  // Get branch analytics
  async getBranchAnalytics(req, res) {
    try {
      const { branchId } = req.params
      const { startDate, endDate, groupBy = 'day' } = req.query

      const branch = await Branch.findById(branchId)
      if (!branch) {
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        })
      }

      const start = new Date(startDate)
      const end = new Date(endDate)

      // Get order analytics
      const orderAnalytics = await Order.aggregate([
        {
          $match: {
            branchId: branch._id,
            createdAt: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: groupBy === 'day' ? { $dayOfMonth: '$createdAt' } : null
            },
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: '$totalAmount' },
            completedOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
            },
            cancelledOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
            }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ])

      return res.json({
        success: true,
        data: {
          branch: {
            id: branch._id,
            name: branch.name,
            code: branch.code
          },
          analytics: orderAnalytics,
          period: { startDate: start, endDate: end },
          groupBy
        }
      })
    } catch (error) {
      console.error('Branch analytics error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch branch analytics'
      })
    }
  }
}

module.exports = new CenterAdminBranchController()