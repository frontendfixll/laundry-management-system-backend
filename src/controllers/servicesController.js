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
const getBranches = asyncHandler(async (req, res) => {
  const branches = await Branch.find({ 
    isActive: true 
  })
  .select('name code address phone coordinates serviceableRadius')
  .sort({ name: 1 })
  .lean();

  // Format branches for customer use
  const formattedBranches = branches.map(branch => ({
    _id: branch._id,
    name: branch.name,
    code: branch.code,
    address: {
      addressLine1: branch.address?.addressLine1 || branch.address?.street,
      city: branch.address?.city,
      pincode: branch.address?.pincode
    },
    phone: branch.phone || branch.contact?.phone,
    coordinates: branch.coordinates,
    serviceableRadius: branch.serviceableRadius
  }));

  sendSuccess(res, {
    branches: formattedBranches,
    totalBranches: formattedBranches.length
  }, 'Branches retrieved successfully');
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
  getBranches,
  getPublicPricing
};