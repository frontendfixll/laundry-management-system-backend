const Service = require('../../models/Service')
const Branch = require('../../models/Branch')
const Order = require('../../models/Order')
const { sendSuccess, sendError, asyncHandler } = require('../../utils/helpers')

// @desc    Get all services
// @route   GET /api/admin/services
// @access  Private (Admin, Center Admin)
const getServices = asyncHandler(async (req, res) => {
  const { category, isActive, branchId } = req.query

  const query = {}
  if (category) query.category = category
  if (isActive !== undefined) query.isActive = isActive === 'true'

  let services = await Service.find(query)
    .populate('branches.branch', 'name code')
    .populate('createdBy', 'name')
    .sort({ sortOrder: 1, createdAt: -1 })

  // If branchId provided, filter and add branch-specific info
  if (branchId) {
    services = services.map(service => {
      const branchConfig = service.branches.find(b => 
        b.branch && b.branch._id.toString() === branchId
      )
      return {
        ...service.toObject(),
        branchConfig: branchConfig || null,
        isActiveForBranch: branchConfig ? branchConfig.isActive : service.isActive
      }
    })
  }

  sendSuccess(res, { services }, 'Services retrieved successfully')
})

// @desc    Get single service
// @route   GET /api/admin/services/:id
// @access  Private (Admin, Center Admin)
const getService = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id)
    .populate('branches.branch', 'name code address')
    .populate('createdBy', 'name email')

  if (!service) {
    return sendError(res, 'NOT_FOUND', 'Service not found', 404)
  }

  sendSuccess(res, { service }, 'Service retrieved successfully')
})

// @desc    Create new service
// @route   POST /api/admin/services
// @access  Private (Admin, Center Admin)
const createService = asyncHandler(async (req, res) => {
  const {
    name,
    code,
    displayName,
    description,
    icon,
    category,
    basePriceMultiplier,
    turnaroundTime,
    isExpressAvailable,
    sortOrder
  } = req.body

  // Check if service code already exists
  const existingService = await Service.findOne({ code: code.toLowerCase() })
  if (existingService) {
    return sendError(res, 'DUPLICATE', 'Service with this code already exists', 400)
  }

  const service = await Service.create({
    name,
    code: code.toLowerCase(),
    displayName: displayName || name,
    description,
    icon,
    category,
    basePriceMultiplier,
    turnaroundTime,
    isExpressAvailable,
    sortOrder,
    createdBy: req.user._id
  })

  sendSuccess(res, { service }, 'Service created successfully', 201)
})

// @desc    Update service
// @route   PUT /api/admin/services/:id
// @access  Private (Admin, Center Admin)
const updateService = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id)

  if (!service) {
    return sendError(res, 'NOT_FOUND', 'Service not found', 404)
  }

  const {
    name,
    displayName,
    description,
    icon,
    category,
    basePriceMultiplier,
    turnaroundTime,
    isExpressAvailable,
    isActive,
    sortOrder
  } = req.body

  // Update fields
  if (name) service.name = name
  if (displayName) service.displayName = displayName
  if (description !== undefined) service.description = description
  if (icon) service.icon = icon
  if (category) service.category = category
  if (basePriceMultiplier !== undefined) service.basePriceMultiplier = basePriceMultiplier
  if (turnaroundTime) service.turnaroundTime = turnaroundTime
  if (isExpressAvailable !== undefined) service.isExpressAvailable = isExpressAvailable
  if (isActive !== undefined) service.isActive = isActive
  if (sortOrder !== undefined) service.sortOrder = sortOrder

  await service.save()

  sendSuccess(res, { service }, 'Service updated successfully')
})

// @desc    Delete service
// @route   DELETE /api/admin/services/:id
// @access  Private (Admin)
const deleteService = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id)

  if (!service) {
    return sendError(res, 'NOT_FOUND', 'Service not found', 404)
  }

  await service.deleteOne()

  sendSuccess(res, null, 'Service deleted successfully')
})

// @desc    Assign service to branch
// @route   POST /api/admin/services/:id/branches
// @access  Private (Admin, Center Admin)
const assignServiceToBranch = asyncHandler(async (req, res) => {
  const { branchId, isActive, priceMultiplier, customTurnaround } = req.body

  const service = await Service.findById(req.params.id)
  if (!service) {
    return sendError(res, 'NOT_FOUND', 'Service not found', 404)
  }

  const branch = await Branch.findById(branchId)
  if (!branch) {
    return sendError(res, 'NOT_FOUND', 'Branch not found', 404)
  }

  // Check if branch already assigned
  const existingIndex = service.branches.findIndex(
    b => b.branch.toString() === branchId
  )

  if (existingIndex >= 0) {
    // Update existing
    service.branches[existingIndex] = {
      branch: branchId,
      isActive: isActive !== undefined ? isActive : true,
      priceMultiplier: priceMultiplier || 1.0,
      customTurnaround
    }
  } else {
    // Add new
    service.branches.push({
      branch: branchId,
      isActive: isActive !== undefined ? isActive : true,
      priceMultiplier: priceMultiplier || 1.0,
      customTurnaround
    })
  }

  await service.save()

  const updatedService = await Service.findById(req.params.id)
    .populate('branches.branch', 'name code')

  sendSuccess(res, { service: updatedService }, 'Service assigned to branch successfully')
})

// @desc    Update branch-specific service settings
// @route   PUT /api/admin/services/:id/branches/:branchId
// @access  Private (Admin, Center Admin)
const updateBranchService = asyncHandler(async (req, res) => {
  const { id, branchId } = req.params
  const { isActive, priceMultiplier, customTurnaround } = req.body

  const service = await Service.findById(id)
  if (!service) {
    return sendError(res, 'NOT_FOUND', 'Service not found', 404)
  }

  const branchIndex = service.branches.findIndex(
    b => b.branch.toString() === branchId
  )

  if (branchIndex < 0) {
    return sendError(res, 'NOT_FOUND', 'Service not assigned to this branch', 404)
  }

  // Update branch config
  if (isActive !== undefined) service.branches[branchIndex].isActive = isActive
  if (priceMultiplier !== undefined) service.branches[branchIndex].priceMultiplier = priceMultiplier
  if (customTurnaround) service.branches[branchIndex].customTurnaround = customTurnaround

  await service.save()

  const updatedService = await Service.findById(id)
    .populate('branches.branch', 'name code')

  sendSuccess(res, { service: updatedService }, 'Branch service settings updated successfully')
})

// @desc    Remove service from branch
// @route   DELETE /api/admin/services/:id/branches/:branchId
// @access  Private (Admin, Center Admin)
const removeServiceFromBranch = asyncHandler(async (req, res) => {
  const { id, branchId } = req.params

  const service = await Service.findById(id)
  if (!service) {
    return sendError(res, 'NOT_FOUND', 'Service not found', 404)
  }

  service.branches = service.branches.filter(
    b => b.branch.toString() !== branchId
  )

  await service.save()

  sendSuccess(res, { service }, 'Service removed from branch successfully')
})

// @desc    Get services for a specific branch
// @route   GET /api/admin/branches/:branchId/services
// @access  Private (Admin, Center Admin, Branch Manager)
const getBranchServices = asyncHandler(async (req, res) => {
  const { branchId } = req.params

  const branch = await Branch.findById(branchId)
  if (!branch) {
    return sendError(res, 'NOT_FOUND', 'Branch not found', 404)
  }

  // Get all active services
  const allServices = await Service.find({ isActive: true })
    .sort({ sortOrder: 1 })

  // Map services with branch-specific info
  const services = allServices.map(service => {
    const branchConfig = service.branches.find(
      b => b.branch.toString() === branchId
    )

    return {
      _id: service._id,
      name: service.name,
      code: service.code,
      displayName: service.displayName,
      description: service.description,
      icon: service.icon,
      category: service.category,
      isActive: branchConfig ? branchConfig.isActive : service.isActive,
      priceMultiplier: branchConfig ? branchConfig.priceMultiplier : service.basePriceMultiplier,
      turnaroundTime: branchConfig?.customTurnaround || service.turnaroundTime,
      isExpressAvailable: service.isExpressAvailable,
      isAssigned: !!branchConfig
    }
  })

  sendSuccess(res, { branch, services }, 'Branch services retrieved successfully')
})

// @desc    Bulk assign services to branch
// @route   POST /api/admin/branches/:branchId/services/bulk
// @access  Private (Admin, Center Admin)
const bulkAssignServices = asyncHandler(async (req, res) => {
  const { branchId } = req.params
  const { serviceIds, isActive = true } = req.body

  const branch = await Branch.findById(branchId)
  if (!branch) {
    return sendError(res, 'NOT_FOUND', 'Branch not found', 404)
  }

  // Update each service
  await Promise.all(serviceIds.map(async (serviceId) => {
    const service = await Service.findById(serviceId)
    if (service) {
      const existingIndex = service.branches.findIndex(
        b => b.branch.toString() === branchId
      )

      if (existingIndex >= 0) {
        service.branches[existingIndex].isActive = isActive
      } else {
        service.branches.push({
          branch: branchId,
          isActive,
          priceMultiplier: 1.0
        })
      }

      await service.save()
    }
  }))

  sendSuccess(res, null, `${serviceIds.length} services assigned to branch successfully`)
})

module.exports = {
  getServices,
  getService,
  createService,
  updateService,
  deleteService,
  assignServiceToBranch,
  updateBranchService,
  removeServiceFromBranch,
  getBranchServices,
  bulkAssignServices
}
