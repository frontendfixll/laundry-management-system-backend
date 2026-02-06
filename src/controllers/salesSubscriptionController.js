const Tenancy = require('../models/Tenancy');
const { BillingPlan, TenancyInvoice, TenancyPayment } = require('../models/TenancyBilling');
const Lead = require('../models/Lead');
const { sendSuccess, sendError, asyncHandler } = require('../utils/helpers');
const { validationResult } = require('express-validator');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Get all subscriptions with filters
 * GET /api/sales/subscriptions
 */
exports.getSubscriptions = asyncHandler(async (req, res) => {
  const {
    status,
    plan,
    search,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Build filter
  const filter = {};

  if (status) filter['subscription.status'] = status;
  if (plan) filter['subscription.plan'] = plan;

  // Search by tenancy name or slug
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { slug: { $regex: search, $options: 'i' } }
    ];
  }

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  // Get tenancies with subscription info
  const tenancies = await Tenancy.find(filter)
    .populate('owner', 'name email phone')
    .populate('subscription.planId')  // Populate all plan fields
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  // Get total count
  const total = await Tenancy.countDocuments(filter);

  sendSuccess(res, {
    subscriptions: tenancies,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  }, 'Subscriptions retrieved');
});

/**
 * Get single subscription
 * GET /api/sales/subscriptions/:tenancyId
 */
exports.getSubscription = asyncHandler(async (req, res) => {
  const tenancy = await Tenancy.findById(req.params.tenancyId)
    .populate('owner', 'name email phone')
    .populate('subscription.planId');  // Populate all plan fields

  if (!tenancy) {
    return sendError(res, 'Tenancy not found', 404);
  }

  // Get recent invoices
  const invoices = await TenancyInvoice.find({ tenancy: tenancy._id })
    .sort({ createdAt: -1 })
    .limit(10);

  // Get recent payments
  const payments = await TenancyPayment.find({ tenancy: tenancy._id })
    .sort({ createdAt: -1 })
    .limit(10);

  sendSuccess(res, {
    tenancy,
    invoices,
    payments
  }, 'Subscription retrieved');
});

/**
 * Assign plan to tenancy
 * POST /api/sales/subscriptions/:tenancyId/assign-plan
 */
exports.assignPlan = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation failed', 400, errors.array());
  }

  const { planId, billingCycle = 'monthly', customPrice, trialDays } = req.body;
  const tenancy = await Tenancy.findById(req.params.tenancyId);

  if (!tenancy) {
    return sendError(res, 'Tenancy not found', 404);
  }

  // Get plan details
  const plan = await BillingPlan.findById(planId);
  if (!plan) {
    return sendError(res, 'Plan not found', 404);
  }

  // Check if sales user has permission for custom pricing
  if (customPrice && !req.salesUser.hasPermission('plans', 'customPricing')) {
    return sendError(res, 'You do not have permission to set custom pricing', 403);
  }

  // Update subscription
  tenancy.subscription.plan = plan.name;
  tenancy.subscription.planId = plan._id;
  tenancy.subscription.billingCycle = billingCycle;
  tenancy.subscription.features = plan.features instanceof Map
    ? Object.fromEntries(plan.features)
    : plan.features;

  // Set trial if specified
  if (trialDays) {
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + parseInt(trialDays));
    tenancy.subscription.trialEndsAt = trialEndDate;
    tenancy.subscription.status = 'trial';
  }

  await tenancy.save();

  sendSuccess(res, 'Plan assigned successfully', tenancy);
});

/**
 * Activate subscription
 * POST /api/sales/subscriptions/:tenancyId/activate
 */
exports.activateSubscription = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.body;
  const tenancy = await Tenancy.findById(req.params.tenancyId);

  if (!tenancy) {
    return sendError(res, 'Tenancy not found', 404);
  }

  tenancy.subscription.status = 'active';
  tenancy.subscription.startDate = startDate || new Date();

  if (endDate) {
    tenancy.subscription.endDate = new Date(endDate);
  } else {
    // Set end date based on billing cycle
    const start = new Date(tenancy.subscription.startDate);
    const end = new Date(start);
    if (tenancy.subscription.billingCycle === 'yearly') {
      end.setFullYear(end.getFullYear() + 1);
    } else {
      end.setMonth(end.getMonth() + 1);
    }
    tenancy.subscription.endDate = end;
  }

  tenancy.isActive = true;
  await tenancy.save();

  // Notify SuperAdmins about subscription activation
  try {
    const NotificationService = require('../services/notificationService');
    const User = require('../models/User');
    const superAdmins = await User.find({ role: 'superadmin', isActive: true }).select('_id');
    for (const superAdmin of superAdmins) {
      await NotificationService.notifySuperAdminSubscriptionUpdate(
        superAdmin._id,
        tenancy,
        'Activated',
        `has activated their ${tenancy.subscription.plan} subscription.`
      );
    }
  } catch (error) {
    console.error('Failed to notify SuperAdmins of activation:', error.message);
  }

  // Update lead if exists
  const lead = await Lead.findOne({ tenancyId: tenancy._id });
  if (lead && !lead.isConverted) {
    await lead.convertToCustomer(tenancy._id);

    // Update sales user performance
    await req.salesUser.updatePerformance({
      leadsConverted: req.salesUser.performance.leadsConverted + 1
    });
  }

  sendSuccess(res, 'Subscription activated successfully', tenancy);
});

/**
 * Pause subscription
 * POST /api/sales/subscriptions/:tenancyId/pause
 */
exports.pauseSubscription = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const tenancy = await Tenancy.findById(req.params.tenancyId);

  if (!tenancy) {
    return sendError(res, 'Tenancy not found', 404);
  }

  tenancy.subscription.status = 'cancelled';
  tenancy.isActive = false;

  // Store pause reason in metadata (you can add this field to schema if needed)
  await tenancy.save();

  sendSuccess(res, 'Subscription paused successfully', tenancy);
});

/**
 * Upgrade subscription
 * POST /api/sales/subscriptions/:tenancyId/upgrade
 */
exports.upgradeSubscription = asyncHandler(async (req, res) => {
  const { planId, paymentMethod = 'manual' } = req.body;

  console.log('🔄 Upgrade request - Tenancy ID:', req.params.tenancyId);
  console.log('🔄 Upgrade request - New Plan ID:', planId);
  console.log('💳 Payment Method:', paymentMethod);

  const tenancy = await Tenancy.findById(req.params.tenancyId);

  if (!tenancy) {
    console.log('❌ Tenancy not found');
    return sendError(res, 'TENANCY_NOT_FOUND', 'Tenancy not found', 404);
  }

  console.log('✅ Tenancy found:', tenancy.name);
  console.log('📋 Current plan ID:', tenancy.subscription?.planId);

  const newPlan = await BillingPlan.findById(planId);
  if (!newPlan) {
    console.log('❌ New plan not found with ID:', planId);
    return sendError(res, 'PLAN_NOT_FOUND', 'Plan not found', 404);
  }

  console.log('✅ New plan found:', newPlan.displayName);

  const currentPlan = await BillingPlan.findById(tenancy.subscription.planId);

  // Verify it's an upgrade (higher price)
  const billingCycle = tenancy.subscription?.billingCycle || 'monthly';
  const currentPrice = currentPlan?.price?.[billingCycle] || 0;
  const newPrice = newPlan.price?.[billingCycle] || 0;

  console.log(`💰 Price comparison (${billingCycle}): Current ₹${currentPrice} → New ₹${newPrice}`);

  if (newPrice <= currentPrice) {
    console.log('❌ Not an upgrade - new price is not higher');
    return sendError(res, 'INVALID_UPGRADE', 'New plan must be higher tier than current plan', 400);
  }

  // Update subscription
  tenancy.subscription.plan = newPlan.name;
  tenancy.subscription.planId = newPlan._id;
  tenancy.subscription.features = newPlan.features instanceof Map
    ? Object.fromEntries(newPlan.features)
    : newPlan.features;

  await tenancy.save();

  // Notify SuperAdmins about upgrade
  try {
    const NotificationService = require('../services/notificationService');
    const User = require('../models/User');
    const superAdmins = await User.find({ role: 'superadmin', isActive: true }).select('_id');
    for (const superAdmin of superAdmins) {
      await NotificationService.notifySuperAdminSubscriptionUpdate(
        superAdmin._id,
        tenancy,
        'Upgraded',
        `has upgraded to ${newPlan.displayName}.`
      );
    }
  } catch (error) {
    console.error('Failed to notify SuperAdmins of upgrade:', error.message);
  }

  // Calculate upgrade amount (difference between plans)
  const upgradeAmount = newPrice - currentPrice;

  // Create payment record for upgrade
  const payment = await TenancyPayment.create({
    tenancy: tenancy._id,
    amount: upgradeAmount,
    currency: 'INR',
    status: 'completed', // Mark as completed for now
    paymentMethod: paymentMethod,
    transactionId: `UPG-${Date.now()}`,
    paidAt: new Date(),
    metadata: {
      type: 'upgrade',
      fromPlan: currentPlan?.name || 'Unknown',
      toPlan: newPlan.name,
      upgradeDate: new Date(),
      processedBy: req.salesUser?._id || req.admin?._id,
      processedByModel: req.salesUser ? 'SalesUser' : 'SuperAdmin',
      paymentMethodUsed: paymentMethod,
      notes: `Plan upgraded from ${currentPlan?.displayName || 'Unknown'} to ${newPlan.displayName}`
    }
  });

  // Update sales user performance
  await req.salesUser.updatePerformance({
    totalRevenue: req.salesUser.performance.totalRevenue + upgradeAmount,
    currentMonthRevenue: req.salesUser.performance.currentMonthRevenue + upgradeAmount
  });

  console.log('✅ Subscription upgraded successfully');
  console.log('💰 Payment created:', payment._id, 'Amount:', upgradeAmount);
  console.log('💳 Payment Method:', paymentMethod);

  sendSuccess(res, { tenancy, payment }, 'Subscription upgraded successfully');
});

/**
 * Downgrade subscription
 * POST /api/sales/subscriptions/:tenancyId/downgrade
 */
exports.downgradeSubscription = asyncHandler(async (req, res) => {
  const { planId } = req.body;
  const tenancy = await Tenancy.findById(req.params.tenancyId);

  if (!tenancy) {
    return sendError(res, 'TENANCY_NOT_FOUND', 'Tenancy not found', 404);
  }

  const newPlan = await BillingPlan.findById(planId);
  if (!newPlan) {
    return sendError(res, 'PLAN_NOT_FOUND', 'Plan not found', 404);
  }

  // Get current plan for comparison
  const currentPlan = await BillingPlan.findById(tenancy.subscription.planId);
  const billingCycle = tenancy.subscription?.billingCycle || 'monthly';
  const currentPrice = currentPlan?.price?.[billingCycle] || 0;
  const newPrice = newPlan.price?.[billingCycle] || 0;

  // Update subscription
  tenancy.subscription.plan = newPlan.name;
  tenancy.subscription.planId = newPlan._id;
  tenancy.subscription.features = newPlan.features instanceof Map
    ? Object.fromEntries(newPlan.features)
    : newPlan.features;

  await tenancy.save();

  // Create payment record for downgrade (usually a credit/refund)
  if (currentPrice > newPrice) {
    const creditAmount = currentPrice - newPrice;

    const payment = await TenancyPayment.create({
      tenancy: tenancy._id,
      amount: -creditAmount, // Negative amount for credit
      currency: 'INR',
      status: 'completed',
      paymentMethod: 'manual',
      transactionId: `DWN-${Date.now()}`,
      paidAt: new Date(),
      metadata: {
        type: 'downgrade_credit',
        fromPlan: currentPlan?.name || 'Unknown',
        toPlan: newPlan.name,
        downgradeDate: new Date(),
        processedBy: req.salesUser?._id || req.admin?._id,
        processedByModel: req.salesUser ? 'SalesUser' : 'SuperAdmin',
        notes: 'Credit for plan downgrade'
      }
    });

    console.log('💰 Downgrade credit created:', payment._id, 'Amount:', creditAmount);

    sendSuccess(res, { tenancy, payment }, 'Subscription downgraded successfully');
  } else {
    sendSuccess(res, { tenancy }, 'Subscription downgraded successfully');
  }
});

/**
 * Extend trial
 * POST /api/sales/subscriptions/:tenancyId/extend-trial
 */
exports.extendTrial = asyncHandler(async (req, res) => {
  const { extensionDays = 7 } = req.body;
  const tenancy = await Tenancy.findById(req.params.tenancyId);

  if (!tenancy) {
    return sendError(res, 'Tenancy not found', 404);
  }

  if (tenancy.subscription.status !== 'trial') {
    return sendError(res, 'Tenancy is not on trial', 400);
  }

  // Extend trial
  const currentTrialEnd = tenancy.subscription.trialEndsAt || new Date();
  const newTrialEnd = new Date(currentTrialEnd);
  newTrialEnd.setDate(newTrialEnd.getDate() + parseInt(extensionDays));

  tenancy.subscription.trialEndsAt = newTrialEnd;
  await tenancy.save();

  // Update lead if exists
  const lead = await Lead.findOne({ tenancyId: tenancy._id });
  if (lead && lead.trial.isActive) {
    lead.trial.endDate = newTrialEnd;
    lead.trial.extensionCount += 1;
    lead.trial.lastExtendedDate = new Date();
    await lead.updateTrialDaysRemaining();
  }

  sendSuccess(res, `Trial extended by ${extensionDays} days`, tenancy);
});

/**
 * Get subscription statistics
 * GET /api/sales/subscriptions/stats
 */
exports.getSubscriptionStats = asyncHandler(async (req, res) => {
  const stats = await Tenancy.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ['$subscription.status', 'active'] }, 1, 0] } },
        trial: { $sum: { $cond: [{ $eq: ['$subscription.status', 'trial'] }, 1, 0] } },
        expired: { $sum: { $cond: [{ $eq: ['$subscription.status', 'expired'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$subscription.status', 'cancelled'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$subscription.status', 'pending'] }, 1, 0] } }
      }
    }
  ]);

  // Get plan distribution
  const planDistribution = await Tenancy.aggregate([
    {
      $group: {
        _id: '$subscription.plan',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);

  // Get trials expiring soon (next 7 days)
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 7);

  const trialsExpiringSoon = await Tenancy.countDocuments({
    'subscription.status': 'trial',
    'subscription.trialEndsAt': { $lte: expiryDate, $gte: new Date() }
  });

  const result = stats[0] || {
    total: 0,
    active: 0,
    trial: 0,
    expired: 0,
    cancelled: 0,
    pending: 0
  };

  sendSuccess(res, 'Subscription statistics retrieved', {
    ...result,
    planDistribution,
    trialsExpiringSoon
  });
});

/**
 * Get trials expiring soon
 * GET /api/sales/subscriptions/expiring-trials
 */
exports.getExpiringTrials = asyncHandler(async (req, res) => {
  const { days = 7 } = req.query;

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + parseInt(days));

  const tenancies = await Tenancy.find({
    'subscription.status': 'trial',
    'subscription.trialEndsAt': { $lte: expiryDate, $gte: new Date() }
  })
    .populate('owner', 'name email phone')
    .populate('subscription.planId', 'name displayName')
    .sort({ 'subscription.trialEndsAt': 1 });

  sendSuccess(res, 'Expiring trials retrieved', tenancies);
});

/**
 * Get available plans
 * GET /api/sales/subscriptions/plans
 */
exports.getPlans = asyncHandler(async (req, res) => {
  const plans = await BillingPlan.find({ isActive: true })
    .sort({ sortOrder: 1 });

  // Convert features Map to Object for response
  const plansWithFeatures = plans.map(plan => {
    const planObj = plan.toObject();
    if (plan.features instanceof Map) {
      planObj.features = Object.fromEntries(plan.features);
    }
    return planObj;
  });

  sendSuccess(res, { plans: plansWithFeatures }, 'Plans retrieved');
});

/**
 * Create custom plan (requires approval)
 * POST /api/sales/plans/custom
 */
exports.createCustomPlan = asyncHandler(async (req, res) => {
  // Check permission
  if (!req.salesUser.hasPermission('plans', 'customPricing')) {
    return sendError(res, 'You do not have permission to create custom plans', 403);
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation failed', 400, errors.array());
  }

  const { name, displayName, description, price, features } = req.body;

  // Create custom plan
  const plan = await BillingPlan.create({
    name: `custom_${Date.now()}`,
    displayName,
    description,
    price,
    features: new Map(Object.entries(features || {})),
    isCustom: true,
    showOnMarketing: false,
    createdBy: req.salesUser?._id || req.admin?._id
  });

  sendSuccess(res, 'Custom plan created successfully', plan, 201);
});
