const Campaign = require('../../models/Campaign');
const CampaignEngine = require('../../services/campaignEngine');
const { validationResult } = require('express-validator');
const { autoCreateBanner, updatePromotionBanner, deletePromotionBanner } = require('../../services/autoBannerService');

// ============ TENANT CAMPAIGNS (Admin Level) ============

// Get all tenant campaigns for current admin's tenancy
const getTenantCampaigns = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, priority } = req.query;
    const tenancyId = req.user.tenancy;
    
    // Build filter for tenant campaigns only
    const filter = { 
      campaignScope: 'TENANT',
      tenancy: tenancyId
    };
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      filter.status = status;
    }
    
    if (priority) {
      filter.priority = { $gte: parseInt(priority) };
    }
    
    const campaigns = await Campaign.find(filter)
      .sort({ priority: -1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('promotions.promotionId')
      .populate('tenancy', 'name slug');
    
    const total = await Campaign.countDocuments(filter);
    
    res.json({
      success: true,
      data: {
        campaigns,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Get tenant campaigns error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tenant campaigns'
    });
  }
};

// Create tenant campaign
const createTenantCampaign = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const tenancyId = req.user.tenancy;
    const {
      name, description, startDate, endDate, priority,
      triggers, audience, promotions, budget, limits, stacking
    } = req.body;
    
    // Validate admin's discount limits (implement based on your business rules)
    const isWithinLimits = await validateAdminLimits(promotions, tenancyId);
    if (!isWithinLimits.valid) {
      return res.status(400).json({
        success: false,
        message: isWithinLimits.message
      });
    }
    
    const campaign = new Campaign({
      campaignScope: 'TENANT',
      tenancy: tenancyId,
      name,
      description,
      startDate,
      endDate,
      priority: priority || 0,
      triggers: triggers || [{ type: 'ORDER_CHECKOUT' }],
      audience: audience || { targetType: 'ALL_USERS' },
      promotions: promotions || [],
      budget: {
        ...budget,
        budgetSource: 'TENANT_BUDGET'
      },
      limits: limits || {},
      stacking: stacking || {},
      createdBy: req.user._id,
      createdByModel: 'User',
      status: 'DRAFT'
    });
    
    await campaign.save();
    
    // Auto-create banner for this campaign
    try {
      await autoCreateBanner(campaign, 'Campaign', tenancyId, req.user._id);
    } catch (bannerError) {
      console.error('Failed to auto-create banner:', bannerError);
      // Don't fail campaign creation if banner fails
    }
    
    res.status(201).json({
      success: true,
      message: 'Tenant campaign created successfully (banner auto-generated)',
      data: { campaign }
    });
  } catch (error) {
    console.error('Create tenant campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create tenant campaign'
    });
  }
};

// Update tenant campaign
const updateTenantCampaign = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    
    const { campaignId } = req.params;
    const tenancyId = req.user.tenancy;
    
    const campaign = await Campaign.findOne({
      _id: campaignId,
      campaignScope: 'TENANT',
      tenancy: tenancyId
    });
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Tenant campaign not found'
      });
    }
    
    // Don't allow editing active campaigns with usage
    if (campaign.status === 'ACTIVE' && campaign.limits.usedCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit active campaign that has been used'
      });
    }
    
    const {
      name, description, startDate, endDate, priority,
      triggers, audience, promotions, budget, limits, stacking, status
    } = req.body;
    
    // Validate admin's discount limits if promotions changed
    if (promotions) {
      const isWithinLimits = await validateAdminLimits(promotions, tenancyId);
      if (!isWithinLimits.valid) {
        return res.status(400).json({
          success: false,
          message: isWithinLimits.message
        });
      }
    }
    
    // Update fields
    if (name !== undefined) campaign.name = name;
    if (description !== undefined) campaign.description = description;
    if (startDate !== undefined) campaign.startDate = startDate;
    if (endDate !== undefined) campaign.endDate = endDate;
    if (priority !== undefined) campaign.priority = priority;
    if (triggers !== undefined) campaign.triggers = triggers;
    if (audience !== undefined) campaign.audience = audience;
    if (promotions !== undefined) campaign.promotions = promotions;
    if (budget !== undefined) campaign.budget = { ...campaign.budget, ...budget };
    if (limits !== undefined) campaign.limits = { ...campaign.limits, ...limits };
    if (stacking !== undefined) campaign.stacking = { ...campaign.stacking, ...stacking };
    const previousStatus = campaign.status;
    if (status !== undefined) campaign.status = status;

    await campaign.save();

    // Notify customers when campaign goes ACTIVE
    if (status === 'ACTIVE' && previousStatus !== 'ACTIVE') {
      try {
        const NotificationService = require('../../services/notificationService');
        const User = require('../../models/User');
        const customers = await User.find({ tenancy: tenancyId, role: 'customer', isActive: true }).select('_id').limit(500);
        for (const customer of customers) {
          await NotificationService.createNotification({
            recipientId: customer._id,
            recipientType: 'customer',
            tenancy: tenancyId,
            type: 'new_campaign',
            title: `New Offer: ${campaign.name}`,
            message: campaign.description || `Check out our latest promotion!`,
            icon: 'tag',
            severity: 'info',
            data: {
              campaignId: campaign._id,
              campaignName: campaign.name,
              startDate: campaign.startDate,
              endDate: campaign.endDate,
              link: '/customer/promotions'
            }
          });
        }
        console.log(`📢 Campaign notification sent to ${customers.length} customers`);
      } catch (err) {
        console.log('Failed to send campaign notification:', err.message);
      }
    }

    // Update linked banner
    try {
      await updatePromotionBanner(campaign._id, 'Campaign', {
        name: campaign.name,
        description: campaign.description,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        status: campaign.status
      });
    } catch (bannerError) {
      console.error('Failed to update banner:', bannerError);
    }
    
    res.json({
      success: true,
      message: 'Tenant campaign updated successfully',
      data: { campaign }
    });
  } catch (error) {
    console.error('Update tenant campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update tenant campaign'
    });
  }
};

// Delete tenant campaign
const deleteTenantCampaign = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const tenancyId = req.user.tenancy;
    
    const campaign = await Campaign.findOne({
      _id: campaignId,
      campaignScope: 'TENANT',
      tenancy: tenancyId
    });
    
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Tenant campaign not found'
      });
    }
    
    // Don't allow deleting active campaigns with usage
    if (campaign.status === 'ACTIVE' && campaign.limits.usedCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete active campaign that has been used'
      });
    }
    
    await Campaign.findByIdAndDelete(campaignId);
    
    // Delete linked banner
    try {
      await deletePromotionBanner(campaignId, 'Campaign');
    } catch (bannerError) {
      console.error('Failed to delete banner:', bannerError);
    }
    
    res.json({
      success: true,
      message: 'Tenant campaign deleted successfully'
    });
  } catch (error) {
    console.error('Delete tenant campaign error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete tenant campaign'
    });
  }
};

// Get campaign analytics for tenant
const getTenantCampaignAnalytics = async (req, res) => {
  try {
    const tenancyId = req.user.tenancy;
    const { startDate, endDate } = req.query;
    
    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }
    
    // Get tenant campaign analytics
    const tenantStats = await Campaign.aggregate([
      { 
        $match: { 
          campaignScope: 'TENANT',
          tenancy: tenancyId,
          ...dateFilter
        }
      },
      {
        $group: {
          _id: null,
          totalCampaigns: { $sum: 1 },
          activeCampaigns: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
          totalBudgetSpent: { $sum: '$budget.spentAmount' },
          totalSavings: { $sum: '$analytics.totalSavings' },
          totalConversions: { $sum: '$analytics.conversions' },
          totalRevenue: { $sum: '$analytics.totalRevenue' }
        }
      }
    ]);
    
    // Get global campaigns affecting this tenancy (read-only view)
    const globalStats = await Campaign.aggregate([
      {
        $match: {
          campaignScope: 'GLOBAL',
          status: 'ACTIVE',
          $or: [
            { applicableTenancies: tenancyId },
            { applicableTenancies: { $size: 0 } }
          ]
        }
      },
      {
        $group: {
          _id: null,
          globalCampaignsAffecting: { $sum: 1 },
          estimatedGlobalSavings: { $sum: '$analytics.totalSavings' }
        }
      }
    ]);
    
    const analytics = {
      tenant: tenantStats[0] || {
        totalCampaigns: 0,
        activeCampaigns: 0,
        totalBudgetSpent: 0,
        totalSavings: 0,
        totalConversions: 0,
        totalRevenue: 0
      },
      global: globalStats[0] || {
        globalCampaignsAffecting: 0,
        estimatedGlobalSavings: 0
      }
    };
    
    res.json({
      success: true,
      data: { analytics }
    });
  } catch (error) {
    console.error('Get tenant campaign analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaign analytics'
    });
  }
};

// Create campaign from template
const createFromTemplate = async (req, res) => {
  try {
    const { templateId } = req.params;
    const { customizations } = req.body;
    const tenancyId = req.user.tenancy;
    
    const result = await CampaignEngine.createCampaignFromTemplate(
      templateId,
      tenancyId,
      {
        ...customizations,
        createdBy: req.user._id,
        createdByModel: 'User'
      }
    );
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.status(201).json({
      success: true,
      message: 'Campaign created from template successfully',
      data: { campaign: result.campaign }
    });
  } catch (error) {
    console.error('Create from template error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create campaign from template'
    });
  }
};

// Get available templates
const getAvailableTemplates = async (req, res) => {
  try {
    const templates = await Campaign.find({
      campaignScope: 'TEMPLATE',
      status: 'ACTIVE'
    }).select('name description templateCategory promotions budget limits');
    
    res.json({
      success: true,
      data: { templates }
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch templates'
    });
  }
};

// Helper function to validate admin limits
async function validateAdminLimits(promotions, tenancyId) {
  // Implement your business rules here
  // For example: max discount percentage, max budget, etc.
  
  for (const promotion of promotions) {
    if (promotion.overrides && promotion.overrides.value > 50) {
      return {
        valid: false,
        message: 'Discount value cannot exceed 50% for tenant campaigns'
      };
    }
  }
  
  return { valid: true };
}

module.exports = {
  getTenantCampaigns,
  createTenantCampaign,
  updateTenantCampaign,
  deleteTenantCampaign,
  getTenantCampaignAnalytics,
  createFromTemplate,
  getAvailableTemplates
};