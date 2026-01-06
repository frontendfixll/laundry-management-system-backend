const Service = require('../../models/Service')
const Order = require('../../models/Order')
const { sendSuccess, sendError, asyncHandler } = require('../../utils/helpers')

// @desc    Get all services
// @route   GET /api/admin/services
// @access  Private (Admin, Center Admin)
const getServices = asyncHandler(async (req, res) => {
  const { category, isActive } = req.query

  const query = {}
  if (category) query.category = category
  if (isActive !== undefined) query.isActive = isActive === 'true'

  const services = await Service.find(query)
    .populate('createdBy', 'name')
    .sort({ sortOrder: 1, createdAt: -1 })

  sendSuccess(res, { services }, 'Services retrieved successfully')
})

// @desc    Get single service
// @route   GET /api/admin/services/:id
// @access  Private (Admin, Center Admin)
const getService = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id)
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

  // Check if service is being used in any orders
  const ordersUsingService = await Order.countDocuments({ 
    'items.service': service.code 
  })

  if (ordersUsingService > 0) {
    return sendError(res, 'IN_USE', 'Cannot delete service that is being used in orders', 400)
  }

  await service.deleteOne()

  sendSuccess(res, null, 'Service deleted successfully')
})

module.exports = {
  getServices,
  getService,
  createService,
  updateService,
  deleteService
}
