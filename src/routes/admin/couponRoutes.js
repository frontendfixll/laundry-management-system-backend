const express = require('express');
const { protect, requirePermission } = require('../../middlewares/auth');
const { injectTenancyFromUser } = require('../../middlewares/tenancyMiddleware');
const { body, param } = require('express-validator');
const {
  getCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus,
  getCouponAnalytics,
  validateCoupon
} = require('../../controllers/admin/couponController');

const router = express.Router();

// Validation rules
const createCouponValidation = [
  body('code')
    .trim()
    .isLength({ min: 3, max: 20 })
    .withMessage('Coupon code must be 3-20 characters'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be 2-100 characters'),
  body('startDate')
    .isISO8601()
    .withMessage('Valid start date is required'),
  body('endDate')
    .isISO8601()
    .withMessage('Valid end date is required')
];

const validateCouponValidation = [
  body('code')
    .trim()
    .notEmpty()
    .withMessage('Coupon code is required'),
  body('orderValue')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Order value must be a positive number')
];

// Apply authentication and tenancy injection
router.use(protect);
router.use(injectTenancyFromUser);

// Coupon routes with proper RBAC permissions
router.get('/', 
  requirePermission('coupons', 'view'),
  getCoupons
);

router.get('/:couponId', 
  requirePermission('coupons', 'view'),
  param('couponId').isMongoId(), 
  getCouponById
);

router.get('/:couponId/analytics', 
  requirePermission('coupons', 'view'),
  param('couponId').isMongoId(), 
  getCouponAnalytics
);

router.post('/', 
  requirePermission('coupons', 'create'),
  createCouponValidation, 
  createCoupon
);

router.post('/validate', 
  requirePermission('coupons', 'view'),
  validateCouponValidation, 
  validateCoupon
);

router.put('/:couponId', 
  requirePermission('coupons', 'update'),
  param('couponId').isMongoId(), 
  updateCoupon
);

router.patch('/:couponId/toggle', 
  requirePermission('coupons', 'update'),
  param('couponId').isMongoId(), 
  toggleCouponStatus
);

router.delete('/:couponId', 
  requirePermission('coupons', 'delete'),
  param('couponId').isMongoId(), 
  deleteCoupon
);

module.exports = router;
