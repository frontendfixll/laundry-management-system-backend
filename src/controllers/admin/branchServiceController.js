const BranchService = require('../../models/BranchService');
const Branch = require('../../models/Branch');
const Service = require('../../models/Service');
const { sendSuccess, sendError, asyncHandler } = require('../../utils/helpers');

// @desc    Get all services for a specific branch with their enabled status
// @route   GET /api/admin/branches/:branchId/services
// @access  Private (Admin)
const getBranchServices = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  
  // Verify branch exists and belongs to user's tenancy
  const branch = await Branch.findOne({ 
    _id: branchId, 
    tenancy: req.user.tenancy 
  });
  
  if (!branch) {
    return sendError(res, 'NOT_FOUND', 'Branch not found', 404);
  }
  
  // Get all services
  const allServices = await Service.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
  
  // Get branch-service configurations
  const branchServices = await BranchService.find({ 
    branch: branchId 
  }).populate('service');
  
  // Create a map of service configurations
  const serviceConfigMap = {};
  branchServices.forEach(bs => {
    serviceConfigMap[bs.service._id.toString()] = {
      isEnabled: bs.isEnabled,
      priceMultiplier: bs.priceMultiplier,
      turnaroundTimeOverride: bs.turnaroundTimeOverride,
      isExpressAvailable: bs.isExpressAvailable,
      notes: bs.notes,
      _id: bs._id
    };
  });
  
  // Combine all services with their branch-specific configurations
  const servicesWithConfig = allServices.map(service => ({
    _id: service._id,
    name: service.name,
    displayName: service.displayName,
    description: service.description,
    icon: service.icon,
    category: service.category,
    basePriceMultiplier: service.basePriceMultiplier,
    turnaroundTime: service.turnaroundTime,
    isExpressAvailable: service.isExpressAvailable,
    // Branch-specific configuration
    branchConfig: serviceConfigMap[service._id.toString()] || {
      isEnabled: false, // Default to disabled for new services
      priceMultiplier: 1.0,
      turnaroundTimeOverride: null,
      isExpressAvailable: service.isExpressAvailable,
      notes: '',
      _id: null
    }
  }));
  
  sendSuccess(res, {
    branch: {
      _id: branch._id,
      name: branch.name,
      code: branch.code
    },
    services: servicesWithConfig,
    totalServices: allServices.length,
    enabledServices: branchServices.filter(bs => bs.isEnabled).length
  }, 'Branch services retrieved successfully');
});

// @desc    Update service configuration for a branch
// @route   PUT /api/admin/branches/:branchId/services/:serviceId
// @access  Private (Admin)
const updateBranchService = asyncHandler(async (req, res) => {
  const { branchId, serviceId } = req.params;
  const { 
    isEnabled, 
    priceMultiplier, 
    turnaroundTimeOverride, 
    isExpressAvailable, 
    notes 
  } = req.body;
  
  // Verify branch exists and belongs to user's tenancy
  const branch = await Branch.findOne({ 
    _id: branchId, 
    tenancy: req.user.tenancy 
  });
  
  if (!branch) {
    return sendError(res, 'NOT_FOUND', 'Branch not found', 404);
  }
  
  // Verify service exists
  const service = await Service.findById(serviceId);
  if (!service) {
    return sendError(res, 'NOT_FOUND', 'Service not found', 404);
  }
  
  // Update or create branch service configuration
  const branchService = await BranchService.findOneAndUpdate(
    { branch: branchId, service: serviceId },
    {
      isEnabled: isEnabled !== undefined ? isEnabled : true,
      priceMultiplier: priceMultiplier || 1.0,
      turnaroundTimeOverride,
      isExpressAvailable: isExpressAvailable !== undefined ? isExpressAvailable : service.isExpressAvailable,
      notes: notes || '',
      tenancy: req.user.tenancy,
      updatedBy: req.user._id,
      // Set createdBy only if creating new record
      ...(req.body.isNew && { createdBy: req.user._id })
    },
    { 
      upsert: true, 
      new: true,
      setDefaultsOnInsert: true
    }
  ).populate('service');
  
  // If creating new record, set createdBy
  if (!branchService.createdBy) {
    branchService.createdBy = req.user._id;
    await branchService.save();
  }
  
  sendSuccess(res, { branchService }, 'Branch service configuration updated successfully');
});

// @desc    Bulk update services for a branch
// @route   PUT /api/admin/branches/:branchId/services/bulk
// @access  Private (Admin)
const bulkUpdateBranchServices = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const { services } = req.body; // Array of { serviceId, isEnabled, priceMultiplier, etc. }
  
  if (!services || !Array.isArray(services)) {
    return sendError(res, 'VALIDATION_ERROR', 'Services array is required', 400);
  }
  
  // Verify branch exists and belongs to user's tenancy
  const branch = await Branch.findOne({ 
    _id: branchId, 
    tenancy: req.user.tenancy 
  });
  
  if (!branch) {
    return sendError(res, 'NOT_FOUND', 'Branch not found', 404);
  }
  
  // Prepare bulk operations
  const operations = [];
  
  for (const serviceUpdate of services) {
    const { serviceId, isEnabled, priceMultiplier, turnaroundTimeOverride, isExpressAvailable, notes } = serviceUpdate;
    
    operations.push({
      updateOne: {
        filter: { branch: branchId, service: serviceId },
        update: {
          isEnabled: isEnabled !== undefined ? isEnabled : true,
          priceMultiplier: priceMultiplier || 1.0,
          turnaroundTimeOverride,
          isExpressAvailable: isExpressAvailable !== undefined ? isExpressAvailable : true,
          notes: notes || '',
          tenancy: req.user.tenancy,
          updatedBy: req.user._id,
          $setOnInsert: { createdBy: req.user._id }
        },
        upsert: true
      }
    });
  }
  
  // Execute bulk operations
  const result = await BranchService.bulkWrite(operations);
  
  sendSuccess(res, {
    modifiedCount: result.modifiedCount,
    upsertedCount: result.upsertedCount,
    matchedCount: result.matchedCount
  }, 'Branch services updated successfully');
});

// @desc    Toggle service status for a branch
// @route   PATCH /api/admin/branches/:branchId/services/:serviceId/toggle
// @access  Private (Admin)
const toggleBranchService = asyncHandler(async (req, res) => {
  const { branchId, serviceId } = req.params;
  
  // Verify branch exists and belongs to user's tenancy
  const branch = await Branch.findOne({ 
    _id: branchId, 
    tenancy: req.user.tenancy 
  });
  
  if (!branch) {
    return sendError(res, 'NOT_FOUND', 'Branch not found', 404);
  }
  
  // Find or create branch service configuration
  let branchService = await BranchService.findOne({ 
    branch: branchId, 
    service: serviceId 
  });
  
  if (!branchService) {
    // Create new configuration with enabled = true (toggle will make it false)
    branchService = new BranchService({
      branch: branchId,
      service: serviceId,
      isEnabled: true,
      tenancy: req.user.tenancy,
      createdBy: req.user._id
    });
  }
  
  // Toggle the status
  branchService.isEnabled = !branchService.isEnabled;
  branchService.updatedBy = req.user._id;
  await branchService.save();
  
  await branchService.populate('service');
  
  sendSuccess(res, { 
    branchService,
    newStatus: branchService.isEnabled ? 'enabled' : 'disabled'
  }, `Service ${branchService.isEnabled ? 'enabled' : 'disabled'} for branch`);
});

// @desc    Get enabled services for a branch (public endpoint for customers)
// @route   GET /api/branches/:branchId/services/enabled
// @access  Public
const getEnabledBranchServices = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  
  // Verify branch exists and is active
  const branch = await Branch.findOne({ 
    _id: branchId, 
    isActive: true 
  });
  
  if (!branch) {
    return sendError(res, 'NOT_FOUND', 'Branch not found or inactive', 404);
  }
  
  // Get enabled services for this branch
  const enabledServices = await BranchService.find({ 
    branch: branchId, 
    isEnabled: true 
  }).populate('service', 'name displayName code description icon category basePriceMultiplier turnaroundTime isExpressAvailable');
  
  // Format response for customer use
  const services = enabledServices.map(bs => ({
    _id: bs.service._id,
    name: bs.service.name,
    code: bs.service.code, // Add the service code
    displayName: bs.service.displayName,
    description: bs.service.description,
    icon: bs.service.icon,
    category: bs.service.category,
    // Apply branch-specific pricing
    priceMultiplier: bs.service.basePriceMultiplier * bs.priceMultiplier,
    // Use branch-specific turnaround time if set, otherwise use service default
    turnaroundTime: bs.turnaroundTimeOverride || bs.service.turnaroundTime,
    isExpressAvailable: bs.isExpressAvailable
  }));
  
  sendSuccess(res, {
    branch: {
      _id: branch._id,
      name: branch.name,
      code: branch.code
    },
    services,
    totalEnabledServices: services.length
  }, 'Enabled services retrieved successfully');
});

module.exports = {
  getBranchServices,
  updateBranchService,
  bulkUpdateBranchServices,
  toggleBranchService,
  getEnabledBranchServices
};