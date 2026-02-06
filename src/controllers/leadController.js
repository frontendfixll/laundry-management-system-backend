const Lead = require('../models/Lead');
const SalesUser = require('../models/SalesUser');
const { sendSuccess, sendError, asyncHandler } = require('../utils/helpers');

/**
 * Create a new lead (public endpoint - no auth required)
 * POST /api/public/leads
 */
const createLead = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      businessName,
      businessType,
      message,
      interestedPlan,
      expectedMonthlyOrders,
      currentBranches,
      address,
      source
    } = req.body;

    // Calculate initial lead score based on provided information
    let score = 50; // Base score

    // Score adjustments
    if (interestedPlan === 'enterprise') score += 20;
    else if (interestedPlan === 'pro') score += 15;
    else if (interestedPlan === 'basic') score += 10;

    if (expectedMonthlyOrders === '5000+') score += 15;
    else if (expectedMonthlyOrders === '1000-5000') score += 10;
    else if (expectedMonthlyOrders === '500-1000') score += 5;

    if (currentBranches > 5) score += 10;
    else if (currentBranches > 2) score += 5;

    if (address && address.city) score += 5;

    // Determine priority based on score
    let priority = 'medium';
    if (score >= 80) priority = 'urgent';
    else if (score >= 65) priority = 'high';
    else if (score >= 50) priority = 'medium';
    else priority = 'low';

    // Calculate estimated revenue
    const planPrices = { basic: 999, pro: 2999, enterprise: 9999 };
    const basePrice = planPrices[interestedPlan] || 999;
    const estimatedRevenue = basePrice * 12; // Annual revenue

    // Parse expected orders
    const orderRanges = {
      '0-100': 50,
      '100-500': 300,
      '500-1000': 750,
      '1000-5000': 3000,
      '5000+': 7500
    };
    const expectedOrders = orderRanges[expectedMonthlyOrders] || 0;

    // Create lead with new schema structure
    const lead = await Lead.create({
      businessName,
      businessType: businessType || 'laundry',
      contactPerson: {
        name,
        email,
        phone
      },
      address: address || {},
      status: 'new',
      source: source || 'website',
      interestedPlan: interestedPlan || 'undecided',
      estimatedRevenue,
      requirements: {
        numberOfBranches: currentBranches || 1,
        expectedOrders,
        notes: message || ''
      },
      priority,
      score: Math.min(score, 100),
      followUpNotes: message ? [{
        note: `Initial inquiry: ${message}`,
        createdAt: new Date()
      }] : []
    });

    // Auto-assign to first available sales user (if any)
    const salesUser = await SalesUser.findOne({ isActive: true }).sort({ 'performance.leadsAssigned': 1 });
    if (salesUser) {
      lead.assignedTo = salesUser._id;
      lead.assignedDate = new Date();
      await lead.save();

      // Update sales user performance
      await salesUser.updatePerformance({
        leadsAssigned: salesUser.performance.leadsAssigned + 1
      });
    }

    // Notify SuperAdmins about new lead
    try {
      const NotificationService = require('../services/notificationService');
      await NotificationService.notifyAllSuperAdmins({
        type: 'new_lead',
        title: 'New Lead Inquiry! 💼',
        message: `${lead.businessName} has shown interest in the ${lead.interestedPlan} plan.`,
        icon: 'user-plus',
        severity: 'info',
        data: { leadId: lead._id, link: `/leads` }
      });
    } catch (notifyError) {
      console.error('⚠️ Failed to notify SuperAdmins about new lead:', notifyError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Thank you for your interest! Our team will contact you soon.',
      data: { leadId: lead._id }
    });
  } catch (error) {
    console.error('❌ Create lead error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to submit your request. Please try again.'
    });
  }
};

/**
 * Get all leads with filtering and pagination (superadmin only)
 * GET /api/superadmin/leads
 */
const getLeads = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }

    const total = await Lead.countDocuments(query);
    const leads = await Lead.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    res.json({
      success: true,
      data: {
        leads,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch leads'
    });
  }
};

/**
 * Get lead by ID (superadmin only)
 * GET /api/superadmin/leads/:id
 */
const getLeadById = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('tenancyId', 'name slug')
      .populate('assignedTo', 'name email')
      .lean();

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    res.json({
      success: true,
      data: lead
    });
  } catch (error) {
    console.error('Get lead by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lead'
    });
  }
};

/**
 * Update lead (superadmin only)
 * PATCH /api/superadmin/leads/:id
 */
const updateLead = async (req, res) => {
  try {
    const { status, priority, interestedPlan, estimatedRevenue, assignedTo } = req.body;

    const updateData = {};
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (interestedPlan) updateData.interestedPlan = interestedPlan;
    if (estimatedRevenue !== undefined) updateData.estimatedRevenue = estimatedRevenue;
    if (assignedTo) {
      updateData.assignedTo = assignedTo;
      updateData.assignedDate = new Date();
    }

    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).lean();

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    res.json({
      success: true,
      message: 'Lead updated successfully',
      data: lead
    });
  } catch (error) {
    console.error('Update lead error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update lead'
    });
  }
};

/**
 * Delete lead (superadmin only)
 * DELETE /api/superadmin/leads/:id
 */
const deleteLead = async (req, res) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    res.json({
      success: true,
      message: 'Lead deleted successfully'
    });
  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete lead'
    });
  }
};

/**
 * Get lead statistics (superadmin only)
 * GET /api/superadmin/leads/stats
 */
const getLeadStats = async (req, res) => {
  try {
    const stats = await Lead.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const total = await Lead.countDocuments();
    const thisMonth = await Lead.countDocuments({
      createdAt: { $gte: new Date(new Date().setDate(1)) }
    });
    const converted = await Lead.countDocuments({ isConverted: true });

    const statusCounts = stats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        total,
        thisMonth,
        converted,
        byStatus: {
          new: statusCounts.new || 0,
          contacted: statusCounts.contacted || 0,
          qualified: statusCounts.qualified || 0,
          demo_scheduled: statusCounts.demo_scheduled || 0,
          demo_completed: statusCounts.demo_completed || 0,
          negotiation: statusCounts.negotiation || 0,
          converted: statusCounts.converted || 0,
          lost: statusCounts.lost || 0,
          on_hold: statusCounts.on_hold || 0
        }
      }
    });
  } catch (error) {
    console.error('Get lead stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lead statistics'
    });
  }
};

module.exports = {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  getLeadStats
};
