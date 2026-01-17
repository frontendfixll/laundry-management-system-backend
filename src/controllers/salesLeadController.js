const Lead = require('../models/Lead');
const Tenancy = require('../models/Tenancy');
const { sendSuccess, sendError, asyncHandler } = require('../utils/helpers');
const { validationResult } = require('express-validator');

/**
 * Get all leads with filters
 * GET /api/sales/leads
 */
exports.getLeads = asyncHandler(async (req, res) => {
  const {
    status,
    source,
    priority,
    assignedTo,
    search,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Build filter
  const filter = {};
  
  // IMPORTANT: Sales users can only see their own assigned leads
  // Unless they explicitly query for unassigned leads
  if (assignedTo === 'unassigned') {
    filter.assignedTo = null;
  } else if (assignedTo) {
    filter.assignedTo = assignedTo;
  } else {
    // Default: show only leads assigned to the logged-in sales user
    filter.assignedTo = req.salesUser._id;
  }
  
  if (status) filter.status = status;
  if (source) filter.source = source;
  if (priority) filter.priority = priority;
  
  // Search by business name, contact name, email, or phone
  if (search) {
    filter.$or = [
      { businessName: { $regex: search, $options: 'i' } },
      { 'contactPerson.name': { $regex: search, $options: 'i' } },
      { 'contactPerson.email': { $regex: search, $options: 'i' } },
      { 'contactPerson.phone': { $regex: search, $options: 'i' } }
    ];
  }

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  // Get leads
  const leads = await Lead.find(filter)
    .populate('assignedTo', 'name email')
    .populate('tenancyId', 'name slug')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  // Get total count
  const total = await Lead.countDocuments(filter);

  sendSuccess(res, {
    leads,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  }, 'Leads retrieved successfully');
});

/**
 * Get single lead
 * GET /api/sales/leads/:id
 */
exports.getLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id)
    .populate('assignedTo', 'name email phone')
    .populate('tenancyId', 'name slug subdomain')
    .populate('followUpNotes.addedBy', 'name email');

  if (!lead) {
    return sendError(res, 'Lead not found', 404);
  }

  sendSuccess(res, 'Lead retrieved', lead);
});

/**
 * Create new lead
 * POST /api/sales/leads
 */
exports.createLead = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation failed', 400, errors.array());
  }

  const leadData = {
    ...req.body,
    createdBy: req.salesUser._id,
    createdByModel: 'SalesUser'
  };

  // Auto-assign to creator if not specified
  if (!leadData.assignedTo) {
    leadData.assignedTo = req.salesUser._id;
    leadData.assignedDate = new Date();
  }

  const lead = await Lead.create(leadData);

  // Calculate initial score
  await lead.calculateScore();

  // Update sales user performance
  await req.salesUser.updatePerformance({
    leadsAssigned: req.salesUser.performance.leadsAssigned + 1
  });

  sendSuccess(res, 'Lead created successfully', lead, 201);
});

/**
 * Update lead
 * PUT /api/sales/leads/:id
 */
exports.updateLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    return sendError(res, 'Lead not found', 404);
  }

  // Update fields
  const allowedFields = [
    'businessName', 'businessType', 'contactPerson', 'address',
    'status', 'source', 'interestedPlan', 'estimatedRevenue',
    'requirements', 'nextFollowUp', 'priority', 'tags'
  ];

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      lead[field] = req.body[field];
    }
  });

  lead.updatedBy = req.salesUser._id;
  lead.updatedByModel = 'SalesUser';

  await lead.save();

  // Recalculate score
  await lead.calculateScore();

  sendSuccess(res, 'Lead updated successfully', lead);
});

/**
 * Delete lead
 * DELETE /api/sales/leads/:id
 */
exports.deleteLead = asyncHandler(async (req, res) => {
  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    return sendError(res, 'Lead not found', 404);
  }

  await lead.deleteOne();

  sendSuccess(res, 'Lead deleted successfully');
});

/**
 * Assign lead to sales user
 * POST /api/sales/leads/:id/assign
 */
exports.assignLead = asyncHandler(async (req, res) => {
  const { salesUserId } = req.body;
  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    return sendError(res, 'Lead not found', 404);
  }

  lead.assignedTo = salesUserId;
  lead.assignedDate = new Date();
  await lead.save();

  sendSuccess(res, 'Lead assigned successfully', lead);
});

/**
 * Add follow-up note
 * POST /api/sales/leads/:id/follow-up
 */
exports.addFollowUpNote = asyncHandler(async (req, res) => {
  const { note, nextFollowUp } = req.body;
  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    return sendError(res, 'Lead not found', 404);
  }

  await lead.addFollowUpNote(note, req.salesUser._id);
  
  if (nextFollowUp) {
    lead.nextFollowUp = nextFollowUp;
    await lead.save();
  }

  // Recalculate score
  await lead.calculateScore();

  const updatedLead = await Lead.findById(req.params.id)
    .populate('followUpNotes.addedBy', 'name email');

  sendSuccess(res, 'Follow-up note added', updatedLead);
});

/**
 * Start trial for lead
 * POST /api/sales/leads/:id/start-trial
 */
exports.startTrial = asyncHandler(async (req, res) => {
  const { trialDays = 60 } = req.body;
  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    return sendError(res, 'Lead not found', 404);
  }

  if (lead.trial.isActive) {
    return sendError(res, 'Trial is already active', 400);
  }

  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + trialDays * 24 * 60 * 60 * 1000);

  lead.trial = {
    isActive: true,
    startDate,
    endDate,
    daysRemaining: trialDays,
    extensionCount: 0
  };

  lead.status = 'demo_completed'; // Move to demo completed status
  await lead.save();

  sendSuccess(res, 'Trial started successfully', lead);
});

/**
 * Extend trial
 * POST /api/sales/leads/:id/extend-trial
 */
exports.extendTrial = asyncHandler(async (req, res) => {
  const { extensionDays = 7 } = req.body;
  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    return sendError(res, 'Lead not found', 404);
  }

  if (!lead.trial.isActive) {
    return sendError(res, 'No active trial to extend', 400);
  }

  // Extend trial
  const currentEndDate = new Date(lead.trial.endDate);
  const newEndDate = new Date(currentEndDate.getTime() + extensionDays * 24 * 60 * 60 * 1000);

  lead.trial.endDate = newEndDate;
  lead.trial.extensionCount += 1;
  lead.trial.lastExtendedDate = new Date();
  
  await lead.updateTrialDaysRemaining();

  sendSuccess(res, `Trial extended by ${extensionDays} days`, lead);
});

/**
 * Convert lead to customer
 * POST /api/sales/leads/:id/convert
 */
exports.convertLead = asyncHandler(async (req, res) => {
  const { tenancyId } = req.body;
  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    return sendError(res, 'Lead not found', 404);
  }

  if (lead.isConverted) {
    return sendError(res, 'Lead is already converted', 400);
  }

  // Verify tenancy exists
  const tenancy = await Tenancy.findById(tenancyId);
  if (!tenancy) {
    return sendError(res, 'Tenancy not found', 404);
  }

  await lead.convertToCustomer(tenancyId);

  // Update sales user performance
  await req.salesUser.updatePerformance({
    leadsConverted: req.salesUser.performance.leadsConverted + 1,
    totalRevenue: req.salesUser.performance.totalRevenue + (lead.estimatedRevenue || 0)
  });

  sendSuccess(res, 'Lead converted successfully', lead);
});

/**
 * Mark lead as lost
 * POST /api/sales/leads/:id/mark-lost
 */
exports.markLeadAsLost = asyncHandler(async (req, res) => {
  const { reason, notes } = req.body;
  const lead = await Lead.findById(req.params.id);

  if (!lead) {
    return sendError(res, 'Lead not found', 404);
  }

  await lead.markAsLost(reason, notes);

  sendSuccess(res, 'Lead marked as lost', lead);
});

/**
 * Get lead statistics
 * GET /api/sales/leads/stats
 */
exports.getLeadStats = asyncHandler(async (req, res) => {
  const { assignedTo } = req.query;
  
  const filter = assignedTo ? { assignedTo } : {};

  const stats = await Lead.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        new: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } },
        contacted: { $sum: { $cond: [{ $eq: ['$status', 'contacted'] }, 1, 0] } },
        qualified: { $sum: { $cond: [{ $eq: ['$status', 'qualified'] }, 1, 0] } },
        demoScheduled: { $sum: { $cond: [{ $eq: ['$status', 'demo_scheduled'] }, 1, 0] } },
        demoCompleted: { $sum: { $cond: [{ $eq: ['$status', 'demo_completed'] }, 1, 0] } },
        negotiation: { $sum: { $cond: [{ $eq: ['$status', 'negotiation'] }, 1, 0] } },
        converted: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } },
        lost: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } },
        onHold: { $sum: { $cond: [{ $eq: ['$status', 'on_hold'] }, 1, 0] } },
        activeTrial: { $sum: { $cond: ['$trial.isActive', 1, 0] } },
        totalEstimatedRevenue: { $sum: '$estimatedRevenue' }
      }
    }
  ]);

  const result = stats[0] || {
    total: 0,
    new: 0,
    contacted: 0,
    qualified: 0,
    demoScheduled: 0,
    demoCompleted: 0,
    negotiation: 0,
    converted: 0,
    lost: 0,
    onHold: 0,
    activeTrial: 0,
    totalEstimatedRevenue: 0
  };

  // Calculate conversion rate
  const conversionRate = result.total > 0 
    ? ((result.converted / result.total) * 100).toFixed(2)
    : 0;

  sendSuccess(res, {
    ...result,
    conversionRate: parseFloat(conversionRate)
  }, 'Lead statistics retrieved');
});

/**
 * Get leads expiring soon (trial ending)
 * GET /api/sales/leads/expiring-soon
 */
exports.getExpiringLeads = asyncHandler(async (req, res) => {
  const { days = 7 } = req.query;
  
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + parseInt(days));

  const leads = await Lead.find({
    'trial.isActive': true,
    'trial.endDate': { $lte: expiryDate, $gte: new Date() }
  })
    .populate('assignedTo', 'name email')
    .sort({ 'trial.endDate': 1 });

  sendSuccess(res, { leads }, 'Expiring leads retrieved');
});
