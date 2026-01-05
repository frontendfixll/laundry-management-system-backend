const Coupon = require('../../models/Coupon');
const Order = require('../../models/Order');
const { sendSuccess, sendError, asyncHandler } = require('../../utils/helpers');

// @desc    Validate coupon code for customer
// @route   POST /api/customer/coupons/validate
// @access  Private (Customer)
const validateCoupon = asyncHandler(async (req, res) => {
  const { code, orderValue, tenancyId } = req.body;
  
  // Get tenancy from request or body
  const tenancy = tenancyId || req.tenancyId || req.user.tenancy;
  
  if (!tenancy) {
    return sendError(res, 'TENANCY_REQUIRED', 'Tenancy context is required', 400);
  }
  
  if (!code) {
    return sendError(res, 'CODE_REQUIRED', 'Coupon code is required', 400);
  }
  
  const coupon = await Coupon.findValidCoupon(tenancy, code);
  
  if (!coupon) {
    return sendError(res, 'INVALID_COUPON', 'Invalid or expired coupon code', 400);
  }
  
  // Check if customer can use this coupon
  const canUse = coupon.canBeUsedBy(req.user._id, orderValue || 0);
  
  if (!canUse.valid) {
    return sendError(res, 'COUPON_NOT_APPLICABLE', canUse.message, 400);
  }
  
  // Calculate discount
  const discount = coupon.calculateDiscount(orderValue || 0);
  
  sendSuccess(res, {
    valid: true,
    coupon: {
      _id: coupon._id,
      code: coupon.code,
      name: coupon.name,
      description: coupon.description,
      type: coupon.type,
      value: coupon.value,
      maxDiscount: coupon.maxDiscount,
      minOrderValue: coupon.minOrderValue
    },
    discount: Math.round(discount),
    finalAmount: Math.max(0, Math.round((orderValue || 0) - discount))
  }, 'Coupon applied successfully');
});

// @desc    Get available coupons for customer
// @route   GET /api/customer/coupons/available
// @access  Private (Customer)
const getAvailableCoupons = asyncHandler(async (req, res) => {
  const { tenancyId } = req.query;
  const tenancy = tenancyId || req.tenancyId || req.user.tenancy;
  
  if (!tenancy) {
    return sendError(res, 'TENANCY_REQUIRED', 'Tenancy context is required', 400);
  }
  
  const now = new Date();
  
  // Find all active coupons for this tenancy
  const coupons = await Coupon.find({
    tenancy: tenancy,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).select('code name description type value maxDiscount minOrderValue endDate');
  
  // Filter coupons that haven't reached usage limit
  const availableCoupons = coupons.filter(coupon => {
    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
      return false;
    }
    return true;
  });
  
  sendSuccess(res, { coupons: availableCoupons }, 'Available coupons retrieved');
});

// @desc    Remove applied coupon
// @route   POST /api/customer/coupons/remove
// @access  Private (Customer)
const removeCoupon = asyncHandler(async (req, res) => {
  sendSuccess(res, { removed: true }, 'Coupon removed successfully');
});

module.exports = {
  validateCoupon,
  getAvailableCoupons,
  removeCoupon
};
