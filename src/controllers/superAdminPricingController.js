const Pricing = require('../models/Pricing')
const AuditLog = require('../models/AuditLog')
const { validationResult } = require('express-validator')

class CenterAdminPricingController {
  // Get all pricing configurations
  async getPricingConfigurations(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        status,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query

      // Build query
      const query = {}
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { version: { $regex: search, $options: 'i' } }
        ]
      }
      
      if (status) {
        if (status === 'active') {
          query.isActive = true
        } else if (status === 'inactive') {
          query.isActive = false
        } else {
          query.approvalStatus = status
        }
      }

      // Execute query with pagination
      const pricingConfigs = await Pricing.find(query)
        .populate('createdBy', 'name email')
        .populate('approvedBy', 'name email')
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean()

      const total = await Pricing.countDocuments(query)

      return res.json({
        success: true,
        data: {
          pricingConfigs,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
            limit: parseInt(limit)
          }
        }
      })
    } catch (error) {
      console.error('Get pricing configurations error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch pricing configurations'
      })
    }
  }

  // Get single pricing configuration
  async getPricingConfiguration(req, res) {
    try {
      const { pricingId } = req.params

      const pricing = await Pricing.findById(pricingId)
        .populate('createdBy', 'name email')
        .populate('approvedBy', 'name email')
        .populate('lastModifiedBy', 'name email')

      if (!pricing) {
        return res.status(404).json({
          success: false,
          message: 'Pricing configuration not found'
        })
      }

      return res.json({
        success: true,
        data: { pricing }
      })
    } catch (error) {
      console.error('Get pricing configuration error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch pricing configuration'
      })
    }
  }

  // Get active pricing
  async getActivePricing(req, res) {
    try {
      const pricing = await Pricing.getActivePricing()

      if (!pricing) {
        return res.status(404).json({
          success: false,
          message: 'No active pricing configuration found'
        })
      }

      return res.json({
        success: true,
        data: { pricing }
      })
    } catch (error) {
      console.error('Get active pricing error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch active pricing'
      })
    }
  }

  // Create pricing configuration
  async createPricingConfiguration(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const pricingData = {
        ...req.body,
        createdBy: req.admin._id
      }

      // Check if version already exists
      const existingPricing = await Pricing.findOne({ version: pricingData.version })
      if (existingPricing) {
        return res.status(400).json({
          success: false,
          message: 'Pricing version already exists'
        })
      }

      const pricing = new Pricing(pricingData)
      await pricing.save()

      // Log the creation
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'create_pricing_configuration',
        category: 'settings',
        description: `Created pricing configuration: ${pricing.name} (${pricing.version})`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'pricing',
        resourceId: pricing._id.toString(),
        status: 'success',
        riskLevel: 'medium',
        metadata: {
          pricingName: pricing.name,
          version: pricing.version,
          serviceItemsCount: pricing.serviceItems.length,
          discountPoliciesCount: pricing.discountPolicies.length
        }
      })

      return res.status(201).json({
        success: true,
        message: 'Pricing configuration created successfully',
        data: { pricing }
      })
    } catch (error) {
      console.error('Create pricing configuration error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to create pricing configuration'
      })
    }
  }

  // Update pricing configuration
  async updatePricingConfiguration(req, res) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        })
      }

      const { pricingId } = req.params
      const updateData = req.body

      const pricing = await Pricing.findById(pricingId)
      if (!pricing) {
        return res.status(404).json({
          success: false,
          message: 'Pricing configuration not found'
        })
      }

      // Check if pricing is approved and active
      if (pricing.approvalStatus === 'approved' && pricing.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Cannot modify active approved pricing. Create a new version instead.'
        })
      }

      // Store original data for audit
      const originalData = pricing.toObject()

      // Update pricing
      Object.assign(pricing, updateData)
      pricing.lastModifiedBy = req.admin._id
      await pricing.save()

      // Log the update
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'update_pricing_configuration',
        category: 'settings',
        description: `Updated pricing configuration: ${pricing.name} (${pricing.version})`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'pricing',
        resourceId: pricing._id.toString(),
        status: 'success',
        riskLevel: 'high',
        changes: {
          before: originalData,
          after: pricing.toObject()
        }
      })

      return res.json({
        success: true,
        message: 'Pricing configuration updated successfully',
        data: { pricing }
      })
    } catch (error) {
      console.error('Update pricing configuration error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to update pricing configuration'
      })
    }
  }

  // Approve pricing configuration
  async approvePricingConfiguration(req, res) {
    try {
      const { pricingId } = req.params
      const { makeActive = false } = req.body

      const pricing = await Pricing.findById(pricingId)
      if (!pricing) {
        return res.status(404).json({
          success: false,
          message: 'Pricing configuration not found'
        })
      }

      if (pricing.approvalStatus === 'approved') {
        return res.status(400).json({
          success: false,
          message: 'Pricing configuration is already approved'
        })
      }

      // Update approval status
      pricing.approvalStatus = 'approved'
      pricing.approvedBy = req.admin._id
      pricing.approvedAt = new Date()

      if (makeActive) {
        // Deactivate other pricing configurations
        await Pricing.updateMany(
          { _id: { $ne: pricingId } },
          { isActive: false, isDefault: false }
        )
        
        pricing.isActive = true
        pricing.isDefault = true
        pricing.effectiveFrom = new Date()
      }

      await pricing.save()

      // Log the approval
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'approve_pricing_configuration',
        category: 'settings',
        description: `Approved pricing configuration: ${pricing.name} (${pricing.version})${makeActive ? ' and made active' : ''}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'pricing',
        resourceId: pricing._id.toString(),
        status: 'success',
        riskLevel: 'high',
        metadata: {
          pricingName: pricing.name,
          version: pricing.version,
          makeActive
        }
      })

      return res.json({
        success: true,
        message: `Pricing configuration approved successfully${makeActive ? ' and activated' : ''}`,
        data: { pricing }
      })
    } catch (error) {
      console.error('Approve pricing configuration error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to approve pricing configuration'
      })
    }
  }

  // Activate pricing configuration
  async activatePricingConfiguration(req, res) {
    try {
      const { pricingId } = req.params

      const pricing = await Pricing.findById(pricingId)
      if (!pricing) {
        return res.status(404).json({
          success: false,
          message: 'Pricing configuration not found'
        })
      }

      if (pricing.approvalStatus !== 'approved') {
        return res.status(400).json({
          success: false,
          message: 'Pricing configuration must be approved before activation'
        })
      }

      // Deactivate other pricing configurations
      await Pricing.updateMany(
        { _id: { $ne: pricingId } },
        { isActive: false, isDefault: false }
      )

      // Activate this pricing
      pricing.isActive = true
      pricing.isDefault = true
      pricing.effectiveFrom = new Date()
      await pricing.save()

      // Log the activation
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'activate_pricing_configuration',
        category: 'settings',
        description: `Activated pricing configuration: ${pricing.name} (${pricing.version})`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'pricing',
        resourceId: pricing._id.toString(),
        status: 'success',
        riskLevel: 'critical',
        metadata: {
          pricingName: pricing.name,
          version: pricing.version
        }
      })

      return res.json({
        success: true,
        message: 'Pricing configuration activated successfully',
        data: { pricing }
      })
    } catch (error) {
      console.error('Activate pricing configuration error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to activate pricing configuration'
      })
    }
  }

  // Calculate price for items
  async calculatePrice(req, res) {
    try {
      const { items, options = {} } = req.body

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Items array is required'
        })
      }

      // Get active pricing
      const pricing = await Pricing.getActivePricing()
      if (!pricing) {
        return res.status(404).json({
          success: false,
          message: 'No active pricing configuration found'
        })
      }

      // Calculate total
      const calculation = pricing.calculateOrderTotal(items, options)

      return res.json({
        success: true,
        data: {
          calculation,
          pricingVersion: pricing.version
        }
      })
    } catch (error) {
      console.error('Calculate price error:', error)
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to calculate price'
      })
    }
  }

  // Get service items
  async getServiceItems(req, res) {
    try {
      const { category } = req.query

      const pricing = await Pricing.getActivePricing()
      if (!pricing) {
        return res.status(404).json({
          success: false,
          message: 'No active pricing configuration found'
        })
      }

      let serviceItems = pricing.serviceItems.filter(item => item.isActive)
      
      if (category) {
        serviceItems = serviceItems.filter(item => item.category === category)
      }

      return res.json({
        success: true,
        data: {
          serviceItems,
          pricingVersion: pricing.version
        }
      })
    } catch (error) {
      console.error('Get service items error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch service items'
      })
    }
  }

  // Get discount policies
  async getDiscountPolicies(req, res) {
    try {
      const { active = true } = req.query

      const pricing = await Pricing.getActivePricing()
      if (!pricing) {
        return res.status(404).json({
          success: false,
          message: 'No active pricing configuration found'
        })
      }

      let discountPolicies = pricing.discountPolicies
      
      if (active === 'true') {
        const now = new Date()
        discountPolicies = discountPolicies.filter(policy => 
          policy.isActive && 
          now >= policy.startDate && 
          now <= policy.endDate
        )
      }

      return res.json({
        success: true,
        data: {
          discountPolicies,
          pricingVersion: pricing.version
        }
      })
    } catch (error) {
      console.error('Get discount policies error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch discount policies'
      })
    }
  }

  // Validate discount code
  async validateDiscountCode(req, res) {
    try {
      const { code, orderValue = 0, customerInfo = {} } = req.body

      if (!code) {
        return res.status(400).json({
          success: false,
          message: 'Discount code is required'
        })
      }

      const pricing = await Pricing.getActivePricing()
      if (!pricing) {
        return res.status(404).json({
          success: false,
          message: 'No active pricing configuration found'
        })
      }

      const discountResult = pricing.applyDiscount(orderValue, code, customerInfo)

      if (!discountResult.appliedDiscount) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired discount code'
        })
      }

      return res.json({
        success: true,
        data: {
          isValid: true,
          discount: discountResult.discount,
          discountPolicy: discountResult.appliedDiscount,
          finalAmount: discountResult.finalAmount
        }
      })
    } catch (error) {
      console.error('Validate discount code error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to validate discount code'
      })
    }
  }

  // Clone pricing configuration
  async clonePricingConfiguration(req, res) {
    try {
      const { pricingId } = req.params
      const { newVersion, newName } = req.body

      const originalPricing = await Pricing.findById(pricingId)
      if (!originalPricing) {
        return res.status(404).json({
          success: false,
          message: 'Pricing configuration not found'
        })
      }

      // Check if new version already exists
      const existingPricing = await Pricing.findOne({ version: newVersion })
      if (existingPricing) {
        return res.status(400).json({
          success: false,
          message: 'Pricing version already exists'
        })
      }

      // Create clone
      const clonedData = originalPricing.toObject()
      delete clonedData._id
      delete clonedData.createdAt
      delete clonedData.updatedAt
      delete clonedData.approvedBy
      delete clonedData.approvedAt

      const clonedPricing = new Pricing({
        ...clonedData,
        name: newName || `${originalPricing.name} (Copy)`,
        version: newVersion,
        isActive: false,
        isDefault: false,
        approvalStatus: 'draft',
        createdBy: req.admin._id,
        effectiveFrom: null,
        effectiveTo: null
      })

      await clonedPricing.save()

      // Log the cloning
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'clone_pricing_configuration',
        category: 'settings',
        description: `Cloned pricing configuration from ${originalPricing.version} to ${newVersion}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        sessionId: req.sessionId,
        resourceType: 'pricing',
        resourceId: clonedPricing._id.toString(),
        status: 'success',
        riskLevel: 'medium',
        metadata: {
          originalVersion: originalPricing.version,
          newVersion,
          originalId: originalPricing._id.toString()
        }
      })

      return res.status(201).json({
        success: true,
        message: 'Pricing configuration cloned successfully',
        data: { pricing: clonedPricing }
      })
    } catch (error) {
      console.error('Clone pricing configuration error:', error)
      return res.status(500).json({
        success: false,
        message: 'Failed to clone pricing configuration'
      })
    }
  }
}

module.exports = new CenterAdminPricingController()