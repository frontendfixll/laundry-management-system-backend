const Branch = require('../../models/Branch')
const User = require('../../models/User')
const { validationResult } = require('express-validator')
const { getPagination } = require('../../utils/helpers')

class AdminBranchController {
  // Get branches for current tenancy
  async getBranches(req, res) {
    try {
      console.log('📋 Getting branches - User:', req.user?.email, 'Tenancy:', req.user?.tenancy)
      
      const { page = 1, limit = 10, search, status, city } = req.query
      const { skip, limit: limitNum, page: pageNum } = getPagination(page, limit)

      // Get tenancy from authenticated admin
      const tenancyId = req.user.tenancy

      if (!tenancyId) {
        console.log('❌ No tenancy found for user')
        return res.status(400).json({
          success: false,
          message: 'Tenancy not found'
        })
      }

      console.log('🔍 Searching branches for tenancy:', tenancyId)

      // Build query with tenancy filter
      const query = { tenancy: tenancyId }
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { code: { $regex: search, $options: 'i' } },
          { 'address.city': { $regex: search, $options: 'i' } }
        ]
      }
      
      if (status) {
        if (status === 'active') query.isActive = true
        else if (status === 'inactive') query.isActive = false
        else query.status = status
      }
      
      if (city) {
        query['address.city'] = { $regex: city, $options: 'i' }
      }

      const total = await Branch.countDocuments(query)
      console.log('📊 Found', total, 'branches matching query')
      
      const branches = await Branch.find(query)
        .populate('manager', 'name email phone')
        .populate('staff.userId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean()

      console.log('📋 Returning', branches.length, 'branches')

      // Add computed metrics
      const branchesWithStats = branches.map(branch => {
        const staffCount = branch.staff?.filter(s => s.isActive).length || 0
        
        return {
          ...branch,
          staffCount,
          utilizationRate: branch.metrics?.totalOrders 
            ? Math.round((branch.metrics.totalOrders / (branch.capacity?.maxOrdersPerDay || 100)) * 100)
            : 0
        }
      })

      return res.json({
        success: true,
        data: {
          branches: branchesWithStats,
          pagination: {
            current: pageNum,
            pages: Math.ceil(total / limitNum),
            total,
            limit: limitNum
          }
        }
      })
    } catch (error) {
      console.error('❌ Get branches error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch branches'
      })
    }
  }

  // Create new branch
  async createBranch(req, res) {
    try {
      console.log('📝 Creating branch - Request body:', req.body)
      console.log('📝 Creating branch - User:', req.user?.email, 'Tenancy:', req.user?.tenancy)
      
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        console.log('❌ Validation errors:', errors.array())
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const tenancyId = req.user.tenancy

      if (!tenancyId) {
        console.log('❌ No tenancy found for user')
        return res.status(400).json({
          success: false,
          message: 'Tenancy not found'
        })
      }

      // Check if branch code is unique
      const existingBranch = await Branch.findOne({ code: req.body.code })
      if (existingBranch) {
        console.log('❌ Branch code already exists:', req.body.code)
        return res.status(400).json({
          success: false,
          message: 'Branch code already exists'
        })
      }

      const branchData = {
        ...req.body,
        tenancy: tenancyId,
        createdBy: req.user._id
      }

      console.log('📝 Final branch data to save:', branchData)

      const branch = new Branch(branchData)
      await branch.save()

      console.log('✅ Branch created successfully:', branch._id)

      return res.status(201).json({
        success: true,
        message: 'Branch created successfully',
        data: { 
          branch,
          subscriptionLimit: req.subscriptionLimit // Include limit info in response
        }
      })
    } catch (error) {
      console.error('❌ Create branch error:', error)
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
      const tenancyId = req.user.tenancy

      const branch = await Branch.findOne({ 
        _id: branchId, 
        tenancy: tenancyId 
      })

      if (!branch) {
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        })
      }

      // Sync status and isActive fields
      if (req.body.status) {
        if (req.body.status === 'active') {
          req.body.isActive = true
        } else if (req.body.status === 'inactive') {
          req.body.isActive = false
        }
      }
      
      // If isActive is explicitly set, sync status
      if (typeof req.body.isActive === 'boolean') {
        if (req.body.isActive && (!req.body.status || req.body.status === 'inactive')) {
          req.body.status = 'active'
        } else if (!req.body.isActive) {
          req.body.status = 'inactive'
        }
      }

      // Update branch
      Object.assign(branch, req.body)
      branch.lastModifiedBy = req.user._id
      await branch.save()

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

  // Get single branch
  async getBranch(req, res) {
    try {
      const { branchId } = req.params
      const tenancyId = req.user.tenancy

      const branch = await Branch.findOne({ 
        _id: branchId, 
        tenancy: tenancyId 
      })
        .populate('manager', 'name email phone')
        .populate('staff.userId', 'name email phone')
        .populate('createdBy', 'name email')

      if (!branch) {
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        })
      }

      const staffCount = branch.staff?.filter(s => s.isActive).length || 0
      const isOperational = branch.isActive && branch.status === 'active'

      return res.json({
        success: true,
        data: {
          branch,
          staffCount,
          isOperational
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

  // Delete/Deactivate branch
  async deleteBranch(req, res) {
    try {
      console.log('🗑️ Deleting branch - Branch ID:', req.params.branchId)
      console.log('🗑️ Deleting branch - User:', req.user?.email, 'Tenancy:', req.user?.tenancy)
      
      const { branchId } = req.params
      const tenancyId = req.user.tenancy

      const branch = await Branch.findOne({ 
        _id: branchId, 
        tenancy: tenancyId 
      })

      if (!branch) {
        console.log('❌ Branch not found for deletion')
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        })
      }

      console.log('🗑️ Found branch to delete:', branch.name, branch.code)

      // Soft delete - deactivate branch
      branch.isActive = false
      branch.status = 'inactive'
      branch.lastModifiedBy = req.user._id
      await branch.save()

      console.log('✅ Branch deactivated successfully')

      return res.json({
        success: true,
        message: 'Branch deactivated successfully'
      })
    } catch (error) {
      console.error('❌ Delete branch error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to deactivate branch'
      })
    }
  }
}

module.exports = new AdminBranchController()