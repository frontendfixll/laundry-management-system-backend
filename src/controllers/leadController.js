const Lead = require('../models/Lead');
const Notification = require('../models/Notification');
const SuperAdmin = require('../models/SuperAdmin');
const { NOTIFICATION_TYPES } = require('../config/constants');

/**
 * Create a new lead (public endpoint - no auth required)
 * POST /api/public/leads
 */
const createLead = async (req, res) => {
  try {
    const { name, email, phone, businessName, businessType, message } = req.body;

    // Create lead with status 'new'
    const lead = await Lead.create({
      name,
      email,
      phone,
      businessName,
      businessType,
      message
    });

    // Create notifications for all active superadmins
    await notifyNewLead(lead);

    res.status(201).json({
      success: true,
      message: 'Thank you for your interest! Our team will contact you soon.',
      data: { leadId: lead._id }
    });
  } catch (error) {
    console.error('Create lead error:', error);
    
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
      .populate('convertedToTenancy', 'name slug')
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
    const { status, notes, convertedToTenancy } = req.body;
    
    const updateData = {};
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (convertedToTenancy) updateData.convertedToTenancy = convertedToTenancy;

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

    const statusCounts = stats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        total,
        thisMonth,
        byStatus: {
          new: statusCounts.new || 0,
          contacted: statusCounts.contacted || 0,
          converted: statusCounts.converted || 0,
          closed: statusCounts.closed || 0
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

/**
 * Helper function to notify all active superadmins about new lead
 */
async function notifyNewLead(lead) {
  try {
    const superadmins = await SuperAdmin.find({ isActive: true }).select('_id');
    
    const notifications = superadmins.map(admin => ({
      recipient: admin._id,
      type: NOTIFICATION_TYPES.NEW_LEAD,
      title: 'New Lead Received',
      message: `${lead.businessName} has requested a demo`,
      data: {
        additionalData: { leadId: lead._id }
      },
      channels: { inApp: true, email: false }
    }));

    await Promise.all(
      notifications.map(notif => Notification.createNotification(notif))
    );
  } catch (error) {
    console.error('Failed to create lead notifications:', error);
    // Don't throw - lead creation should succeed even if notifications fail
  }
}

module.exports = {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  getLeadStats
};
