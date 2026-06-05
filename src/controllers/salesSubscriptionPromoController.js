const SubscriptionPromo = require('../models/SubscriptionPromo');
const { BillingPlan } = require('../models/TenancyBilling');
const { sendSuccess, sendError, asyncHandler } = require('../utils/helpers');
const { validationResult } = require('express-validator');

exports.listPromos = asyncHandler(async (req, res) => {
  const promos = await SubscriptionPromo.find()
    .populate('grantsPlanId', 'name displayName price trialDays')
    .sort({ createdAt: -1 });
  sendSuccess(res, promos, 'Promo codes fetched');
});

exports.getPromo = asyncHandler(async (req, res) => {
  const promo = await SubscriptionPromo.findById(req.params.id)
    .populate('grantsPlanId', 'name displayName price');
  if (!promo) return sendError(res, 'Promo not found', 404);
  sendSuccess(res, promo, 'Promo fetched');
});

exports.createPromo = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendError(res, 'Validation failed', 400, errors.array());

  const { code, description, grantsPlanId, trialDays, billingCycle, maxRedemptions, expiresAt } = req.body;

  const plan = await BillingPlan.findById(grantsPlanId);
  if (!plan) return sendError(res, 'Plan not found', 404);

  const existing = await SubscriptionPromo.findOne({ code: code.toUpperCase() });
  if (existing) return sendError(res, 'Code already exists', 400);

  const promo = await SubscriptionPromo.create({
    code: code.toUpperCase(),
    description,
    grantsPlanId,
    trialDays,
    billingCycle: billingCycle || 'monthly',
    maxRedemptions: maxRedemptions || null,
    expiresAt: expiresAt || null,
    createdBy: req.salesUser?._id || req.superAdmin?._id,
    createdByModel: req.salesUser ? 'SalesUser' : 'SuperAdmin',
  });

  sendSuccess(res, promo, 'Promo created', 201);
});

exports.updatePromo = asyncHandler(async (req, res) => {
  const { description, trialDays, billingCycle, maxRedemptions, expiresAt, isActive } = req.body;
  const updates = {};
  if (description !== undefined) updates.description = description;
  if (trialDays !== undefined) updates.trialDays = trialDays;
  if (billingCycle !== undefined) updates.billingCycle = billingCycle;
  if (maxRedemptions !== undefined) updates.maxRedemptions = maxRedemptions;
  if (expiresAt !== undefined) updates.expiresAt = expiresAt;
  if (isActive !== undefined) updates.isActive = isActive;

  const promo = await SubscriptionPromo.findByIdAndUpdate(req.params.id, updates, { new: true })
    .populate('grantsPlanId', 'name displayName price');
  if (!promo) return sendError(res, 'Promo not found', 404);

  sendSuccess(res, promo, 'Promo updated');
});

exports.deactivatePromo = asyncHandler(async (req, res) => {
  const promo = await SubscriptionPromo.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );
  if (!promo) return sendError(res, 'Promo not found', 404);
  sendSuccess(res, promo, 'Promo deactivated');
});
