const User = require('../models/User')
const Order = require('../models/Order')

const centerAdminCustomersController = {
  // Get all customers with pagination and filters
  getAllCustomers: async (req, res) => {
    try {
      const { 
        page = 1, 
        limit = 8, 
        search, 
        status,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query

      const pageNum = parseInt(page)
      const limitNum = parseInt(limit)
      const skip = (pageNum - 1) * limitNum

      // Build query
      const query = { role: 'customer' }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ]
      }

      if (status === 'active') {
        query.isActive = true
      } else if (status === 'inactive') {
        query.isActive = false
      }

      // Get total count for pagination
      const total = await User.countDocuments(query)

      // Get customers
      const customers = await User.find(query)
        .select('-password')
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(limitNum)
        .lean()

      // Get order stats for each customer
      const customersWithStats = await Promise.all(
        customers.map(async (customer) => {
          const orderStats = await Order.aggregate([
            { $match: { customer: customer._id } },
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalSpent: { $sum: '$pricing.total' },
                avgOrderValue: { $avg: '$pricing.total' }
              }
            }
          ])

          const stats = orderStats[0] || { totalOrders: 0, totalSpent: 0, avgOrderValue: 0 }

          return {
            ...customer,
            orderStats: {
              totalOrders: stats.totalOrders,
              totalSpent: stats.totalSpent || 0,
              avgOrderValue: stats.avgOrderValue || 0
            }
          }
        })
      )

      // Calculate overall stats from database (not just current page)
      const overallStats = await User.aggregate([
        { $match: { role: 'customer' } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: ['$isActive', 1, 0] } },
            inactive: { $sum: { $cond: ['$isActive', 0, 1] } }
          }
        }
      ])

      const stats = overallStats[0] || { total: 0, active: 0, inactive: 0 }

      res.json({
        success: true,
        data: {
          customers: customersWithStats,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
          },
          stats: {
            total: stats.total,
            active: stats.active,
            inactive: stats.inactive
          }
        }
      })
    } catch (error) {
      console.error('Get customers error:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customers'
      })
    }
  },

  // Get customer by ID
  getCustomerById: async (req, res) => {
    try {
      const { customerId } = req.params

      const customer = await User.findById(customerId)
        .select('-password')
        .lean()

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        })
      }

      // Get order stats
      const orderStats = await Order.aggregate([
        { $match: { customer: customer._id } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalSpent: { $sum: '$pricing.total' },
            avgOrderValue: { $avg: '$pricing.total' }
          }
        }
      ])

      const stats = orderStats[0] || { totalOrders: 0, totalSpent: 0, avgOrderValue: 0 }

      res.json({
        success: true,
        data: {
          customer: {
            ...customer,
            orderStats: {
              totalOrders: stats.totalOrders,
              totalSpent: stats.totalSpent || 0,
              avgOrderValue: stats.avgOrderValue || 0
            }
          }
        }
      })
    } catch (error) {
      console.error('Get customer by ID error:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customer'
      })
    }
  },

  // Update customer status
  updateCustomerStatus: async (req, res) => {
    try {
      const { customerId } = req.params
      const { isActive } = req.body

      const customer = await User.findById(customerId)
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        })
      }

      customer.isActive = isActive
      await customer.save()

      res.json({
        success: true,
        message: `Customer ${isActive ? 'activated' : 'deactivated'} successfully`,
        data: { customer }
      })
    } catch (error) {
      console.error('Update customer status error:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to update customer status'
      })
    }
  },

  // Get customer orders
  getCustomerOrders: async (req, res) => {
    try {
      const { customerId } = req.params
      const { page = 1, limit = 10 } = req.query

      const pageNum = parseInt(page)
      const limitNum = parseInt(limit)
      const skip = (pageNum - 1) * limitNum

      const total = await Order.countDocuments({ customer: customerId })

      const orders = await Order.find({ customer: customerId })
        .populate('branch', 'name code')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean()

      res.json({
        success: true,
        data: {
          orders,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum)
          }
        }
      })
    } catch (error) {
      console.error('Get customer orders error:', error)
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customer orders'
      })
    }
  }
}

module.exports = centerAdminCustomersController
