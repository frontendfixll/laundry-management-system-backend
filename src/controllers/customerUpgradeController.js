const UpgradeRequest = require('../models/UpgradeRequest');
const Tenancy = require('../models/Tenancy');
const { BillingPlan } = require('../models/TenancyBilling');
const { sendSuccess, sendError, asyncHandler } = require('../utils/helpers');
// const emailService = require('../services/emailService');

/**
 * Get public tenancy data for customer portal
 * GET /api/public/tenancy/:slug
 */
exports.getPublicTenancy = asyncHandler(async (req, res) => {
  const tenancy = await Tenancy.findOne({ slug: req.params.slug })
    .populate('subscription.planId', 'name displayName price')
    .select('name slug subscription contactPerson branding');

  if (!tenancy) {
    return sendError(res, 'NOT_FOUND', 'Business not found', 404);
  }

  // Only return public information
  const publicData = {
    _id: tenancy._id,
    name: tenancy.name,
    slug: tenancy.slug,
    subscription: tenancy.subscription,
    contactPerson: {
      name: tenancy.contactPerson?.name || '',
      email: tenancy.contactPerson?.email || '',
      phone: tenancy.contactPerson?.phone || ''
    },
    branding: tenancy.branding
  };

  sendSuccess(res, publicData, 'Tenancy information retrieved');
});

/**
 * Create customer upgrade request
 * POST /api/public/upgrade-request
 */
exports.createCustomerUpgradeRequest = asyncHandler(async (req, res) => {
  const {
    tenancySlug,
    toPlanId,
    upgradeAmount,
    reason,
    customerInfo
  } = req.body;

  // Validate required fields
  if (!tenancySlug || !toPlanId) {
    return sendError(res, 'VALIDATION_ERROR', 'Tenancy slug and target plan are required', 400);
  }

  // Find tenancy by slug
  const tenancy = await Tenancy.findOne({ slug: tenancySlug }).populate('subscription.planId');
  if (!tenancy) {
    return sendError(res, 'NOT_FOUND', 'Business not found', 404);
  }

  // Validate target plan
  const toPlan = await BillingPlan.findById(toPlanId);
  if (!toPlan) {
    return sendError(res, 'NOT_FOUND', 'Target plan not found', 404);
  }

  // Check if upgrade already pending
  const existingUpgrade = await UpgradeRequest.findOne({
    tenancy: tenancy._id,
    status: { $in: ['pending', 'partially_paid'] }
  });

  if (existingUpgrade) {
    return sendError(res, 'DUPLICATE_REQUEST', 'Upgrade request already pending for this business', 400);
  }

  // Get current plan
  const fromPlan = tenancy.subscription?.planId;
  if (!fromPlan) {
    return sendError(res, 'INVALID_STATE', 'Business does not have a current plan', 400);
  }

  // Calculate pricing
  const originalPrice = toPlan.price?.monthly || 0;
  const customPrice = upgradeAmount || originalPrice;

  // Set default due date (7 days from now)
  const defaultDueDate = new Date();
  defaultDueDate.setDate(defaultDueDate.getDate() + 7);

  // Create upgrade request with customer-initiated flag
  const upgradeRequest = await UpgradeRequest.create({
    tenancy: tenancy._id,
    fromPlan: fromPlan._id,
    toPlan: toPlanId,
    pricing: {
      originalPrice,
      customPrice,
      discount: Math.max(0, originalPrice - customPrice),
      discountReason: 'Customer self-service request',
      currency: 'INR'
    },
    paymentTerms: {
      method: 'online',
      dueDate: defaultDueDate,
      gracePeriod: 7,
      installments: {
        total: 1,
        amount: customPrice,
        schedule: [],
        paid: []
      }
    },
    featureAccess: {
      immediate: [],
      paymentRequired: toPlan.features ? Object.keys(toPlan.features.toObject()) : [],
      trial: [],
      customLimits: new Map()
    },
    communication: {
      customMessage: reason || 'Customer requested upgrade',
      emailSent: false,
      smsSent: false,
      remindersSent: [],
      escalationLevel: 0
    },
    payment: {
      totalPaid: 0,
      remainingAmount: customPrice
    },
    // Mark as customer-initiated (no sales user)
    createdBy: tenancy._id, // Use tenancy ID as creator
    createdByModel: 'Tenancy', // Custom model type for customer requests
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  });

  // Add to tenancy pending upgrades
  if (tenancy.addUpgradeRequest) {
    tenancy.addUpgradeRequest(upgradeRequest._id);
    await tenancy.save();
  }

  // Add history
  upgradeRequest.addHistory(
    'customer_upgrade_requested',
    tenancy._id,
    'Tenancy',
    { 
      fromPlan: fromPlan.name, 
      toPlan: toPlan.name, 
      customPrice,
      originalPrice,
      reason: reason || 'Customer self-service request',
      customerInfo
    }
  );
  await upgradeRequest.save();

  // Send confirmation email to customer
  try {
    // await emailService.sendCustomerUpgradeConfirmation(upgradeRequest);
    console.log('Email service temporarily disabled');
  } catch (error) {
    console.error('Failed to send confirmation email:', error);
    // Don't fail the request if email fails
  }

  // TODO: Send notification to sales team
  // TODO: Send confirmation email to customer

  // Populate response
  await upgradeRequest.populate([
    { path: 'tenancy', select: 'name slug contactPerson' },
    { path: 'fromPlan', select: 'name displayName price' },
    { path: 'toPlan', select: 'name displayName price features' }
  ]);

  sendSuccess(res, upgradeRequest, 'Upgrade request submitted successfully', 201);
});

/**
 * Get customer upgrade request status
 * GET /api/public/upgrade-status/:tenancySlug
 */
exports.getCustomerUpgradeStatus = asyncHandler(async (req, res) => {
  const tenancy = await Tenancy.findOne({ slug: req.params.tenancySlug });
  if (!tenancy) {
    return sendError(res, 'NOT_FOUND', 'Business not found', 404);
  }

  // Find pending upgrade requests
  const upgradeRequests = await UpgradeRequest.find({
    tenancy: tenancy._id,
    status: { $in: ['pending', 'partially_paid', 'overdue'] }
  })
  .populate('fromPlan', 'name displayName price')
  .populate('toPlan', 'name displayName price')
  .select('-history -createdBy -updatedBy') // Exclude sensitive fields
  .sort({ requestedAt: -1 });

  sendSuccess(res, { upgradeRequests }, 'Upgrade status retrieved');
});

module.exports = {
  getPublicTenancy,
  createCustomerUpgradeRequest,
  getCustomerUpgradeStatus
};