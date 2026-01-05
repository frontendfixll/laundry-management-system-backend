const Coupon = require('../../models/Coupon');

// Get all coupons for tenancy
const getCoupons = async (req, res) => {
  try {
    const tenancyId = req.user.tenancy;
    
    const coupons = await Coupon.find({ tenancy: tenancyId })
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: { coupons }
    });
  } catch (error) {
    console.error('Get coupons error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupons'
    });
  }
};

// Get single coupon
const getCouponById = async (req, res) => {
  try {
    const { couponId } = req.params;
    const tenancyId = req.user.tenancy;
    
    const coupon = await Coupon.findOne({ _id: couponId, tenancy: tenancyId });
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }
    
    res.json({
      success: true,
      data: { coupon }
    });
  } catch (error) {
    console.error('Get coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupon'
    });
  }
};

// Create coupon
const createCoupon = async (req, res) => {
  try {
    const tenancyId = req.user.tenancy;
    const {
      code, name, description, discountType, discountValue,
      minOrderValue, maxDiscount, usageLimit,
      perUserLimit, startDate, endDate,
      isActive, applicableServices
    } = req.body;

    // Check if code already exists for this tenancy
    const existingCoupon = await Coupon.findOne({
      tenancy: tenancyId,
      code: code.toUpperCase()
    });
    
    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists'
      });
    }
    
    const coupon = new Coupon({
      tenancy: tenancyId,
      code: code.toUpperCase(),
      name,
      description,
      type: discountType || 'percentage',
      value: discountValue || 10,
      minOrderValue: minOrderValue || 0,
      maxDiscount: maxDiscount || 0,
      usageLimit: usageLimit || 0,
      perUserLimit: perUserLimit || 1,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isActive: isActive !== false,
      applicableServices: applicableServices || ['all'],
      createdBy: req.user._id
    });
    
    await coupon.save();
    
    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: { coupon }
    });
  } catch (error) {
    console.error('Create coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create coupon'
    });
  }
};

// Update coupon
const updateCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;
    const tenancyId = req.user.tenancy;
    
    const coupon = await Coupon.findOne({ _id: couponId, tenancy: tenancyId });
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }
    
    // If code is being changed, check for duplicates
    if (req.body.code && req.body.code.toUpperCase() !== coupon.code) {
      const existingCoupon = await Coupon.findOne({
        tenancy: tenancyId,
        code: req.body.code.toUpperCase(),
        _id: { $ne: couponId }
      });
      
      if (existingCoupon) {
        return res.status(400).json({
          success: false,
          message: 'Coupon code already exists'
        });
      }
    }
    
    // Update fields
    const updateFields = [
      'code', 'name', 'description', 'minOrderValue', 'maxDiscount', 
      'usageLimit', 'perUserLimit', 'startDate', 'endDate',
      'isActive', 'applicableServices'
    ];
    
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'code') {
          coupon[field] = req.body[field].toUpperCase();
        } else if (field === 'startDate' || field === 'endDate') {
          coupon[field] = new Date(req.body[field]);
        } else {
          coupon[field] = req.body[field];
        }
      }
    });
    
    // Handle type/value mapping
    if (req.body.discountType) coupon.type = req.body.discountType;
    if (req.body.discountValue !== undefined) coupon.value = req.body.discountValue;
    if (req.body.type) coupon.type = req.body.type;
    if (req.body.value !== undefined) coupon.value = req.body.value;
    
    await coupon.save();
    
    res.json({
      success: true,
      message: 'Coupon updated successfully',
      data: { coupon }
    });
  } catch (error) {
    console.error('Update coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update coupon'
    });
  }
};

// Delete coupon
const deleteCoupon = async (req, res) => {
  try {
    const { couponId } = req.params;
    const tenancyId = req.user.tenancy;
    
    const coupon = await Coupon.findOneAndDelete({
      _id: couponId,
      tenancy: tenancyId
    });
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Coupon deleted successfully'
    });
  } catch (error) {
    console.error('Delete coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete coupon'
    });
  }
};

// Toggle coupon status
const toggleCouponStatus = async (req, res) => {
  try {
    const { couponId } = req.params;
    const tenancyId = req.user.tenancy;
    
    const coupon = await Coupon.findOne({ _id: couponId, tenancy: tenancyId });
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }
    
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    
    res.json({
      success: true,
      message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { coupon }
    });
  } catch (error) {
    console.error('Toggle coupon status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle coupon status'
    });
  }
};

// Get coupon analytics
const getCouponAnalytics = async (req, res) => {
  try {
    const { couponId } = req.params;
    const tenancyId = req.user.tenancy;
    
    const coupon = await Coupon.findOne({ _id: couponId, tenancy: tenancyId });
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        coupon: {
          code: coupon.code,
          name: coupon.name,
          usedCount: coupon.usedCount,
          usageLimit: coupon.usageLimit,
          userUsage: coupon.userUsage.length
        }
      }
    });
  } catch (error) {
    console.error('Get coupon analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupon analytics'
    });
  }
};

// Validate coupon (for customer use)
const validateCoupon = async (req, res) => {
  try {
    const { code, orderValue } = req.body;
    const tenancyId = req.user.tenancy || req.body.tenancyId;
    const userId = req.user._id;
    
    const coupon = await Coupon.findOne({
      tenancy: tenancyId,
      code: code.toUpperCase()
    });
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid coupon code'
      });
    }
    
    const validation = coupon.isValid(orderValue, userId);
    
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }
    
    const discount = coupon.calculateDiscount(orderValue);
    
    res.json({
      success: true,
      data: {
        coupon: {
          _id: coupon._id,
          code: coupon.code,
          name: coupon.name,
          type: coupon.type,
          value: coupon.value
        },
        discount,
        finalAmount: orderValue - discount
      }
    });
  } catch (error) {
    console.error('Validate coupon error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate coupon'
    });
  }
};

module.exports = {
  getCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus,
  getCouponAnalytics,
  validateCoupon
};
