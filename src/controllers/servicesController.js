const Branch = require('../models/Branch');
const Service = require('../models/Service');
const { 
  sendSuccess, 
  sendError, 
  asyncHandler, 
  calculateItemPrice, 
  calculateOrderTotal,
  getTimeSlots,
  isValidTimeSlot
} = require('../utils/helpers');
const { SERVICES, CLOTHING_CATEGORIES, ITEM_TYPES } = require('../config/constants');

// @desc    Calculate pricing for items
// @route   POST /api/services/calculate
// @access  Public
const calculatePricing = asyncHandler(async (req, res) => {
  const { items, isExpress = false } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return sendError(res, 'INVALID_ITEMS', 'Items array is required', 400);
  }

  const calculatedItems = [];
  let subtotal = 0;

  for (const item of items) {
    const { itemType, service, category, quantity } = item;

    if (!itemType || !service || !category || !quantity) {
      return sendError(res, 'INVALID_ITEM', 'Each item must have itemType, service, category, and quantity', 400);
    }

    const pricing = calculateItemPrice(itemType, service, category, isExpress);
    const itemTotal = pricing.unitPrice * quantity;
    subtotal += itemTotal;

    calculatedItems.push({
      ...item,
      pricing,
      totalPrice: itemTotal
    });
  }

  // Calculate order total with default values
  const orderTotal = calculateOrderTotal(items.map(item => ({
    ...item,
    isExpress
  })));

  sendSuccess(res, {
    items: calculatedItems,
    subtotal,
    orderTotal,
    isExpress
  }, 'Pricing calculated successfully');
});

// @desc    Get available time slots
// @route   GET /api/services/time-slots
// @access  Public
const getAvailableTimeSlots = asyncHandler(async (req, res) => {
  const timeSlots = getTimeSlots();
  
  sendSuccess(res, { timeSlots }, 'Time slots retrieved successfully');
});

// @desc    Check service availability by pincode
// @route   GET /api/services/availability/:pincode
// @access  Public
const checkServiceAvailability = asyncHandler(async (req, res) => {
  const { pincode } = req.params;

  if (!pincode) {
    return sendError(res, 'PINCODE_REQUIRED', 'Pincode is required', 400);
  }

  // Find branches serving this pincode
  const branches = await Branch.find({
    'serviceAreas.pincode': pincode,
    isActive: true
  }).select('name code address serviceAreas');

  if (branches.length === 0) {
    return sendSuccess(res, {
      available: false,
      message: 'Service not available in your area',
      branches: []
    }, 'Service availability checked');
  }

  // Get service area details for this pincode
  const serviceDetails = branches.map(branch => {
    const serviceArea = branch.serviceAreas.find(area => area.pincode === pincode);
    return {
      branchId: branch._id,
      branchName: branch.name,
      branchCode: branch.code,
      deliveryCharge: serviceArea?.deliveryCharge || 0,
      estimatedPickupTime: serviceArea?.estimatedPickupTime || '2-4 hours'
    };
  });

  sendSuccess(res, {
    available: true,
    message: 'Service available in your area',
    branches: serviceDetails
  }, 'Service availability checked');
});

// @desc    Get service types and categories
// @route   GET /api/services/types
// @access  Public
const getServiceTypes = asyncHandler(async (req, res) => {
  const serviceTypes = {
    services: Object.values(SERVICES),
    categories: Object.values(CLOTHING_CATEGORIES),
    itemTypes: Object.values(ITEM_TYPES)
  };

  sendSuccess(res, serviceTypes, 'Service types retrieved successfully');
});

// @desc    Get all active branches for customer selection
// @route   GET /api/services/branches
// @access  Public
const getActiveBranches = asyncHandler(async (req, res) => {
  const { city, pincode } = req.query;

  const query = { isActive: true };

  // Filter by city if provided
  if (city) {
    query['address.city'] = { $regex: city, $options: 'i' };
  }

  // Filter by pincode if provided
  if (pincode) {
    query['serviceAreas.pincode'] = pincode;
  }

  const branches = await Branch.find(query)
    .select('name code address contact serviceAreas operatingHours')
    .sort({ name: 1 });

  const formattedBranches = branches.map(branch => ({
    _id: branch._id,
    name: branch.name,
    code: branch.code,
    address: {
      addressLine1: branch.address?.addressLine1,
      city: branch.address?.city,
      pincode: branch.address?.pincode
    },
    phone: branch.contact?.phone,
    serviceAreas: branch.serviceAreas?.filter(area => area.isActive).map(area => ({
      pincode: area.pincode,
      deliveryCharge: area.deliveryCharge
    })) || []
  }));

  sendSuccess(res, { branches: formattedBranches }, 'Branches retrieved successfully');
});

// @desc    Get services available for a specific branch (for customers)
// @route   GET /api/services/branch/:branchId
// @access  Public
const getBranchServices = asyncHandler(async (req, res) => {
  const { branchId } = req.params;

  // Validate branch exists and is active
  const branch = await Branch.findOne({ _id: branchId, isActive: true });
  if (!branch) {
    return sendError(res, 'BRANCH_NOT_FOUND', 'Branch not found or inactive', 404);
  }

  // Get all admin-created services that are enabled for this branch
  const adminServices = await Service.find({
    isActive: true,
    createdByBranch: { $exists: false }
  }).lean();

  // Get branch-created services
  const branchServices = await Service.find({
    createdByBranch: branchId,
    isActive: true
  }).lean();

  // Filter admin services - only show those enabled for this branch
  const enabledAdminServices = adminServices.filter(service => {
    const branchConfig = service.branches?.find(
      b => b.branch && b.branch.toString() === branchId
    );
    // If no config exists, service is enabled by default
    // If config exists, check isActive
    return branchConfig ? branchConfig.isActive !== false : true;
  }).map(service => {
    const branchConfig = service.branches?.find(
      b => b.branch && b.branch.toString() === branchId
    );
    return {
      _id: service._id,
      name: service.name,
      code: service.code,
      displayName: service.displayName,
      description: service.description,
      icon: service.icon,
      category: service.category,
      turnaroundTime: branchConfig?.customTurnaround || service.turnaroundTime,
      isExpressAvailable: service.isExpressAvailable,
      priceMultiplier: branchConfig?.priceMultiplier || service.basePriceMultiplier || 1.0
    };
  });

  // Format branch services
  const formattedBranchServices = branchServices.map(service => ({
    _id: service._id,
    name: service.name,
    code: service.code,
    displayName: service.displayName,
    description: service.description,
    icon: service.icon,
    category: service.category,
    turnaroundTime: service.turnaroundTime,
    isExpressAvailable: service.isExpressAvailable,
    priceMultiplier: service.basePriceMultiplier || 1.0
  }));

  const allServices = [...enabledAdminServices, ...formattedBranchServices];

  sendSuccess(res, { 
    services: allServices,
    branch: {
      _id: branch._id,
      name: branch.name,
      code: branch.code
    }
  }, 'Branch services retrieved successfully');
});

// @desc    Get public pricing for landing page
// @route   GET /api/services/pricing
// @access  Public
const getPublicPricing = asyncHandler(async (req, res) => {
  const ServiceItem = require('../models/ServiceItem');
  const Service = require('../models/Service');

  // Get all active services
  const services = await Service.find({ 
    isActive: true,
    createdByBranch: { $exists: false }
  }).sort({ sortOrder: 1 }).lean();

  // Get all active service items
  const serviceItems = await ServiceItem.find({ 
    isActive: true,
    createdByBranch: { $exists: false }
  }).sort({ sortOrder: 1, name: 1 }).lean();

  // Group items by service
  const pricingData = services.map(service => {
    const items = serviceItems
      .filter(item => item.service === service.code)
      .map(item => ({
        id: item.itemId,
        name: item.name,
        price: item.basePrice,
        category: item.category
      }));

    return {
      code: service.code,
      name: service.displayName || service.name,
      description: service.description,
      icon: service.icon,
      category: service.category,
      turnaroundTime: service.turnaroundTime,
      items: items
    };
  }).filter(service => service.items.length > 0);

  sendSuccess(res, { 
    services: pricingData,
    totalServices: pricingData.length,
    totalItems: serviceItems.length
  }, 'Public pricing retrieved successfully');
});

module.exports = {
  calculatePricing,
  getAvailableTimeSlots,
  checkServiceAvailability,
  getServiceTypes,
  getActiveBranches,
  getBranchServices,
  getPublicPricing
};