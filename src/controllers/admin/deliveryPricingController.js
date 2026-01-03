const Settings = require('../../models/Settings');
const Branch = require('../../models/Branch');
const { sendSuccess, sendError, asyncHandler } = require('../../utils/helpers');
const { DELIVERY_PRICING_DEFAULTS } = require('../../config/constants');

/**
 * @desc    Get delivery pricing configuration
 * @route   GET /api/admin/delivery-pricing
 * @access  Private (Admin/Center Admin)
 */
const getDeliveryPricing = asyncHandler(async (req, res) => {
  const pricingConfig = await Settings.getDeliveryPricing();
  
  sendSuccess(res, {
    config: pricingConfig,
    defaults: DELIVERY_PRICING_DEFAULTS
  }, 'Delivery pricing configuration retrieved');
});

/**
 * @desc    Update delivery pricing configuration
 * @route   PUT /api/admin/delivery-pricing
 * @access  Private (Admin/Center Admin)
 */
const updateDeliveryPricing = asyncHandler(async (req, res) => {
  const { baseDistance, perKmRate, maxDistance, minimumCharge, expressMultiplier, fallbackFlatRate } = req.body;

  // Validate at least one field is provided
  if (baseDistance === undefined && perKmRate === undefined && maxDistance === undefined && 
      minimumCharge === undefined && expressMultiplier === undefined && fallbackFlatRate === undefined) {
    return sendError(res, 'At least one pricing parameter is required', 400);
  }

  const updatedSetting = await Settings.updateDeliveryPricing(
    { baseDistance, perKmRate, maxDistance, minimumCharge, expressMultiplier, fallbackFlatRate },
    req.user._id
  );

  sendSuccess(res, {
    config: updatedSetting.value
  }, 'Delivery pricing updated successfully');
});

/**
 * @desc    Update branch coordinates
 * @route   PUT /api/admin/branches/:branchId/coordinates
 * @access  Private (Admin/Center Admin)
 */
const updateBranchCoordinates = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const { latitude, longitude, serviceableRadius } = req.body;

  // Validate coordinates
  if (latitude === undefined || longitude === undefined) {
    return sendError(res, 'Latitude and longitude are required', 400);
  }

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);

  if (isNaN(lat) || lat < -90 || lat > 90) {
    return sendError(res, 'Latitude must be between -90 and 90', 400);
  }

  if (isNaN(lng) || lng < -180 || lng > 180) {
    return sendError(res, 'Longitude must be between -180 and 180', 400);
  }

  const updateData = {
    coordinates: {
      latitude: lat,
      longitude: lng
    }
  };

  if (serviceableRadius !== undefined) {
    const radius = parseFloat(serviceableRadius);
    if (!isNaN(radius) && radius >= 1 && radius <= 100) {
      updateData.serviceableRadius = radius;
    }
  }

  const branch = await Branch.findByIdAndUpdate(
    branchId,
    updateData,
    { new: true, runValidators: true }
  );

  if (!branch) {
    return sendError(res, 'Branch not found', 404);
  }

  sendSuccess(res, {
    branch: {
      _id: branch._id,
      name: branch.name,
      code: branch.code,
      coordinates: branch.coordinates,
      serviceableRadius: branch.serviceableRadius
    }
  }, 'Branch coordinates updated successfully');
});

/**
 * @desc    Get branch coordinates
 * @route   GET /api/admin/branches/:branchId/coordinates
 * @access  Private (Admin/Center Admin)
 */
const getBranchCoordinates = asyncHandler(async (req, res) => {
  const { branchId } = req.params;

  const branch = await Branch.findById(branchId).select('name code coordinates serviceableRadius address');

  if (!branch) {
    return sendError(res, 'Branch not found', 404);
  }

  sendSuccess(res, {
    branch: {
      _id: branch._id,
      name: branch.name,
      code: branch.code,
      coordinates: branch.coordinates,
      serviceableRadius: branch.serviceableRadius,
      address: branch.address
    }
  }, 'Branch coordinates retrieved');
});

/**
 * @desc    Get all branches with coordinates status
 * @route   GET /api/admin/branches/coordinates-status
 * @access  Private (Admin/Center Admin)
 */
const getBranchesCoordinatesStatus = asyncHandler(async (req, res) => {
  const branches = await Branch.find({ isActive: true })
    .select('name code coordinates serviceableRadius address.city')
    .sort({ name: 1 });

  const branchesWithStatus = branches.map(branch => ({
    _id: branch._id,
    name: branch.name,
    code: branch.code,
    city: branch.address?.city,
    hasCoordinates: !!(branch.coordinates?.latitude && branch.coordinates?.longitude),
    coordinates: branch.coordinates,
    serviceableRadius: branch.serviceableRadius
  }));

  const stats = {
    total: branches.length,
    withCoordinates: branchesWithStatus.filter(b => b.hasCoordinates).length,
    withoutCoordinates: branchesWithStatus.filter(b => !b.hasCoordinates).length
  };

  sendSuccess(res, {
    branches: branchesWithStatus,
    stats
  }, 'Branches coordinates status retrieved');
});

/**
 * @desc    Update branch delivery pricing override
 * @route   PUT /api/admin/branches/:branchId/delivery-pricing
 * @access  Private (Admin/Center Admin)
 */
const updateBranchDeliveryPricing = asyncHandler(async (req, res) => {
  const { branchId } = req.params;
  const { enabled, baseDistance, perKmRate, maxDistance } = req.body;

  const updateData = {
    'deliveryPricingOverride.enabled': enabled === true
  };

  if (enabled) {
    if (baseDistance !== undefined) {
      const val = parseFloat(baseDistance);
      if (!isNaN(val) && val >= 0 && val <= 50) {
        updateData['deliveryPricingOverride.baseDistance'] = val;
      }
    }
    if (perKmRate !== undefined) {
      const val = parseFloat(perKmRate);
      if (!isNaN(val) && val >= 0 && val <= 100) {
        updateData['deliveryPricingOverride.perKmRate'] = val;
      }
    }
    if (maxDistance !== undefined) {
      const val = parseFloat(maxDistance);
      if (!isNaN(val) && val >= 1 && val <= 100) {
        updateData['deliveryPricingOverride.maxDistance'] = val;
      }
    }
  }

  const branch = await Branch.findByIdAndUpdate(
    branchId,
    updateData,
    { new: true }
  );

  if (!branch) {
    return sendError(res, 'Branch not found', 404);
  }

  sendSuccess(res, {
    branch: {
      _id: branch._id,
      name: branch.name,
      deliveryPricingOverride: branch.deliveryPricingOverride
    }
  }, 'Branch delivery pricing updated');
});

module.exports = {
  getDeliveryPricing,
  updateDeliveryPricing,
  updateBranchCoordinates,
  getBranchCoordinates,
  getBranchesCoordinatesStatus,
  updateBranchDeliveryPricing
};
