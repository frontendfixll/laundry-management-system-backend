const express = require('express');
const router = express.Router();
const platformSupportController = require('../../controllers/support/platformSupportController');
const { requireSupport, protect } = require('../../middlewares/auth');

// Middleware to ensure only Platform Support role can access these routes
const requirePlatformSupport = requireSupport;

// ==================== SUPPORT DASHBOARD STATS ====================

// @route   GET /api/support/stats
// @desc    Get support dashboard statistics
// @access  Private (Platform Support)
router.get(['/stats', '/dashboard/metrics'], requirePlatformSupport, async (req, res) => {
  try {
    const TenantTicket = require('../../models/TenantTicket'); // Use TenantTicket model for consistency
    const User = require('../../models/User');
    const Order = require('../../models/Order');

    // Get ticket statistics from TenantTicket model (platform support tickets created by tenant admins)
    const totalTickets = await TenantTicket.countDocuments();
    const openTickets = await TenantTicket.countDocuments({
      status: { $in: ['open', 'in_progress', 'new', 'in-review', 'waiting'] }
    });
    const resolvedTickets = await TenantTicket.countDocuments({ status: 'resolved' });
    const escalatedTickets = await TenantTicket.countDocuments({ status: 'escalated' });
    const todayTickets = await TenantTicket.countDocuments({
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
    });

    // Get user and tenancy statistics
    const Tenancy = require('../../models/Tenancy');
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({
      isActive: true,
      lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    });
    const activeTenants = await Tenancy.countDocuments({ status: 'active' });

    // Get order statistics
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({
      status: { $in: ['placed', 'assigned_to_branch', 'assigned_to_logistics_pickup'] }
    });

    // Get payment failures (orders with failed payment status)
    const paymentFailures = await Order.countDocuments({ paymentStatus: 'failed' });

    // Calculate SLA breaches (tickets past their SLA deadline)
    const slaBreaches = await TenantTicket.countDocuments({
      slaDeadline: { $lt: new Date() },
      status: { $nin: ['resolved', 'closed'] }
    });

    // Critical issues: high/critical priority tickets that are open
    const criticalIssues = await TenantTicket.countDocuments({
      systemPriority: { $in: ['high', 'critical'] },
      status: { $nin: ['resolved', 'closed'] }
    });

    // Get my assigned tickets (for current support user)
    const myAssignedTickets = await TenantTicket.countDocuments({
      $or: [
        { assignedTo: req.user._id },
        { assignedTeam: 'platform-support' }
      ],
      status: { $nin: ['resolved', 'closed'] }
    });

    // Real avg response time: first platform message - createdAt (hours)
    const responseTimeAgg = await TenantTicket.aggregate([
      {
        $match: {
          status: 'resolved',
          'messages.0': { $exists: true },
          'resolution.resolvedAt': { $exists: true, $ne: null }
        }
      },
      {
        $project: {
          createdAt: 1,
          firstResponseAt: {
            $min: {
              $map: {
                input: {
                  $filter: {
                    input: '$messages',
                    as: 'm',
                    cond: { $in: ['$$m.senderRole', ['platform_support', 'super_admin']] }
                  }
                },
                as: 'msg',
                in: '$$msg.createdAt'
              }
            }
          }
        }
      },
      {
        $match: { firstResponseAt: { $exists: true, $ne: null } }
      },
      {
        $project: {
          hours: { $divide: [{ $subtract: ['$firstResponseAt', '$createdAt'] }, 1000 * 60 * 60] }
        }
      },
      { $group: { _id: null, avg: { $avg: '$hours' } } }
    ]);
    const avgResponseTimeHours = responseTimeAgg[0]?.avg != null ? Math.round(responseTimeAgg[0].avg * 10) / 10 : null;

    // Real avg resolution time: resolvedAt - createdAt
    const resolutionTimeAgg = await TenantTicket.aggregate([
      {
        $match: {
          status: 'resolved',
          'resolution.resolvedAt': { $exists: true, $ne: null }
        }
      },
      {
        $project: {
          hours: {
            $divide: [
              { $subtract: ['$resolution.resolvedAt', '$createdAt'] },
              1000 * 60 * 60
            ]
          }
        }
      },
      { $group: { _id: null, avg: { $avg: '$hours' } } }
    ]);
    const avgResolutionTimeHours = resolutionTimeAgg[0]?.avg != null ? Math.round(resolutionTimeAgg[0].avg * 10) / 10 : null;

    const stats = {
      totalTickets,
      openTickets,
      resolvedTickets,
      avgResponseTime: avgResponseTimeHours,
      avgResolutionTime: avgResolutionTimeHours,
      slaBreaches,
      escalatedTickets,
      todayTickets,
      myAssignedTickets,
      totalUsers,
      activeUsers,
      activeTenants,
      totalOrders,
      pendingOrders,
      paymentFailures,
      criticalIssues,
      systemAlerts: 0
    };

    console.log('📊 Support stats calculated:', stats);

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching support stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch support statistics'
    });
  }
});

// ==================== TICKET MANAGEMENT ROUTES ====================

// @route   GET /api/support/tickets
// @desc    Get support tickets
// @access  Private (Platform Support)
router.get('/tickets', requirePlatformSupport, async (req, res) => {
  try {
    const { limit = 50, status, priority, search, page = 1 } = req.query;

    // Import TenantTicket model for platform support tickets (created by tenant admins)
    const TenantTicket = require('../../models/TenantTicket');

    // Build query for tenant admin tickets
    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    if (priority && priority !== 'all') {
      query.systemPriority = priority;
    }
    if (search) {
      query.$or = [
        { subject: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { ticketNumber: { $regex: search, $options: 'i' } },
        { tenantName: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get tenant admin tickets (these are platform support tickets)
    const tickets = await TenantTicket.find(query)
      .populate('createdBy', 'name email role')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await TenantTicket.countDocuments(query);

    // Transform to match expected frontend format
    const transformedTickets = tickets.map(ticket => ({
      id: ticket._id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.subject,
      description: ticket.description,
      user: {
        name: ticket.createdBy?.name || 'Unknown',
        email: ticket.createdBy?.email || 'Unknown',
        role: ticket.createdBy?.role || 'tenant_admin'
      },
      priority: ticket.systemPriority,
      status: ticket.status,
      category: ticket.category,
      source: 'tenant-admin',
      slaTimer: ticket.slaDeadline,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      tenantId: ticket.tenantId,
      tenantName: ticket.tenantName,
      businessImpact: ticket.businessImpact,
      assignedTo: ticket.assignedTo?.name || null,
      assignedTeam: ticket.assignedTeam || null
    }));

    res.json({
      success: true,
      data: transformedTickets,
      pagination: {
        total,
        limit: parseInt(limit),
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching platform support tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch platform support tickets'
    });
  }
});

// ==================== TICKET ACTION ROUTES ====================

// @route   POST /api/support/tickets/:id/resolve
// @desc    Resolve support ticket
// @access  Private (Platform Support)
router.post('/tickets/:id/resolve', requirePlatformSupport, platformSupportController.resolveTicket);

// @route   POST /api/support/tickets/:id/escalate
// @desc    Escalate support ticket
// @access  Private (Platform Support)
router.post('/tickets/:id/escalate', requirePlatformSupport, platformSupportController.escalateTicket);

// @route   PUT /api/support/tickets/:id/status
// @desc    Update ticket status
// @access  Private (Platform Support)
router.put('/tickets/:id/status', requirePlatformSupport, platformSupportController.updateTicketStatus);

// @route   POST /api/support/tickets/:id/assign
// @desc    Assign ticket to support agent
// @access  Private (Platform Support)
router.post('/tickets/:id/assign', requirePlatformSupport, platformSupportController.assignTicket);

// ==================== ORDER INVESTIGATION ROUTES ====================

// @route   GET /api/support/orders
// @desc    Search orders with advanced filters
// @access  Private (Platform Support)
router.get('/orders', requirePlatformSupport, platformSupportController.searchOrders);

// @route   GET /api/support/orders/stuck
// @desc    Get stuck orders (orders that haven't progressed)
// @access  Private (Platform Support)
router.get('/orders/stuck', requirePlatformSupport, platformSupportController.getStuckOrders);

// @route   GET /api/support/orders/:orderId/timeline
// @desc    Get order timeline and history
// @access  Private (Platform Support)
router.get('/orders/:orderId/timeline', requirePlatformSupport, platformSupportController.getOrderTimeline);

// ==================== PAYMENT SUPPORT ROUTES ====================

// @route   GET /api/support/payments
// @desc    Get payment issues and failures
// @access  Private (Platform Support)
router.get('/payments', requirePlatformSupport, platformSupportController.getPaymentIssues);

// @route   GET /api/support/payments/transactions/:transactionId
// @desc    Lookup specific transaction
// @access  Private (Platform Support)
router.get('/payments/transactions/:transactionId', requirePlatformSupport, platformSupportController.lookupTransaction);

// ==================== PAYMENT SUPPORT - ADVANCED ROUTES ====================

// @route   GET /api/support/payments/refunds
// @desc    Get refund requests
// @access  Private (Platform Support)
router.get('/payments/refunds', requirePlatformSupport, platformSupportController.getRefundRequests);

// @route   POST /api/support/payments/refunds/:id/approve
// @desc    Approve refund request
// @access  Private (Platform Support)
router.post('/payments/refunds/:id/approve', requirePlatformSupport, (req, res, next) => {
  req.body.action = 'approve';
  platformSupportController.processRefundRequest(req, res, next);
});

// @route   POST /api/support/payments/refunds/:id/reject
// @desc    Reject refund request
// @access  Private (Platform Support)
router.post('/payments/refunds/:id/reject', requirePlatformSupport, (req, res, next) => {
  req.body.action = 'reject';
  platformSupportController.processRefundRequest(req, res, next);
});

// @route   POST /api/support/payments/refunds/:id/process
// @desc    Process refund request
// @access  Private (Platform Support)
router.post('/payments/refunds/:id/process', requirePlatformSupport, (req, res, next) => {
  req.body.action = 'process';
  platformSupportController.processRefundRequest(req, res, next);
});

// @route   GET /api/support/payments/gateway-logs
// @desc    Get payment gateway logs
// @access  Private (Platform Support)
router.get('/payments/gateway-logs', requirePlatformSupport, platformSupportController.getPaymentGatewayLogs);

// @route   POST /api/support/payments/transactions/:id/retry
// @desc    Retry failed transaction
// @access  Private (Platform Support)
router.post('/payments/transactions/:id/retry', requirePlatformSupport, platformSupportController.retryFailedTransaction);

// @route   POST /api/support/payments/transactions/:id/cancel
// @desc    Cancel pending transaction
// @access  Private (Platform Support)
router.post('/payments/transactions/:id/cancel', requirePlatformSupport, (req, res, next) => {
  req.body.action = 'cancel';
  platformSupportController.retryFailedTransaction(req, res, next);
});

// @route   POST /api/support/payments/transactions/:id/investigate
// @desc    Mark transaction for investigation
// @access  Private (Platform Support)
router.post('/payments/transactions/:id/investigate', requirePlatformSupport, (req, res, next) => {
  req.body.action = 'investigate';
  platformSupportController.retryFailedTransaction(req, res, next);
});

// @route   GET /api/support/payments/transactions/search
// @desc    Advanced transaction search
// @access  Private (Platform Support)
router.get('/payments/transactions/search', requirePlatformSupport, platformSupportController.getPaymentIssues);

// @route   GET /api/support/payments/refunds/stats
// @desc    Get refund statistics
// @access  Private (Platform Support)
router.get('/payments/refunds/stats', requirePlatformSupport, platformSupportController.getRefundRequests);

// @route   GET /api/support/payments/gateway-logs/:id/details
// @desc    Get detailed gateway log
// @access  Private (Platform Support)
router.get('/payments/gateway-logs/:id/details', requirePlatformSupport, platformSupportController.lookupTransaction);

// @route   POST /api/support/payments/gateway-logs/:id/retry
// @desc    Retry gateway transaction
// @access  Private (Platform Support)
router.post('/payments/gateway-logs/:id/retry', requirePlatformSupport, platformSupportController.retryFailedTransaction);

// @route   GET /api/support/payments/gateway-logs/stats
// @desc    Get gateway statistics
// @access  Private (Platform Support)
router.get('/payments/gateway-logs/stats', requirePlatformSupport, platformSupportController.getPaymentGatewayLogs);

// ==================== USER ASSISTANCE ROUTES ====================

// @route   GET /api/support/users
// @desc    Search users for assistance
// @access  Private (Platform Support)
router.get('/users', requirePlatformSupport, platformSupportController.searchUsers);

// @route   POST /api/support/users/:userId/resend-otp
// @desc    Resend OTP for user
// @access  Private (Platform Support)
router.post('/users/:userId/resend-otp', requirePlatformSupport, platformSupportController.resendUserOTP);

// @route   POST /api/support/users/:userId/unlock
// @desc    Unlock user account
// @access  Private (Platform Support)
router.post('/users/:userId/unlock', requirePlatformSupport, platformSupportController.unlockUserAccount);

// @route   POST /api/support/users/:userId/reset-password
// @desc    Reset user password
// @access  Private (Platform Support)
router.post('/users/:userId/reset-password', requirePlatformSupport, platformSupportController.resetUserPassword);

// ==================== USER ASSISTANCE - ACCOUNT RECOVERY ROUTES ====================

// @route   GET /api/support/users/recovery-requests
// @desc    Get account recovery requests
// @access  Private (Platform Support)
router.get('/users/recovery-requests', requirePlatformSupport, platformSupportController.getRecoveryRequests);

// @route   POST /api/support/users/recovery-requests/:id/approve
// @desc    Approve recovery request
// @access  Private (Platform Support)
router.post('/users/recovery-requests/:id/approve', requirePlatformSupport, platformSupportController.approveRecoveryRequest);

// @route   POST /api/support/users/recovery-requests/:id/reject
// @desc    Reject recovery request
// @access  Private (Platform Support)
router.post('/users/recovery-requests/:id/reject', requirePlatformSupport, platformSupportController.rejectRecoveryRequest);

// @route   POST /api/support/users/recovery-requests/:id/resend
// @desc    Resend recovery request
// @access  Private (Platform Support)
router.post('/users/recovery-requests/:id/resend', requirePlatformSupport, platformSupportController.resendRecoveryRequest);

// ==================== USER ASSISTANCE - PASSWORD RESET MANAGEMENT ROUTES ====================

// @route   GET /api/support/users/password-reset-requests
// @desc    Get password reset requests
// @access  Private (Platform Support)
router.get('/users/password-reset-requests', requirePlatformSupport, platformSupportController.getPasswordResetRequests);

// @route   POST /api/support/users/password-reset-requests/:id/generate
// @desc    Generate new password reset
// @access  Private (Platform Support)
router.post('/users/password-reset-requests/:id/generate', requirePlatformSupport, platformSupportController.generatePasswordReset);

// @route   POST /api/support/users/password-reset-requests/:id/resend
// @desc    Resend password reset
// @access  Private (Platform Support)
router.post('/users/password-reset-requests/:id/resend', requirePlatformSupport, platformSupportController.resendPasswordReset);

// @route   POST /api/support/users/password-reset-requests/:id/expire
// @desc    Expire password reset
// @access  Private (Platform Support)
router.post('/users/password-reset-requests/:id/expire', requirePlatformSupport, platformSupportController.expirePasswordReset);

// ==================== USER ASSISTANCE - ACCOUNT UNLOCK MANAGEMENT ROUTES ====================

// @route   GET /api/support/users/locked-accounts
// @desc    Get locked accounts
// @access  Private (Platform Support)
router.get('/users/locked-accounts', requirePlatformSupport, platformSupportController.getLockedAccounts);

// @route   POST /api/support/users/locked-accounts/:id/unlock
// @desc    Unlock account action
// @access  Private (Platform Support)
router.post('/users/locked-accounts/:id/unlock', requirePlatformSupport, platformSupportController.unlockAccountAction);

// @route   POST /api/support/users/locked-accounts/:id/review
// @desc    Review account action
// @access  Private (Platform Support)
router.post('/users/locked-accounts/:id/review', requirePlatformSupport, platformSupportController.reviewAccountAction);

// @route   POST /api/support/users/locked-accounts/:id/ban
// @desc    Ban account action
// @access  Private (Platform Support)
router.post('/users/locked-accounts/:id/ban', requirePlatformSupport, platformSupportController.banAccountAction);

// @route   POST /api/support/users/locked-accounts/:id/approve-request
// @desc    Approve unlock request
// @access  Private (Platform Support)
router.post('/users/locked-accounts/:id/approve-request', requirePlatformSupport, platformSupportController.approveUnlockRequest);

// ==================== LIVE CHAT SUPPORT ROUTES ====================

// @route   GET /api/support/chat/active
// @desc    Get active chat sessions
// @access  Private (Platform Support)
router.get('/chat/active', requirePlatformSupport, platformSupportController.getActiveChats);

// @route   GET /api/support/chat/history
// @desc    Get chat sessions list (with period, status filters)
// @access  Private (Platform Support)
router.get('/chat/history', requirePlatformSupport, platformSupportController.getChatHistoryList);

// @route   GET /api/support/chat/:sessionId/history
// @desc    Get chat history for a session
// @access  Private (Platform Support)
router.get('/chat/:sessionId/history', requirePlatformSupport, platformSupportController.getChatHistory);

// @route   POST /api/support/chat/:sessionId/message
// @desc    Send message in chat
// @access  Private (Platform Support)
router.post('/chat/:sessionId/message', requirePlatformSupport, platformSupportController.sendChatMessage);

// ==================== TENANT CHAT ENDPOINTS ====================

// @route   POST /api/support/chat/create
// @desc    Create new chat session (for tenant admins)
// @access  Private (Tenant Admin)
router.post('/chat/create', protect, platformSupportController.createChatSession);

// @route   GET /api/support/chat/my-sessions
// @desc    Get my chat sessions (for tenant admins)
// @access  Private (Tenant Admin)
router.get('/chat/my-sessions', protect, platformSupportController.getMyChatSessions);

// @route   POST /api/support/chat/send-message
// @desc    Send message from tenant admin
// @access  Private (Tenant Admin)
router.post('/chat/send-message', protect, platformSupportController.sendTenantMessage);

// ==================== SAFE IMPERSONATION ROUTES ====================

// @route   POST /api/support/impersonation
// @desc    Create impersonation session
// @access  Private (Platform Support)
router.post('/impersonation', requirePlatformSupport, platformSupportController.createImpersonationSession);

// @route   POST /api/support/impersonation/end
// @desc    End impersonation session
// @access  Private (Platform Support)
router.post('/impersonation/end', requirePlatformSupport, platformSupportController.endImpersonationSession);

// @route   GET /api/support/impersonation/active
// @desc    Get active impersonation sessions
// @access  Private (Platform Support)
router.get('/impersonation/active', requirePlatformSupport, platformSupportController.getActiveImpersonationSessions);

// ==================== SYSTEM MONITORING ROUTES ====================

// @route   GET /api/support/system/alerts
// @desc    Get system alerts
// @access  Private (Platform Support)
router.get('/system/alerts', requirePlatformSupport, platformSupportController.getSystemAlerts);

// @route   GET /api/support/system/health
// @desc    Get platform health status
// @access  Private (Platform Support)
router.get('/system/health', requirePlatformSupport, platformSupportController.getPlatformHealth);

// @route   GET /api/support/system/heatmap
// @desc    Get tenant issue heatmap
// @access  Private (Platform Support)
router.get('/system/heatmap', requirePlatformSupport, platformSupportController.getTenantHeatmap);

// ==================== SYSTEM MONITORING - ADVANCED ROUTES ====================

// @route   POST /api/support/system/alerts/:id/acknowledge
// @desc    Acknowledge system alert
// @access  Private (Platform Support)
router.post('/system/alerts/:id/acknowledge', requirePlatformSupport, platformSupportController.acknowledgeSystemAlert);

// @route   POST /api/support/system/alerts/:id/resolve
// @desc    Resolve system alert
// @access  Private (Platform Support)
router.post('/system/alerts/:id/resolve', requirePlatformSupport, platformSupportController.resolveSystemAlert);

// @route   POST /api/support/system/alerts/:id/escalate
// @desc    Escalate system alert
// @access  Private (Platform Support)
router.post('/system/alerts/:id/escalate', requirePlatformSupport, (req, res, next) => {
  req.body.action = 'escalate';
  platformSupportController.acknowledgeSystemAlert(req, res, next);
});

// @route   GET /api/support/system/alerts/stats
// @desc    Get system alert statistics
// @access  Private (Platform Support)
router.get('/system/alerts/stats', requirePlatformSupport, platformSupportController.getSystemAlerts);

// @route   GET /api/support/system/health/detailed
// @desc    Get detailed system health metrics
// @access  Private (Platform Support)
router.get('/system/health/detailed', requirePlatformSupport, platformSupportController.getDetailedSystemHealth);

// @route   GET /api/support/system/health/metrics
// @desc    Get system health metrics
// @access  Private (Platform Support)
router.get('/system/health/metrics', requirePlatformSupport, platformSupportController.getDetailedSystemHealth);

// @route   POST /api/support/system/health/refresh
// @desc    Refresh system health data
// @access  Private (Platform Support)
router.post('/system/health/refresh', requirePlatformSupport, platformSupportController.getPlatformHealth);

// @route   GET /api/support/system/health/history
// @desc    Get system health history
// @access  Private (Platform Support)
router.get('/system/health/history', requirePlatformSupport, platformSupportController.getDetailedSystemHealth);

// @route   GET /api/support/system/heatmap/detailed
// @desc    Get detailed tenant heatmap
// @access  Private (Platform Support)
router.get('/system/heatmap/detailed', requirePlatformSupport, platformSupportController.getTenantHeatmap);

// @route   GET /api/support/system/heatmap/tenant/:id
// @desc    Get specific tenant heatmap data
// @access  Private (Platform Support)
router.get('/system/heatmap/tenant/:id', requirePlatformSupport, platformSupportController.getTenantHeatmap);

// @route   POST /api/support/system/heatmap/refresh
// @desc    Refresh tenant heatmap data
// @access  Private (Platform Support)
router.post('/system/heatmap/refresh', requirePlatformSupport, platformSupportController.getTenantHeatmap);

// @route   GET /api/support/system/heatmap/export
// @desc    Export tenant heatmap data
// @access  Private (Platform Support)
router.get('/system/heatmap/export', requirePlatformSupport, platformSupportController.getTenantHeatmap);

// ==================== ESCALATION MATRIX ROUTES ====================

// @route   GET /api/support/escalation
// @desc    Get escalation matrix
// @access  Private (Platform Support)
router.get('/escalation', requirePlatformSupport, platformSupportController.getEscalationMatrix);

// ==================== SUPPORT AUDIT LOGS ROUTES ====================

// @route   GET /api/support/audit
// @desc    Get support audit logs
// @access  Private (Platform Support)
router.get('/audit', requirePlatformSupport, platformSupportController.getSupportAuditLogs);

// @route   GET /api/support/debug/chat-sessions
// @desc    Debug endpoint to check all chat sessions
// @access  Private (Platform Support)
router.get('/debug/chat-sessions', requirePlatformSupport, platformSupportController.debugChatSessions);

// ==================== FINANCIAL AUDIT ROUTES ====================

// @route   GET /api/support/audit/financial/refunds
// @desc    Get refund audit data for financial oversight
// @access  Private (Platform Support)
router.get('/audit/financial/refunds', requirePlatformSupport, platformSupportController.getRefundAuditData);

// @route   GET /api/support/audit/reports/financial
// @desc    Get financial audit reports
// @access  Private (Platform Support)
router.get('/audit/reports/financial', requirePlatformSupport, platformSupportController.getFinancialAuditReports);

// ==================== LEGACY COMPATIBILITY ROUTES ====================

// Keep some legacy routes for backward compatibility
router.get('/tenant-heatmap', requirePlatformSupport, platformSupportController.getTenantHeatmap);
router.get('/payment-issues', requirePlatformSupport, platformSupportController.getPaymentIssues);
router.get('/system-alerts', requirePlatformSupport, platformSupportController.getSystemAlerts);

module.exports = router;