const TenantTicket = require('../models/TenantTicket');
const Tenancy = require('../models/Tenancy');
const User = require('../models/User');
const Order = require('../models/Order');

// Get subcategories for each category
const getSubcategories = (category) => {
  const subcategories = {
    order_operations: [
      'Order stuck in workflow',
      'Status not updating',
      'Staff workflow issue',
      'Delivery problem',
      'Quality issue'
    ],
    payment_settlement: [
      'Payment not received',
      'Payout delay',
      'Commission mismatch',
      'Settlement discrepancy',
      'Gateway issue'
    ],
    refunds: [
      'Refund approval needed',
      'Refund processing failed',
      'Partial refund request',
      'Refund amount dispute',
      'Customer refund issue'
    ],
    account_subscription: [
      'Plan upgrade request',
      'Plan downgrade request',
      'Billing issue',
      'Invoice request',
      'Subscription renewal'
    ],
    technical_bug: [
      'Dashboard not loading',
      'Feature not working',
      'API error',
      'Mobile app issue',
      'Integration problem'
    ],
    how_to_configuration: [
      'Service setup help',
      'Pricing configuration',
      'Coupon setup',
      'Staff management',
      'Branch configuration'
    ],
    security_compliance: [
      'Suspicious activity',
      'Access issue',
      'Data concern',
      'Privacy question',
      'Compliance requirement'
    ]
  };
  
  return subcategories[category] || [];
};

// Create new tenant ticket
const createTenantTicket = async (req, res) => {
  try {
    const {
      category,
      subcategory,
      subject,
      description,
      perceivedPriority,
      linkedOrderId,
      linkedPaymentId,
      linkedSettlementPeriod,
      refundAmount,
      attachments
    } = req.body;

    // Get tenant context from authenticated user
    const user = await User.findById(req.user._id).populate('tenancy');
    if (!user || !user.tenancy) {
      return res.status(400).json({
        success: false,
        message: 'User must be associated with a tenancy'
      });
    }

    const tenancy = user.tenancy;

    // Calculate business impact based on category and linked entities
    let businessImpact = 'medium';
    let revenueImpact = 0;
    let affectedOrdersCount = 0;

    if (category === 'payment_settlement') {
      businessImpact = 'high';
      if (linkedSettlementPeriod) {
        // Estimate revenue impact based on settlement period
        revenueImpact = 5000; // Placeholder - should calculate from actual data
      }
    } else if (category === 'technical_bug') {
      businessImpact = 'high';
      // Count affected orders if it's a system-wide issue
      affectedOrdersCount = await Order.countDocuments({
        tenancy: tenancy._id,
        status: { $in: ['placed', 'in_process'] }
      });
    } else if (category === 'refunds') {
      businessImpact = 'medium';
      revenueImpact = refundAmount || 0;
    }

    // Map legacy role to valid enum value
    let mappedRole = user.role;
    if (user.role === 'admin') {
      mappedRole = 'tenant_admin'; // Map legacy 'admin' role to 'tenant_admin'
    }

    // Create ticket
    const ticketData = {
      // Tenant context (auto-filled)
      tenantId: tenancy._id,
      tenantName: tenancy.name,
      tenantPlan: tenancy.subscriptionPlan || 'basic',
      tenantStatus: tenancy.status || 'active',
      
      // Creator information
      createdBy: user._id,
      creatorRole: mappedRole, // Use mapped role
      creatorEmail: user.email,
      creatorPhone: user.phone,
      
      // Ticket content
      category,
      subcategory,
      subject,
      description,
      perceivedPriority: perceivedPriority || 'medium',
      
      // Business impact
      businessImpact,
      revenueImpact,
      affectedOrdersCount,
      
      // Linked entities
      linkedOrderId: linkedOrderId || undefined,
      linkedPaymentId: linkedPaymentId || undefined,
      linkedSettlementPeriod: linkedSettlementPeriod || undefined,
      refundAmount: refundAmount || undefined,
      
      // Attachments
      attachments: attachments || []
    };

    const ticket = new TenantTicket(ticketData);
    
    // Generate ticket number manually
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    
    // Find the last ticket number for today
    const lastTicket = await TenantTicket.findOne({
      ticketNumber: new RegExp(`^TT-${dateStr}-`)
    }).sort({ ticketNumber: -1 });
    
    let sequence = 1;
    if (lastTicket) {
      const lastSequence = parseInt(lastTicket.ticketNumber.split('-')[2]);
      if (!isNaN(lastSequence)) {
        sequence = lastSequence + 1;
      }
    }
    
    ticket.ticketNumber = `TT-${dateStr}-${sequence.toString().padStart(4, '0')}`;
    
    // Calculate system priority and SLA deadlines
    ticket.systemPriority = ticket.calculateSystemPriority();
    ticket.calculateSLADeadlines();
    
    // Add initial status history
    ticket.statusHistory.push({
      status: 'new',
      changedBy: user._id,
      changedByModel: 'User',
      reason: 'Ticket created'
    });

    await ticket.save();

    // Populate the created ticket for response
    await ticket.populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'tenantId', select: 'name slug' }
    ]);

    res.status(201).json({
      success: true,
      data: ticket,
      message: 'Support ticket created successfully'
    });

  } catch (error) {
    console.error('Error creating tenant ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create support ticket'
    });
  }
};

// Get tenant tickets (tenant-scoped)
const getTenantTickets = async (req, res) => {
  try {
    const { status, priority, category, limit = 20, page = 1, search } = req.query;
    
    // Get user's tenancy
    const user = await User.findById(req.user._id).populate('tenancy');
    if (!user || !user.tenancy) {
      return res.status(400).json({
        success: false,
        message: 'User must be associated with a tenancy'
      });
    }

    // Build query - scoped to user's tenancy
    const query = { tenantId: user.tenancy._id };
    
    if (status) query.status = status;
    if (priority) query.systemPriority = priority;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { ticketNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const tickets = await TenantTicket.find(query)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('linkedOrderId', 'orderNumber status')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await TenantTicket.countDocuments(query);

    res.json({
      success: true,
      data: tickets,
      pagination: {
        total,
        limit: parseInt(limit),
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    console.error('Error fetching tenant tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tickets'
    });
  }
};

// Get single tenant ticket
const getTenantTicket = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user's tenancy
    const user = await User.findById(req.user._id).populate('tenancy');
    if (!user || !user.tenancy) {
      return res.status(400).json({
        success: false,
        message: 'User must be associated with a tenancy'
      });
    }

    const ticket = await TenantTicket.findOne({
      _id: id,
      tenantId: user.tenancy._id // Ensure tenant can only see their own tickets
    })
    .populate('createdBy', 'name email phone')
    .populate('assignedTo', 'name email')
    .populate('resolution.resolvedBy', 'name email')
    .populate('escalation.escalatedTo', 'name email')
    .populate('linkedOrderId', 'orderNumber status customer')
    .populate('messages.sender', 'name email')
    .populate('statusHistory.changedBy', 'name email');

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    res.json({
      success: true,
      data: ticket
    });

  } catch (error) {
    console.error('Error fetching tenant ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket'
    });
  }
};

// Add message to ticket
const addTicketMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, attachments, isInternal } = req.body;
    
    // Get user's tenancy
    const user = await User.findById(req.user._id).populate('tenancy');
    if (!user || !user.tenancy) {
      return res.status(400).json({
        success: false,
        message: 'User must be associated with a tenancy'
      });
    }

    const ticket = await TenantTicket.findOne({
      _id: id,
      tenantId: user.tenancy._id
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Map legacy role to valid enum value
    let mappedRole = user.role;
    if (user.role === 'admin') {
      mappedRole = 'tenant_admin'; // Map legacy 'admin' role to 'tenant_admin'
    }

    // Tenant users cannot add internal messages
    const messageData = {
      sender: user._id,
      senderModel: 'User',
      senderRole: mappedRole, // Use mapped role
      message,
      attachments: attachments || [],
      isInternal: false // Tenant messages are never internal
    };

    await ticket.addMessage(messageData);

    // Populate the updated ticket
    await ticket.populate('messages.sender', 'name email');

    res.json({
      success: true,
      data: ticket,
      message: 'Message added successfully'
    });

  } catch (error) {
    console.error('Error adding ticket message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add message'
    });
  }
};

// Reopen resolved ticket
const reopenTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    // Get user's tenancy
    const user = await User.findById(req.user._id).populate('tenancy');
    if (!user || !user.tenancy) {
      return res.status(400).json({
        success: false,
        message: 'User must be associated with a tenancy'
      });
    }

    const ticket = await TenantTicket.findOne({
      _id: id,
      tenantId: user.tenancy._id,
      status: 'resolved'
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Resolved ticket not found'
      });
    }

    // Reopen ticket
    ticket.status = 'in_progress';
    ticket.autoClosePrevented = true;
    ticket.autoCloseAt = undefined;
    
    ticket.statusHistory.push({
      status: 'in_progress',
      changedBy: user._id,
      changedByModel: 'User',
      reason: reason || 'Ticket reopened by tenant'
    });

    await ticket.save();

    res.json({
      success: true,
      data: ticket,
      message: 'Ticket reopened successfully'
    });

  } catch (error) {
    console.error('Error reopening ticket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reopen ticket'
    });
  }
};

// Accept ticket resolution
const acceptResolution = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user's tenancy
    const user = await User.findById(req.user._id).populate('tenancy');
    if (!user || !user.tenancy) {
      return res.status(400).json({
        success: false,
        message: 'User must be associated with a tenancy'
      });
    }

    const ticket = await TenantTicket.findOne({
      _id: id,
      tenantId: user.tenancy._id,
      status: 'resolved'
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Resolved ticket not found'
      });
    }

    // Accept resolution
    ticket.resolution.tenantAccepted = true;
    ticket.resolution.tenantAcceptedAt = new Date();
    ticket.status = 'closed';
    
    ticket.statusHistory.push({
      status: 'closed',
      changedBy: user._id,
      changedByModel: 'User',
      reason: 'Resolution accepted by tenant'
    });

    await ticket.save();

    res.json({
      success: true,
      data: ticket,
      message: 'Resolution accepted successfully'
    });

  } catch (error) {
    console.error('Error accepting resolution:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept resolution'
    });
  }
};

// Get ticket statistics for tenant dashboard
const getTenantTicketStats = async (req, res) => {
  try {
    // Get user's tenancy
    const user = await User.findById(req.user._id).populate('tenancy');
    if (!user || !user.tenancy) {
      return res.status(400).json({
        success: false,
        message: 'User must be associated with a tenancy'
      });
    }

    const tenantId = user.tenancy._id;

    // Get ticket statistics
    const totalTickets = await TenantTicket.countDocuments({ tenantId });
    const openTickets = await TenantTicket.countDocuments({ 
      tenantId, 
      status: { $in: ['new', 'acknowledged', 'in_progress'] } 
    });
    const resolvedTickets = await TenantTicket.countDocuments({ 
      tenantId, 
      status: 'resolved' 
    });
    const closedTickets = await TenantTicket.countDocuments({ 
      tenantId, 
      status: 'closed' 
    });

    // Get recent tickets
    const recentTickets = await TenantTicket.find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('ticketNumber subject status systemPriority createdAt');

    // Get SLA breaches
    const slaBreaches = await TenantTicket.countDocuments({
      tenantId,
      slaBreached: true
    });

    const stats = {
      totalTickets,
      openTickets,
      resolvedTickets,
      closedTickets,
      slaBreaches,
      recentTickets
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching tenant ticket stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ticket statistics'
    });
  }
};

// Get subcategories for a category
const getSubcategoriesForCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const subcategories = getSubcategories(category);
    
    res.json({
      success: true,
      data: subcategories
    });
  } catch (error) {
    console.error('Error fetching subcategories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subcategories'
    });
  }
};

module.exports = {
  createTenantTicket,
  getTenantTickets,
  getTenantTicket,
  addTicketMessage,
  reopenTicket,
  acceptResolution,
  getTenantTicketStats,
  getSubcategoriesForCategory
};