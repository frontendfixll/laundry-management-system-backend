const UpgradeRequest = require('../models/UpgradeRequest');
const Tenancy = require('../models/Tenancy');
const { BillingPlan } = require('../models/TenancyBilling');
const { sendSuccess, sendError, asyncHandler } = require('../utils/helpers');
const { validationResult } = require('express-validator');
const stripeService = require('../services/stripeService');
// const emailService = require('../services/emailService');

/**
 * Create upgrade request
 * POST /api/sales/upgrades/request
 */
exports.createUpgradeRequest = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'VALIDATION_ERROR', errors.array().map(e => `${e.param}: ${e.msg}`).join(', '), 400);
  }

  const {
    tenancyId,
    toPlanId,
    customPrice,
    discount,
    discountReason,
    paymentTerms,
    featureAccess,
    customMessage,
    communication
  } = req.body;

  // Validate tenancy
  const tenancy = await Tenancy.findById(tenancyId).populate('subscription.planId');
  if (!tenancy) {
    return sendError(res, 'NOT_FOUND', 'Tenancy not found', 404);
  }

  // Validate target plan
  const toPlan = await BillingPlan.findById(toPlanId);
  if (!toPlan) {
    return sendError(res, 'NOT_FOUND', 'Target plan not found', 404);
  }

  // Check if upgrade already pending
  const existingUpgrade = await UpgradeRequest.findOne({
    tenancy: tenancyId,
    status: { $in: ['pending', 'partially_paid'] }
  });

  if (existingUpgrade) {
    return sendError(res, 'DUPLICATE_REQUEST', 'Upgrade request already pending for this tenancy', 400);
  }

  // Get current plan
  const fromPlan = tenancy.subscription?.planId || await BillingPlan.findOne({ isDefault: true });
  if (!fromPlan) {
    return sendError(res, 'INVALID_STATE', 'Tenancy does not have a current plan', 400);
  }

  // Calculate pricing
  const originalPrice = toPlan.price?.monthly || 0;
  const finalPrice = customPrice || originalPrice;
  const discountAmount = discount || Math.max(0, originalPrice - finalPrice);

  // Set default due date (7 days from now)
  const defaultDueDate = new Date();
  defaultDueDate.setDate(defaultDueDate.getDate() + 7);

  // Create upgrade request
  const upgradeRequest = await UpgradeRequest.create({
    tenancy: tenancyId,
    fromPlan: fromPlan._id,
    toPlan: toPlanId,
    pricing: {
      originalPrice,
      customPrice: finalPrice,
      discount: discountAmount,
      discountReason: discountReason || '',
      currency: 'INR'
    },
    paymentTerms: {
      method: paymentTerms?.method || 'online',
      dueDate: paymentTerms?.dueDate ? new Date(paymentTerms.dueDate) : defaultDueDate,
      gracePeriod: paymentTerms?.gracePeriod || 7,
      installments: {
        total: paymentTerms?.installments?.total || 1,
        amount: finalPrice / (paymentTerms?.installments?.total || 1),
        schedule: paymentTerms?.installments?.schedule || [],
        paid: []
      }
    },
    featureAccess: {
      immediate: featureAccess?.immediate || [],
      paymentRequired: featureAccess?.paymentRequired || [],
      trial: featureAccess?.trial || [],
      customLimits: featureAccess?.customLimits || new Map()
    },
    communication: {
      customMessage: customMessage || '',
      emailSent: false,
      smsSent: false,
      remindersSent: [],
      escalationLevel: 0
    },
    payment: {
      totalPaid: 0,
      remainingAmount: finalPrice
    },
    createdBy: req.salesUser?._id || req.admin?._id,
    createdByModel: req.salesUser ? 'SalesUser' : 'SuperAdmin',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  });

  // Add history
  upgradeRequest.addHistory(
    'upgrade_requested',
    req.salesUser?._id || req.admin?._id,
    req.salesUser ? 'SalesUser' : 'SuperAdmin',
    { 
      fromPlan: fromPlan.name, 
      toPlan: toPlan.name, 
      customPrice: finalPrice,
      originalPrice,
      discount: discountAmount
    }
  );
  await upgradeRequest.save();

  // Generate payment link and send email if requested
  if (communication?.sendEmail) {
    const paymentLink = `${process.env.FRONTEND_URL || 'http://localhost:3003'}/customer-payment/${upgradeRequest._id}`;
    
    try {
      // await emailService.sendUpgradePaymentLink(upgradeRequest, paymentLink);
      console.log('Email service temporarily disabled - would send to:', paymentLink);
      upgradeRequest.communication.emailSent = true;
      upgradeRequest.communication.emailSentAt = new Date();
      await upgradeRequest.save();
    } catch (error) {
      console.error('Failed to send upgrade email:', error);
      // Don't fail the request if email fails
    }
  }

  // Populate response
  await upgradeRequest.populate([
    { path: 'tenancy', select: 'name slug contactPerson' },
    { path: 'fromPlan', select: 'name displayName price' },
    { path: 'toPlan', select: 'name displayName price features' },
    { path: 'createdBy', select: 'name email' }
  ]);

  sendSuccess(res, upgradeRequest, 'Upgrade request created successfully', 201);
});

/**
 * Get upgrade requests
 * GET /api/sales/upgrades
 */
exports.getUpgradeRequests = asyncHandler(async (req, res) => {
  const {
    status,
    tenancyId,
    createdBy,
    page = 1,
    limit = 20,
    sortBy = 'requestedAt',
    sortOrder = 'desc',
    search
  } = req.query;

  // Build filter
  const filter = {};
  if (status) filter.status = status;
  if (tenancyId) filter.tenancy = tenancyId;
  if (createdBy) filter.createdBy = createdBy;

  // Search filter
  if (search) {
    const tenancies = await Tenancy.find({
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } }
      ]
    }).select('_id');
    
    filter.tenancy = { $in: tenancies.map(t => t._id) };
  }

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  // Get upgrade requests
  const upgradeRequests = await UpgradeRequest.find(filter)
    .populate('tenancy', 'name slug contactPerson branding')
    .populate('fromPlan', 'name displayName price')
    .populate('toPlan', 'name displayName price features')
    .populate('createdBy', 'name email')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  // Get total count
  const total = await UpgradeRequest.countDocuments(filter);

  // Get statistics
  const stats = await UpgradeRequest.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalValue: { $sum: '$pricing.customPrice' },
        totalPaid: { $sum: '$payment.totalPaid' }
      }
    }
  ]);

  sendSuccess(res, {
    upgradeRequests,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    },
    stats
  }, 'Upgrade requests retrieved');
});

/**
 * Get single upgrade request
 * GET /api/sales/upgrades/:id
 */
exports.getUpgradeRequest = asyncHandler(async (req, res) => {
  const upgradeRequest = await UpgradeRequest.findById(req.params.id)
    .populate('tenancy', 'name slug contactPerson branding subscription')
    .populate('fromPlan', 'name displayName price features')
    .populate('toPlan', 'name displayName price features')
    .populate('createdBy', 'name email')
    .populate('updatedBy', 'name email');

  if (!upgradeRequest) {
    return sendError(res, 'NOT_FOUND', 'Upgrade request not found', 404);
  }

  sendSuccess(res, upgradeRequest, 'Upgrade request retrieved');
});

/**
 * Record payment for upgrade request
 * POST /api/sales/upgrades/:id/payment
 */
exports.recordPayment = asyncHandler(async (req, res) => {
  const { amount, method, transactionId, notes } = req.body;
  
  if (!amount || amount <= 0) {
    return sendError(res, 'INVALID_AMOUNT', 'Valid payment amount is required', 400);
  }

  const upgradeRequest = await UpgradeRequest.findById(req.params.id);
  
  if (!upgradeRequest) {
    return sendError(res, 'NOT_FOUND', 'Upgrade request not found', 404);
  }

  if (['completed', 'cancelled', 'expired'].includes(upgradeRequest.status)) {
    return sendError(res, 'INVALID_STATE', 'Cannot record payment for this upgrade request', 400);
  }

  if (amount > upgradeRequest.payment.remainingAmount) {
    return sendError(res, 'INVALID_AMOUNT', 'Payment amount exceeds remaining balance', 400);
  }

  // Record payment
  upgradeRequest.addPayment({
    amount: parseFloat(amount),
    method: method || 'manual',
    transactionId: transactionId || '',
    recordedBy: req.salesUser?._id || req.admin?._id,
    recordedByModel: req.salesUser ? 'SalesUser' : 'SuperAdmin',
    date: new Date()
  });

  await upgradeRequest.save();

  sendSuccess(res, upgradeRequest, 'Payment recorded successfully');
});

/**
 * Get upgrade statistics
 * GET /api/sales/upgrades/stats
 */
exports.getUpgradeStats = asyncHandler(async (req, res) => {
  const { period = '30d' } = req.query;
  
  // Calculate date range
  let startDate = new Date();
  switch (period) {
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(startDate.getDate() - 90);
      break;
    case '1y':
      startDate.setFullYear(startDate.getFullYear() - 1);
      break;
    default:
      startDate.setDate(startDate.getDate() - 30);
  }

  // Get statistics
  const stats = await UpgradeRequest.aggregate([
    {
      $match: {
        requestedAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalValue: { $sum: '$pricing.customPrice' },
        totalPaid: { $sum: '$payment.totalPaid' },
        avgValue: { $avg: '$pricing.customPrice' }
      }
    }
  ]);

  // Get conversion rate
  const totalRequests = await UpgradeRequest.countDocuments({
    requestedAt: { $gte: startDate }
  });
  
  const completedRequests = await UpgradeRequest.countDocuments({
    requestedAt: { $gte: startDate },
    status: 'completed'
  });

  const conversionRate = totalRequests > 0 ? (completedRequests / totalRequests) * 100 : 0;

  // Get overdue requests
  const overdueRequests = await UpgradeRequest.countDocuments({
    status: { $in: ['pending', 'partially_paid'] },
    'paymentTerms.dueDate': { $lt: new Date() }
  });

  sendSuccess(res, {
    period,
    stats,
    summary: {
      totalRequests,
      completedRequests,
      conversionRate: Math.round(conversionRate * 100) / 100,
      overdueRequests
    }
  }, 'Upgrade statistics retrieved');
});

/**
 * Send reminder for upgrade request
 * POST /api/sales/upgrades/:id/remind
 */
exports.sendReminder = asyncHandler(async (req, res) => {
  const { reminderType, customMessage } = req.body;
  
  const upgradeRequest = await UpgradeRequest.findById(req.params.id)
    .populate('tenancy', 'name contactPerson');
  
  if (!upgradeRequest) {
    return sendError(res, 'NOT_FOUND', 'Upgrade request not found', 404);
  }

  if (!['pending', 'partially_paid', 'overdue'].includes(upgradeRequest.status)) {
    return sendError(res, 'INVALID_STATE', 'Cannot send reminder for this upgrade request', 400);
  }

  // Send reminder
  upgradeRequest.sendReminder(reminderType || 'payment_due');
  
  // Update communication
  if (customMessage) {
    upgradeRequest.communication.customMessage = customMessage;
  }

  await upgradeRequest.save();

  sendSuccess(res, upgradeRequest, 'Reminder sent successfully');
});

/**
 * Extend due date for upgrade request
 * POST /api/sales/upgrades/:id/extend
 */
exports.extendDueDate = asyncHandler(async (req, res) => {
  const { newDueDate, reason } = req.body;
  
  if (!newDueDate) {
    return sendError(res, 'MISSING_DUE_DATE', 'New due date is required', 400);
  }

  const upgradeRequest = await UpgradeRequest.findById(req.params.id);
  
  if (!upgradeRequest) {
    return sendError(res, 'NOT_FOUND', 'Upgrade request not found', 404);
  }

  if (['completed', 'cancelled'].includes(upgradeRequest.status)) {
    return sendError(res, 'INVALID_STATE', 'Cannot extend due date for completed or cancelled request', 400);
  }

  const newDate = new Date(newDueDate);
  if (newDate <= new Date()) {
    return sendError(res, 'INVALID_DATE', 'New due date must be in the future', 400);
  }

  // Extend due date
  upgradeRequest.extendDueDate(
    newDate,
    req.salesUser?._id || req.admin?._id,
    req.salesUser ? 'SalesUser' : 'SuperAdmin',
    reason || 'Extended by sales team'
  );

  await upgradeRequest.save();

  sendSuccess(res, upgradeRequest, 'Due date extended successfully');
});

/**
 * Get public upgrade request (for customer payment page)
 * GET /api/sales/upgrades/public/:id
 */
exports.getPublicUpgradeRequest = asyncHandler(async (req, res) => {
  const upgradeRequest = await UpgradeRequest.findById(req.params.id)
    .populate('tenancy', 'name contactPerson branding')
    .populate('fromPlan', 'name displayName price')
    .populate('toPlan', 'name displayName price features')
    .select('-history -createdBy -updatedBy'); // Exclude sensitive fields

  if (!upgradeRequest) {
    return sendError(res, 'NOT_FOUND', 'Upgrade request not found', 404);
  }

  // Only allow access to pending/partially_paid requests
  if (!['pending', 'partially_paid', 'overdue'].includes(upgradeRequest.status)) {
    return sendError(res, 'INVALID_STATE', 'This upgrade request is no longer available for payment', 400);
  }

  sendSuccess(res, upgradeRequest, 'Upgrade request retrieved');
});

/**
 * Send email for upgrade request
 * POST /api/sales/upgrades/:id/send-email
 */
exports.sendUpgradeEmail = asyncHandler(async (req, res) => {
  const upgradeRequest = await UpgradeRequest.findById(req.params.id)
    .populate('tenancy', 'name contactPerson')
    .populate('fromPlan', 'name displayName price')
    .populate('toPlan', 'name displayName price');
  
  if (!upgradeRequest) {
    return sendError(res, 'NOT_FOUND', 'Upgrade request not found', 404);
  }

  if (!['pending', 'partially_paid', 'overdue'].includes(upgradeRequest.status)) {
    return sendError(res, 'INVALID_STATE', 'Cannot send email for this upgrade request', 400);
  }

  const paymentLink = `${process.env.FRONTEND_URL || 'http://localhost:3003'}/customer-payment/${upgradeRequest._id}`;
  
  try {
    // const result = await emailService.sendUpgradePaymentLink(upgradeRequest, paymentLink);
    const result = { success: true, messageId: 'temp-disabled' };
    
    if (result.success) {
      upgradeRequest.communication.emailSent = true;
      upgradeRequest.communication.emailSentAt = new Date();
      await upgradeRequest.save();
      
      sendSuccess(res, { messageId: result.messageId }, 'Email sent successfully (temporarily disabled)');
    } else {
      sendError(res, 'EMAIL_FAILED', result.error, 500);
    }
  } catch (error) {
    console.error('Email sending error:', error);
    sendError(res, 'EMAIL_FAILED', 'Failed to send email', 500);
  }
});

/**
 * Create Stripe payment intent for upgrade request
 * POST /api/sales/upgrades/:id/create-payment-intent
 */
exports.createPaymentIntent = asyncHandler(async (req, res) => {
  const upgradeRequest = await UpgradeRequest.findById(req.params.id)
    .populate('tenancy', 'name contactPerson')
    .populate('fromPlan', 'name displayName price')
    .populate('toPlan', 'name displayName price features');

  if (!upgradeRequest) {
    return sendError(res, 'NOT_FOUND', 'Upgrade request not found', 404);
  }

  if (!['pending', 'partially_paid', 'overdue'].includes(upgradeRequest.status)) {
    return sendError(res, 'INVALID_STATE', 'Cannot create payment intent for this upgrade request', 400);
  }

  const result = await stripeService.createPaymentIntent(upgradeRequest);

  if (result.success) {
    sendSuccess(res, {
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntent.id
    }, 'Payment intent created successfully');
  } else {
    sendError(res, 'PAYMENT_INTENT_FAILED', result.error, 500);
  }
});

/**
 * Create Stripe checkout session for upgrade request
 * POST /api/sales/upgrades/:id/create-checkout-session
 */
exports.createCheckoutSession = asyncHandler(async (req, res) => {
  const upgradeRequest = await UpgradeRequest.findById(req.params.id)
    .populate('tenancy', 'name contactPerson')
    .populate('fromPlan', 'name displayName price')
    .populate('toPlan', 'name displayName price features');

  if (!upgradeRequest) {
    return sendError(res, 'NOT_FOUND', 'Upgrade request not found', 404);
  }

  if (!['pending', 'partially_paid', 'overdue'].includes(upgradeRequest.status)) {
    return sendError(res, 'INVALID_STATE', 'Cannot create checkout session for this upgrade request', 400);
  }

  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3003';
  const successUrl = `${baseUrl}/customer-payment/${upgradeRequest._id}/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/customer-payment/${upgradeRequest._id}`;

  const result = await stripeService.createCheckoutSession(upgradeRequest, successUrl, cancelUrl);

  if (result.success) {
    sendSuccess(res, {
      sessionId: result.sessionId,
      url: result.url
    }, 'Checkout session created successfully');
  } else {
    sendError(res, 'CHECKOUT_SESSION_FAILED', result.error, 500);
  }
});

/**
 * Handle Stripe webhook events
 * POST /api/sales/upgrades/stripe-webhook
 */
exports.handleStripeWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['stripe-signature'];
  
  if (!signature) {
    return sendError(res, 'MISSING_SIGNATURE', 'Stripe signature missing', 400);
  }

  const verification = stripeService.verifyWebhookSignature(req.body, signature);
  
  if (!verification.success) {
    return sendError(res, 'INVALID_SIGNATURE', verification.error, 400);
  }

  const event = verification.event;

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;
      
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook handling error:', error);
    res.status(500).json({ error: 'Webhook handling failed' });
  }
});

/**
 * Handle successful payment intent
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  const upgradeRequestId = paymentIntent.metadata.upgradeRequestId;
  
  if (!upgradeRequestId) {
    console.error('No upgrade request ID in payment intent metadata');
    return;
  }

  const upgradeRequest = await UpgradeRequest.findById(upgradeRequestId);
  
  if (!upgradeRequest) {
    console.error('Upgrade request not found:', upgradeRequestId);
    return;
  }

  const amount = paymentIntent.amount / 100; // Convert from paise to rupees

  // Record the payment
  upgradeRequest.addPayment({
    amount: amount,
    method: 'stripe',
    transactionId: paymentIntent.id,
    recordedBy: null,
    recordedByModel: 'System',
    date: new Date(),
    stripePaymentIntentId: paymentIntent.id
  });

  await upgradeRequest.save();

  console.log(`Payment recorded for upgrade request ${upgradeRequestId}: ₹${amount}`);
}

/**
 * Handle completed checkout session
 */
async function handleCheckoutSessionCompleted(session) {
  const upgradeRequestId = session.metadata.upgradeRequestId;
  
  if (!upgradeRequestId) {
    console.error('No upgrade request ID in checkout session metadata');
    return;
  }

  const upgradeRequest = await UpgradeRequest.findById(upgradeRequestId);
  
  if (!upgradeRequest) {
    console.error('Upgrade request not found:', upgradeRequestId);
    return;
  }

  const amount = session.amount_total / 100; // Convert from paise to rupees

  // Record the payment
  upgradeRequest.addPayment({
    amount: amount,
    method: 'stripe_checkout',
    transactionId: session.payment_intent,
    recordedBy: null,
    recordedByModel: 'System',
    date: new Date(),
    stripeSessionId: session.id
  });

  await upgradeRequest.save();

  console.log(`Checkout payment recorded for upgrade request ${upgradeRequestId}: ₹${amount}`);
}

/**
 * Handle failed payment intent
 */
async function handlePaymentIntentFailed(paymentIntent) {
  const upgradeRequestId = paymentIntent.metadata.upgradeRequestId;
  
  if (!upgradeRequestId) {
    console.error('No upgrade request ID in failed payment intent metadata');
    return;
  }

  const upgradeRequest = await UpgradeRequest.findById(upgradeRequestId);
  
  if (!upgradeRequest) {
    console.error('Upgrade request not found:', upgradeRequestId);
    return;
  }

  // Add history entry for failed payment
  upgradeRequest.addHistory(
    'payment_failed',
    null,
    'System',
    { 
      paymentIntentId: paymentIntent.id,
      failureReason: paymentIntent.last_payment_error?.message || 'Payment failed'
    }
  );

  await upgradeRequest.save();

  console.log(`Payment failed for upgrade request ${upgradeRequestId}: ${paymentIntent.last_payment_error?.message}`);
}

/**
 * Cancel upgrade request
 * DELETE /api/sales/upgrades/:id
 */
exports.cancelUpgradeRequest = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  
  const upgradeRequest = await UpgradeRequest.findById(req.params.id);
  
  if (!upgradeRequest) {
    return sendError(res, 'NOT_FOUND', 'Upgrade request not found', 404);
  }

  if (['completed', 'cancelled'].includes(upgradeRequest.status)) {
    return sendError(res, 'INVALID_STATE', 'Upgrade request is already completed or cancelled', 400);
  }

  // Cancel the upgrade request
  upgradeRequest.cancel(
    req.salesUser?._id || req.admin?._id,
    req.salesUser ? 'SalesUser' : 'SuperAdmin',
    reason || 'Cancelled by sales team'
  );

  await upgradeRequest.save();

  sendSuccess(res, upgradeRequest, 'Upgrade request cancelled successfully');
});