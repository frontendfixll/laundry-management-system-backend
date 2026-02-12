const asyncHandler = require('express-async-handler');
const User = require('../../models/User');
const Order = require('../../models/Order');
const Ticket = require('../../models/Ticket');
const Tenancy = require('../../models/Tenancy');
const Transaction = require('../../models/Transaction'); // Fixed: Use Transaction instead of Payment
const AuditLog = require('../../models/AuditLog');
const ChatSession = require('../../models/ChatSession');
const jwt = require('jsonwebtoken');

/**
 * Platform Support Controller
 * Implements all features defined in supportd.md
 */

// ==================== ORDER INVESTIGATION ====================

// @desc    Search orders with advanced filters
// @route   GET /api/support/orders
// @access  Private (Platform Support)
const searchOrders = asyncHandler(async (req, res) => {
  try {
    const { 
      search, 
      status, 
      tenantId, 
      customerId, 
      dateFrom, 
      dateTo, 
      paymentStatus,
      page = 1, 
      limit = 20 
    } = req.query;

    let query = {};

    // Search by order ID, customer name, or phone
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'customer.phone': { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by tenant
    if (tenantId) {
      query.tenancy = tenantId;
    }

    // Filter by customer
    if (customerId) {
      query.customer = customerId;
    }

    // Filter by date range
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    // Filter by payment status
    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }

    const orders = await Order.find(query)
      .populate('tenancy', 'name slug')
      .populate('customer', 'name email phone')
      .populate('branch', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(query);

    // Log the search action
    await AuditLog.create({
      userId: req.user._id,
      action: 'ORDER_SEARCH',
      module: 'PLATFORM_SUPPORT',
      details: {
        searchParams: req.query,
        resultsCount: orders.length
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Order search error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search orders'
    });
  }
});

// @desc    Get order timeline and history
// @route   GET /api/support/orders/:orderId/timeline
// @access  Private (Platform Support)
const getOrderTimeline = asyncHandler(async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId)
      .populate('tenancy', 'name slug')
      .populate('customer', 'name email phone')
      .populate('branch', 'name address');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get order status history from audit logs
    const statusHistory = await AuditLog.find({
      'details.orderId': orderId,
      action: { $in: ['ORDER_STATUS_UPDATE', 'ORDER_CREATED', 'ORDER_ASSIGNED'] }
    }).sort({ createdAt: 1 });

    // Log the timeline access
    await AuditLog.create({
      userId: req.user._id,
      action: 'ORDER_TIMELINE_VIEW',
      module: 'PLATFORM_SUPPORT',
      details: {
        orderId,
        orderNumber: order.orderNumber
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      data: {
        order,
        timeline: statusHistory,
        investigation: {
          totalStatusChanges: statusHistory.length,
          currentStatus: order.status,
          paymentStatus: order.paymentStatus,
          lastUpdated: order.updatedAt,
          stuckDuration: order.status === 'placed' ? 
            Math.floor((Date.now() - new Date(order.createdAt)) / (1000 * 60 * 60)) : null
        }
      }
    });
  } catch (error) {
    console.error('Order timeline error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get order timeline'
    });
  }
});

// @desc    Get stuck orders (orders that haven't progressed)
// @route   GET /api/support/orders/stuck
// @access  Private (Platform Support)
const getStuckOrders = asyncHandler(async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    const stuckOrders = await Order.find({
      status: { $in: ['placed', 'assigned_to_branch', 'assigned_to_logistics_pickup'] },
      updatedAt: { $lt: cutoffTime }
    })
    .populate('tenancy', 'name')
    .populate('customer', 'name phone')
    .sort({ updatedAt: 1 });

    res.json({
      success: true,
      data: {
        stuckOrders,
        summary: {
          total: stuckOrders.length,
          byStatus: stuckOrders.reduce((acc, order) => {
            acc[order.status] = (acc[order.status] || 0) + 1;
            return acc;
          }, {}),
          oldestStuck: stuckOrders[0]?.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Stuck orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get stuck orders'
    });
  }
});

// ==================== PAYMENT SUPPORT ====================

// @desc    Get payment issues and failures
// @route   GET /api/support/payments
// @access  Private (Platform Support)
const getPaymentIssues = asyncHandler(async (req, res) => {
  try {
    const { status, dateFrom, dateTo, page = 1, limit = 20 } = req.query;

    let query = {
      paymentStatus: { $in: ['failed', 'pending', 'refund_requested'] }
    };

    if (status) {
      query.paymentStatus = status;
    }

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const paymentIssues = await Order.find(query)
      .populate('tenancy', 'name')
      .populate('customer', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(query);

    // Get payment statistics
    const stats = await Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$paymentStatus',
          count: { $sum: 1 },
          totalAmount: { $sum: '$pricing.total' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        paymentIssues,
        stats,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Payment issues error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment issues'
    });
  }
});

// @desc    Lookup specific transaction
// @route   GET /api/support/payments/transactions/:transactionId
// @access  Private (Platform Support)
const lookupTransaction = asyncHandler(async (req, res) => {
  try {
    const { transactionId } = req.params;

    // Find transaction by ID
    const transaction = await Transaction.findOne({
      $or: [
        { transactionId: transactionId },
        { externalTransactionId: transactionId }
      ]
    })
    .populate('customerId', 'name email phone')
    .populate('branchId', 'name location')
    .populate('orderId', 'orderNumber status');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Log the transaction lookup
    await AuditLog.create({
      userId: req.user._id,
      action: 'TRANSACTION_LOOKUP',
      module: 'PLATFORM_SUPPORT',
      details: {
        transactionId,
        transactionType: transaction.type,
        amount: transaction.amount
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      data: {
        transaction,
        investigation: {
          paymentMethod: transaction.paymentMethod,
          paymentGateway: transaction.paymentGateway,
          failureReason: transaction.failureReason,
          retryCount: transaction.retryCount
        }
      }
    });
  } catch (error) {
    console.error('Transaction lookup error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to lookup transaction'
    });
  }
});

// ==================== USER ASSISTANCE ====================

// @desc    Search users for assistance
// @route   GET /api/support/users
// @access  Private (Platform Support)
const searchUsers = asyncHandler(async (req, res) => {
  try {
    const { search, role, tenantId, isActive, page = 1, limit = 20 } = req.query;

    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) {
      query.role = role;
    }

    if (tenantId) {
      query.tenancy = tenantId;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const users = await User.find(query)
      .populate('tenancy', 'name')
      .select('-password -refreshToken') // Never expose sensitive data
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users: users.map(user => ({
          ...user.toObject(),
          // Mask sensitive information
          email: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
          phone: user.phone ? user.phone.replace(/(.{2})(.*)(.{2})/, '$1***$3') : null
        })),
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('User search error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search users'
    });
  }
});

// @desc    Resend OTP for user
// @route   POST /api/support/users/:userId/resend-otp
// @access  Private (Platform Support)
const resendUserOTP = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: 'USER_OTP_RESEND',
      module: 'PLATFORM_SUPPORT',
      details: {
        targetUserId: userId,
        targetUserEmail: user.email
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    // TODO: Send OTP via SMS/Email service

    res.json({
      success: true,
      message: 'OTP resent successfully',
      data: {
        otpSent: true,
        expiryTime: user.otpExpiry
      }
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend OTP'
    });
  }
});

// @desc    Unlock user account
// @route   POST /api/support/users/:userId/unlock
// @access  Private (Platform Support)
const unlockUserAccount = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Unlock account
    user.isActive = true;
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: 'USER_ACCOUNT_UNLOCK',
      module: 'PLATFORM_SUPPORT',
      details: {
        targetUserId: userId,
        targetUserEmail: user.email,
        reason
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Account unlocked successfully',
      data: {
        userId,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Unlock account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unlock account'
    });
  }
});

// @desc    Reset user password
// @route   POST /api/support/users/:userId/reset-password
// @access  Private (Platform Support)
const resetUserPassword = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8);
    user.password = tempPassword; // Will be hashed by pre-save middleware
    user.mustChangePassword = true;
    await user.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: 'USER_PASSWORD_RESET',
      module: 'PLATFORM_SUPPORT',
      details: {
        targetUserId: userId,
        targetUserEmail: user.email,
        reason
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    // TODO: Send temporary password via secure channel

    res.json({
      success: true,
      message: 'Password reset successfully',
      data: {
        temporaryPassword: tempPassword,
        mustChangePassword: true
      }
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

// ==================== LIVE CHAT SUPPORT ====================

// @desc    Get active chat sessions
// @route   GET /api/support/chat/active
// @access  Private (Platform Support)
const getActiveChats = asyncHandler(async (req, res) => {
  try {
    // Find active chat sessions - expanded status criteria
    const activeChats = await ChatSession.find({
      status: { $in: ['active', 'waiting', 'open', 'in_progress'] },
      lastActivity: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    })
    .populate('customerId', 'name email phone')
    .populate('assignedAgent', 'name email')
    .populate('tenantId', 'name slug')
    .sort({ lastActivity: -1 })
    .limit(50);

    console.log('🔍 Found chat sessions:', activeChats.length);
    console.log('📋 Chat sessions details:', activeChats.map(session => ({
      id: session._id,
      sessionId: session.sessionId,
      status: session.status,
      customerName: session.customerName,
      tenantName: session.tenantName,
      lastActivity: session.lastActivity,
      messagesCount: session.messages?.length || 0
    })));

    // Format for chat interface
    const formattedChats = activeChats.map(session => ({
      ticketId: session._id,
      ticketNumber: session.sessionId,
      customer: session.customerId || {
        name: session.customerName,
        email: session.customerEmail,
        phone: session.customerId?.phone
      },
      tenant: session.tenantId || {
        name: session.tenantName,
        slug: session.tenantId?.slug
      },
      lastMessage: session.messages.length > 0 ? {
        message: session.messages[session.messages.length - 1].message,
        timestamp: session.messages[session.messages.length - 1].createdAt,
        sender: session.messages[session.messages.length - 1].senderName,
        isFromSupport: session.messages[session.messages.length - 1].senderRole === 'platform_support'
      } : null,
      unreadCount: session.unreadCount?.support || 0,
      status: session.status,
      priority: session.priority || 'medium'
    }));

    console.log('✅ Formatted chats for frontend:', formattedChats.length);

    res.json({
      success: true,
      data: {
        activeChats: formattedChats,
        totalActive: formattedChats.length
      }
    });
  } catch (error) {
    console.error('Get active chats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get active chats'
    });
  }
});

// @desc    Get chat sessions list (for history page with filters)
// @route   GET /api/support/chat/history
// @access  Private (Platform Support)
const getChatHistoryList = asyncHandler(async (req, res) => {
  try {
    const { period = '7d', status: statusFilter = 'all' } = req.query;

    // Build date filter from period
    const now = new Date();
    let startDate;
    if (period === '24h') {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (period === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else {
      startDate = new Date(0); // All time
    }

    const query = { lastActivity: { $gte: startDate } };
    if (statusFilter && statusFilter !== 'all') {
      query.status = statusFilter;
    }

    const sessions = await ChatSession.find(query)
      .populate('customerId', 'name email phone')
      .populate('tenantId', 'name slug')
      .sort({ lastActivity: -1 })
      .limit(100);

    const formatted = sessions.map(session => ({
      _id: session._id,
      ticketId: session._id,
      ticketNumber: session.sessionId,
      customer: session.customerId ? {
        name: session.customerId.name,
        email: session.customerId.email,
        phone: session.customerId.phone
      } : { name: session.customerName, email: session.customerEmail },
      tenant: session.tenantId ? { name: session.tenantId.name, slug: session.tenantId.slug } : { name: 'Unknown', slug: 'unknown' },
      messageCount: session.messages?.length || 0,
      status: session.status,
      priority: session.priority || 'medium',
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      duration: session.messages?.length ? 'Has messages' : '0m',
      category: session.category || 'general'
    }));

    res.json({ success: true, data: formatted });
  } catch (error) {
    console.error('Get chat history list error:', error);
    res.status(500).json({ success: false, message: 'Failed to get chat history' });
  }
});

// @desc    Get chat history for a session
// @route   GET /api/support/chat/:sessionId/history
// @access  Private (Platform Support)
const getChatHistory = asyncHandler(async (req, res) => {
  try {
    const { sessionId } = req.params;

    console.log(`🔍 [Platform Support] Getting chat history for session: ${sessionId}`);

    // ENHANCED SESSION LOOKUP: Try both MongoDB _id and sessionId field with comprehensive fallback
    let chatSession;
    
    // Check if sessionId looks like a MongoDB ObjectId (24 hex characters)
    if (sessionId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log(`🔍 [Platform Support] Looking up by MongoDB ID: ${sessionId}`);
      chatSession = await ChatSession.findById(sessionId)
        .populate('customerId', 'name email phone')
        .populate('assignedAgent', 'name email')
        .populate('tenantId', 'name slug')
        .populate('messages.sender', 'name email role');
        
      // If not found by ObjectId, try to find by sessionId field as fallback
      if (!chatSession) {
        console.log(`🔍 [Platform Support] ObjectId lookup failed, trying sessionId field...`);
        chatSession = await ChatSession.findOne({ sessionId: sessionId })
          .populate('customerId', 'name email phone')
          .populate('assignedAgent', 'name email')
          .populate('tenantId', 'name slug')
          .populate('messages.sender', 'name email role');
      }
    } else {
      console.log(`🔍 [Platform Support] Looking up by custom sessionId: ${sessionId}`);
      // Find by sessionId field (custom string like "CHAT-1769589050170-h03537zds")
      chatSession = await ChatSession.findOne({ sessionId: sessionId })
        .populate('customerId', 'name email phone')
        .populate('assignedAgent', 'name email')
        .populate('tenantId', 'name slug')
        .populate('messages.sender', 'name email role');
        
      // If not found by sessionId field, try ObjectId as fallback (if it's 24 chars)
      if (!chatSession && sessionId.length === 24) {
        console.log(`🔍 [Platform Support] SessionId lookup failed, trying ObjectId...`);
        try {
          chatSession = await ChatSession.findById(sessionId)
            .populate('customerId', 'name email phone')
            .populate('assignedAgent', 'name email')
            .populate('tenantId', 'name slug')
            .populate('messages.sender', 'name email role');
        } catch (e) {
          console.log(`🔍 [Platform Support] ObjectId fallback failed: ${e.message}`);
        }
      }
    }

    if (!chatSession) {
      console.log(`❌ [Platform Support] Chat session not found with any method: ${sessionId}`);
      
      // Debug: List all available sessions
      const allSessions = await ChatSession.find({}).limit(5);
      console.log(`🔍 [Platform Support] Available sessions for debugging:`, 
        allSessions.map(s => ({ 
          _id: s._id, 
          sessionId: s.sessionId, 
          customerName: s.customerName 
        }))
      );
      
      return res.status(404).json({
        success: false,
        message: 'Chat session not found',
        debug: {
          searchedSessionId: sessionId,
          availableSessions: allSessions.map(s => ({ 
            _id: s._id, 
            sessionId: s.sessionId 
          }))
        }
      });
    }

    console.log(`✅ [Platform Support] Found session: ${chatSession.sessionId} (${chatSession._id})`);
    console.log(`🔍 [Platform Support] Session has ${chatSession.messages?.length || 0} messages`);

    // Mark messages as read by support
    if (chatSession.unreadCount.support > 0) {
      chatSession.unreadCount.support = 0;
      await chatSession.save();
    }

    res.json({
      success: true,
      data: {
        session: {
          id: chatSession._id,
          sessionId: chatSession.sessionId,
          status: chatSession.status,
          priority: chatSession.priority,
          customer: chatSession.customerId || {
            name: chatSession.customerName,
            email: chatSession.customerEmail
          },
          assignedAgent: chatSession.assignedAgent,
          tenant: chatSession.tenantId || {
            name: chatSession.tenantName
          },
          createdAt: chatSession.createdAt,
          lookupMethod: sessionId.match(/^[0-9a-fA-F]{24}$/) ? 'ObjectId' : 'CustomSessionId'
        },
        messages: chatSession.messages
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) // Sort by timestamp ascending
          .map(msg => ({
            id: msg._id,
            sender: {
              name: msg.senderName,
              role: msg.senderRole
            },
            message: msg.message,
            timestamp: msg.createdAt,
            isInternal: msg.isInternal,
            isFromSupport: msg.senderRole === 'platform_support',
            messageType: msg.messageType,
            attachments: msg.attachments,
            status: msg.status
          }))
      }
    });
  } catch (error) {
    console.error('❌ [Platform Support] Get chat history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get chat history'
    });
  }
});

// @desc    Send message in chat
// @route   POST /api/support/chat/:sessionId/message
// @access  Private (Platform Support)
const sendChatMessage = asyncHandler(async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message, isInternal = false, messageType = 'text' } = req.body;

    console.log(`📤 [Platform Support] Sending message to session: ${sessionId}`);
    console.log(`📤 [Platform Support] From: ${req.user.name} (${req.user._id})`);
    console.log(`📤 [Platform Support] Message: "${message.substring(0, 50)}..."`);
    console.log(`📤 [Platform Support] Internal: ${isInternal}`);

    // ENHANCED SESSION LOOKUP: Try both MongoDB _id and sessionId field
    let chatSession;
    
    // Check if sessionId looks like a MongoDB ObjectId (24 hex characters)
    if (sessionId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log(`🔍 [Platform Support] Looking up by MongoDB ID: ${sessionId}`);
      chatSession = await ChatSession.findById(sessionId);
      
      // If not found by ObjectId, try to find by sessionId field as fallback
      if (!chatSession) {
        console.log(`🔍 [Platform Support] ObjectId lookup failed, trying sessionId field...`);
        chatSession = await ChatSession.findOne({ sessionId: sessionId });
      }
    } else {
      console.log(`🔍 [Platform Support] Looking up by custom sessionId: ${sessionId}`);
      // Find by sessionId field (custom string like "CHAT-1769589050170-h03537zds")
      chatSession = await ChatSession.findOne({ sessionId: sessionId });
      
      // If not found by sessionId field, try ObjectId as fallback
      if (!chatSession && sessionId.length === 24) {
        console.log(`🔍 [Platform Support] SessionId lookup failed, trying ObjectId...`);
        try {
          chatSession = await ChatSession.findById(sessionId);
        } catch (e) {
          console.log(`🔍 [Platform Support] ObjectId fallback failed: ${e.message}`);
        }
      }
    }

    if (!chatSession) {
      console.log(`❌ [Platform Support] Chat session not found with any method: ${sessionId}`);
      
      // Debug: List all available sessions
      const allSessions = await ChatSession.find({}).limit(5);
      console.log(`🔍 [Platform Support] Available sessions for debugging:`, 
        allSessions.map(s => ({ 
          _id: s._id, 
          sessionId: s.sessionId, 
          customerName: s.customerName 
        }))
      );
      
      return res.status(404).json({
        success: false,
        message: 'Chat session not found',
        debug: {
          searchedSessionId: sessionId,
          availableSessions: allSessions.map(s => ({ 
            _id: s._id, 
            sessionId: s.sessionId 
          }))
        }
      });
    }

    console.log(`✅ [Platform Support] Found session: ${chatSession.sessionId} (${chatSession._id})`);
    console.log(`🔍 [Platform Support] Session customer: ${chatSession.customerId} (${chatSession.customerName})`);
    console.log(`🔍 [Platform Support] Current messages count: ${chatSession.messages?.length || 0}`);

    // Create new message
    const newMessage = {
      sender: req.user._id,
      senderName: req.user.name,
      senderRole: 'platform_support',
      message,
      messageType,
      isInternal,
      status: 'sent'
    };

    console.log(`💾 [Platform Support] Adding message with senderRole: ${newMessage.senderRole}`);

    // Add message to session
    chatSession.messages.push(newMessage);
    
    // Update unread count for customer (if not internal)
    if (!isInternal) {
      chatSession.unreadCount.customer += 1;
      console.log(`📬 [Platform Support] Updated customer unread count: ${chatSession.unreadCount.customer}`);
    }
    
    // Update last activity and assign agent if not assigned
    chatSession.lastActivity = new Date();
    if (!chatSession.assignedAgent) {
      chatSession.assignedAgent = req.user._id;
      chatSession.agentName = req.user.name;
      console.log(`👤 [Platform Support] Assigned agent: ${req.user.name}`);
    }

    await chatSession.save();
    console.log(`✅ [Platform Support] Session saved with ${chatSession.messages.length} total messages`);
    console.log(`🔗 [Platform Support] Session identifiers - MongoDB ID: ${chatSession._id}, Custom ID: ${chatSession.sessionId}`);

    // Log the chat message
    try {
      await AuditLog.create({
        userId: req.user._id,
        action: 'CHAT_MESSAGE_SENT',
        module: 'PLATFORM_SUPPORT',
        details: {
          sessionId: chatSession.sessionId,
          mongoId: chatSession._id,
          messageLength: message.length,
          isInternal,
          messageType,
          customerName: chatSession.customerName,
          customerId: chatSession.customerId
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      console.log(`📝 [Platform Support] Audit log created`);
    } catch (auditError) {
      console.log(`⚠️ [Platform Support] Audit log failed (non-critical):`, auditError.message);
    }

    // TODO: Send real-time notification to customer if not internal
    // TODO: Send email notification if customer is offline

    const addedMessage = chatSession.messages[chatSession.messages.length - 1];
    console.log(`📨 [Platform Support] Message added with ID: ${addedMessage._id}`);

    res.json({
      success: true,
      message: 'Message sent successfully',
      data: {
        messageId: addedMessage._id,
        timestamp: addedMessage.createdAt,
        sessionInfo: {
          sessionId: chatSession.sessionId,
          mongoId: chatSession._id,
          totalMessages: chatSession.messages.length,
          customerName: chatSession.customerName,
          customerId: chatSession.customerId,
          lookupMethod: sessionId.match(/^[0-9a-fA-F]{24}$/) ? 'ObjectId' : 'CustomSessionId'
        },
        message: {
          id: addedMessage._id,
          sender: {
            name: addedMessage.senderName,
            role: addedMessage.senderRole
          },
          message: addedMessage.message,
          timestamp: addedMessage.createdAt,
          isInternal: addedMessage.isInternal,
          isFromSupport: true,
          messageType: addedMessage.messageType,
          status: addedMessage.status
        }
      }
    });
  } catch (error) {
    console.error('❌ [Platform Support] Send chat message error:', error);
    console.error('❌ [Platform Support] Error stack:', error.stack);
    console.error('❌ [Platform Support] Session ID:', sessionId);
    console.error('❌ [Platform Support] Request body:', req.body);
    console.error('❌ [Platform Support] User:', req.user?.name, req.user?._id);
    
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? {
        sessionId,
        userId: req.user?._id,
        userName: req.user?.name,
        errorType: error.name,
        errorMessage: error.message
      } : undefined
    });
  }
});

// ==================== TENANT CHAT ENDPOINTS ====================

// @desc    Create new chat session (for tenant admins)
// @route   POST /api/support/chat/create
// @access  Private (Tenant Admin)
const createChatSession = asyncHandler(async (req, res) => {
  try {
    const { 
      message, 
      subject, 
      initialMessage, 
      category = 'general', 
      priority = 'medium' 
    } = req.body;

    // Use either message or initialMessage, and subject as category if provided
    const chatMessage = message || initialMessage || 'New chat session started';
    let chatCategory = subject || category;

    // Valid categories from the model
    const validCategories = [
      'payment', 'order', 'account', 'system', 'general', 'technical',
      'features', 'billing', 'support', 'bug', 'feedback', 'integration',
      'api', 'mobile', 'web', 'performance', 'security', 'data',
      'export', 'import', 'configuration', 'training', 'documentation'
    ];

    // Map common user inputs to valid categories
    const categoryMapping = {
      'features problem': 'features',
      'feature request': 'features',
      'feature issue': 'features',
      'payment issue': 'payment',
      'payment problem': 'payment',
      'billing issue': 'billing',
      'billing problem': 'billing',
      'order issue': 'order',
      'order problem': 'order',
      'account issue': 'account',
      'account problem': 'account',
      'technical issue': 'technical',
      'technical problem': 'technical',
      'bug report': 'bug',
      'system issue': 'system',
      'system problem': 'system',
      'api issue': 'api',
      'api problem': 'api',
      'mobile issue': 'mobile',
      'mobile problem': 'mobile',
      'web issue': 'web',
      'web problem': 'web',
      'performance issue': 'performance',
      'performance problem': 'performance',
      'security issue': 'security',
      'security problem': 'security',
      'data issue': 'data',
      'data problem': 'data',
      'export issue': 'export',
      'import issue': 'import',
      'configuration issue': 'configuration',
      'config issue': 'configuration',
      'help': 'support',
      'question': 'support',
      'how to': 'training',
      'tutorial': 'training',
      'documentation': 'documentation',
      'docs': 'documentation'
    };

    // Normalize category input
    const normalizedCategory = chatCategory.toLowerCase().trim();
    
    // Check if it's a direct match with valid categories
    if (validCategories.includes(normalizedCategory)) {
      chatCategory = normalizedCategory;
    }
    // Check if it matches our mapping
    else if (categoryMapping[normalizedCategory]) {
      chatCategory = categoryMapping[normalizedCategory];
    }
    // Check if any valid category is contained in the input
    else {
      const foundCategory = validCategories.find(cat => 
        normalizedCategory.includes(cat) || cat.includes(normalizedCategory)
      );
      chatCategory = foundCategory || 'general'; // Fallback to 'general'
    }

    console.log('🚀 Creating chat session:', {
      originalSubject: subject,
      originalCategory: category,
      normalizedInput: normalizedCategory,
      finalCategory: chatCategory,
      chatMessage,
      priority,
      userId: req.user._id,
      userName: req.user.name,
      userEmail: req.user.email,
      userTenancy: req.user.tenancy
    });

    // Safely extract tenancy information
    let tenantId = null;
    let tenantName = 'Unknown Tenant';
    
    if (req.user.tenancy) {
      if (typeof req.user.tenancy === 'object') {
        tenantId = req.user.tenancy._id || req.user.tenancy.id;
        tenantName = req.user.tenancy.name || 'Unknown Tenant';
      } else {
        // tenancy is just an ID string
        tenantId = req.user.tenancy;
      }
    }
    
    console.log('🏢 Tenancy info:', { tenantId, tenantName });

    // Generate unique session ID
    const sessionId = `CHAT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create new chat session with safe field access
    const chatSessionData = {
      sessionId,
      tenantId: tenantId || req.user._id, // Fallback to user ID if no tenancy
      tenantName,
      customerId: req.user._id,
      customerName: req.user.name || 'Unknown User',
      customerEmail: req.user.email || 'unknown@email.com',
      status: 'active',
      priority,
      category: chatCategory, // Now guaranteed to be valid
      messages: [{
        sender: req.user._id,
        senderName: req.user.name || 'Unknown User',
        senderRole: 'tenant_admin',
        message: chatMessage,
        messageType: 'text',
        status: 'sent'
      }],
      unreadCount: {
        customer: 0,
        support: 1
      },
      metadata: {
        userAgent: req.get('User-Agent') || 'Unknown',
        ipAddress: req.ip || 'Unknown',
        source: 'web'
      }
    };

    console.log('💾 Chat session data to save:', JSON.stringify(chatSessionData, null, 2));

    const chatSession = new ChatSession(chatSessionData);
    await chatSession.save();
    
    console.log('✅ Chat session saved:', chatSession._id);

    // Log the chat creation (with error handling)
    try {
      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email || 'unknown@email.com',
        userType: 'admin', // Use 'admin' instead of 'tenant_admin'
        action: 'CHAT_SESSION_CREATED',
        module: 'TENANT_SUPPORT',
        category: 'system', // Use 'system' instead of 'support'
        description: `Chat session created by ${req.user.name || 'Unknown User'}`,
        status: 'success',
        details: {
          sessionId,
          category: chatCategory,
          originalSubject: subject,
          priority,
          messageLength: chatMessage.length
        },
        ipAddress: req.ip || 'Unknown',
        userAgent: req.get('User-Agent') || 'Unknown'
      });
      console.log('✅ Audit log created');
    } catch (auditError) {
      console.log('⚠️ Audit log creation failed (non-critical):', auditError.message);
    }

    res.json({
      success: true,
      message: 'Chat session created successfully',
      data: {
        sessionId: chatSession._id,
        sessionNumber: chatSession.sessionId,
        status: chatSession.status,
        priority: chatSession.priority,
        category: chatSession.category,
        originalSubject: subject,
        createdAt: chatSession.createdAt
      }
    });
  } catch (error) {
    console.error('❌ Create chat session error:', error);
    console.error('Error stack:', error.stack);
    console.error('User object:', JSON.stringify(req.user, null, 2));
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    
    res.status(500).json({
      success: false,
      message: 'Failed to create chat session',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @desc    Get my chat sessions (for tenant admins)
// @route   GET /api/support/chat/my-sessions
// @access  Private (Tenant Admin)
const getMyChatSessions = asyncHandler(async (req, res) => {
  try {
    const { status, limit = 10 } = req.query;

    let query = {
      customerId: req.user._id
    };

    if (status) {
      query.status = status;
    }

    const chatSessions = await ChatSession.find(query)
      .populate('assignedAgent', 'name email')
      .sort({ lastActivity: -1 })
      .limit(parseInt(limit));

    const formattedSessions = chatSessions.map(session => ({
      id: session._id,
      sessionId: session.sessionId,
      status: session.status,
      priority: session.priority,
      category: session.category,
      assignedAgent: session.assignedAgent,
      lastMessage: session.messages.length > 0 ? {
        message: session.messages[session.messages.length - 1].message,
        timestamp: session.messages[session.messages.length - 1].createdAt,
        isFromSupport: session.messages[session.messages.length - 1].senderRole === 'platform_support'
      } : null,
      unreadCount: session.unreadCount.customer || 0,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity
    }));

    res.json({
      success: true,
      data: {
        sessions: formattedSessions,
        totalSessions: formattedSessions.length
      }
    });
  } catch (error) {
    console.error('Get my chat sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get chat sessions'
    });
  }
});

// @desc    Get active chat session for sidebar chatbox
// @route   GET /api/tenant/chat/active-session
// @access  Private (Tenant Admin)
const getActiveSession = asyncHandler(async (req, res) => {
  try {
    // Find the most recent active session for this user
    const activeSession = await ChatSession.findOne({
      customerId: req.user._id,
      status: { $in: ['open', 'in_progress'] }
    })
    .populate('assignedAgent', 'name email')
    .sort({ lastActivity: -1 });

    if (activeSession) {
      const formattedSession = {
        sessionId: activeSession._id,
        ticketNumber: activeSession.sessionId,
        subject: activeSession.category || 'Quick Support Chat',
        status: activeSession.status,
        unreadCount: activeSession.unreadCount?.customer || 0
      };

      const formattedMessages = activeSession.messages.map(msg => ({
        id: msg._id,
        sender: {
          name: msg.senderRole === 'platform_support' ? 'Platform Support' : msg.senderName,
          role: msg.senderRole
        },
        message: msg.message,
        timestamp: msg.createdAt,
        isFromSupport: msg.senderRole === 'platform_support',
        messageType: msg.messageType || 'text'
      }));

      res.json({
        success: true,
        data: {
          session: formattedSession,
          messages: formattedMessages
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          session: null,
          messages: []
        }
      });
    }
  } catch (error) {
    console.error('Get active session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get active session'
    });
  }
});

// @desc    Send message from tenant admin
// @route   POST /api/support/chat/send-message
// @access  Private (Tenant Admin)
const sendTenantMessage = asyncHandler(async (req, res) => {
  try {
    const { sessionId, message, messageType = 'text' } = req.body;

    const chatSession = await ChatSession.findById(sessionId);
    if (!chatSession) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found'
      });
    }

    // Verify user owns this session
    if (chatSession.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Create new message
    const newMessage = {
      sender: req.user._id,
      senderName: req.user.name,
      senderRole: 'tenant_admin',
      message,
      messageType,
      status: 'sent'
    };

    // Add message to session
    chatSession.messages.push(newMessage);
    
    // Update unread count for support
    chatSession.unreadCount.support += 1;
    chatSession.unreadCount.customer = 0; // Reset customer unread count
    
    // Update last activity
    chatSession.lastActivity = new Date();

    await chatSession.save();

    // Log the message
    await AuditLog.create({
      userId: req.user._id,
      userEmail: req.user.email,
      userType: 'admin',
      action: 'TENANT_CHAT_MESSAGE_SENT',
      module: 'TENANT_SUPPORT',
      category: 'system',
      description: `Message sent by ${req.user.name}`,
      status: 'success',
      details: {
        sessionId,
        messageLength: message.length,
        messageType
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    const addedMessage = chatSession.messages[chatSession.messages.length - 1];

    res.json({
      success: true,
      message: 'Message sent successfully',
      data: {
        messageId: addedMessage._id,
        timestamp: addedMessage.createdAt,
        message: {
          id: addedMessage._id,
          sender: {
            name: addedMessage.senderName,
            role: addedMessage.senderRole
          },
          message: addedMessage.message,
          timestamp: addedMessage.createdAt,
          isFromSupport: false,
          messageType: addedMessage.messageType,
          status: addedMessage.status
        }
      }
    });
  } catch (error) {
    console.error('Send tenant message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message'
    });
  }
});

// ==================== SAFE IMPERSONATION ====================

// @desc    Create impersonation session
// @route   POST /api/support/impersonation
// @access  Private (Platform Support)
const createImpersonationSession = asyncHandler(async (req, res) => {
  try {
    const { userId, reason, duration = 30 } = req.body; // duration in minutes

    const targetUser = await User.findById(userId).populate('tenancy', 'name slug');
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Create temporary impersonation token
    const impersonationToken = jwt.sign(
      {
        supportUserId: req.user._id,
        targetUserId: userId,
        impersonation: true,
        reason,
        expiresAt: new Date(Date.now() + duration * 60 * 1000)
      },
      process.env.JWT_SECRET,
      { expiresIn: `${duration}m` }
    );

    // Log the impersonation start
    await AuditLog.create({
      userId: req.user._id,
      action: 'IMPERSONATION_START',
      module: 'PLATFORM_SUPPORT',
      details: {
        targetUserId: userId,
        targetUserEmail: targetUser.email,
        reason,
        duration,
        tenancyId: targetUser.tenancy?._id
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      data: {
        impersonationToken,
        targetUser: {
          id: targetUser._id,
          name: targetUser.name,
          email: targetUser.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'), // Mask email
          role: targetUser.role,
          tenancy: targetUser.tenancy
        },
        expiresAt: new Date(Date.now() + duration * 60 * 1000),
        sessionId: impersonationToken.slice(-8) // Last 8 chars as session ID
      }
    });
  } catch (error) {
    console.error('Create impersonation session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create impersonation session'
    });
  }
});

// @desc    End impersonation session
// @route   POST /api/support/impersonation/end
// @access  Private (Platform Support)
const endImpersonationSession = asyncHandler(async (req, res) => {
  try {
    const { sessionId } = req.body;

    // Log the impersonation end
    await AuditLog.create({
      userId: req.user._id,
      action: 'IMPERSONATION_END',
      module: 'PLATFORM_SUPPORT',
      details: {
        sessionId,
        endedBy: 'support_user'
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Impersonation session ended'
    });
  } catch (error) {
    console.error('End impersonation session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end impersonation session'
    });
  }
});

// @desc    Get active impersonation sessions
// @route   GET /api/support/impersonation/active
// @access  Private (Platform Support)
const getActiveImpersonationSessions = asyncHandler(async (req, res) => {
  try {
    // Get recent impersonation logs that haven't been ended
    const recentImpersonations = await AuditLog.find({
      userId: req.user._id,
      action: 'IMPERSONATION_START',
      createdAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } // Last 2 hours
    }).sort({ createdAt: -1 });

    // Filter out ended sessions
    const endedSessions = await AuditLog.find({
      userId: req.user._id,
      action: 'IMPERSONATION_END',
      createdAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }
    });

    const endedSessionIds = endedSessions.map(log => log.details.sessionId);
    
    const activeSessions = recentImpersonations.filter(session => {
      const sessionId = session.details.sessionId || session._id.toString().slice(-8);
      return !endedSessionIds.includes(sessionId) && 
             new Date(session.createdAt).getTime() + (session.details.duration * 60 * 1000) > Date.now();
    });

    res.json({
      success: true,
      data: {
        activeSessions: activeSessions.map(session => ({
          sessionId: session.details.sessionId || session._id.toString().slice(-8),
          targetUserId: session.details.targetUserId,
          targetUserEmail: session.details.targetUserEmail,
          reason: session.details.reason,
          startedAt: session.createdAt,
          expiresAt: new Date(session.createdAt.getTime() + (session.details.duration * 60 * 1000))
        })),
        totalActive: activeSessions.length
      }
    });
  } catch (error) {
    console.error('Get active impersonation sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get active sessions'
    });
  }
});

// ==================== SYSTEM MONITORING ====================

// @desc    Get system alerts
// @route   GET /api/support/system/alerts
// @access  Private (Platform Support)
const getSystemAlerts = asyncHandler(async (req, res) => {
  try {
    const { severity, status, page = 1, limit = 20 } = req.query;

    // Mock system alerts - in real implementation, this would come from monitoring system
    const alerts = [
      {
        id: 'alert_001',
        title: 'High Payment Failure Rate',
        description: 'Payment failure rate exceeded 15% in the last hour',
        severity: 'high',
        status: 'active',
        affectedTenants: 5,
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
        category: 'payment'
      },
      {
        id: 'alert_002',
        title: 'Stuck Orders Alert',
        description: '12 orders stuck in processing for more than 24 hours',
        severity: 'medium',
        status: 'active',
        affectedTenants: 3,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        category: 'orders'
      }
    ];

    res.json({
      success: true,
      data: {
        alerts,
        summary: {
          total: alerts.length,
          high: alerts.filter(a => a.severity === 'high').length,
          medium: alerts.filter(a => a.severity === 'medium').length,
          low: alerts.filter(a => a.severity === 'low').length
        }
      }
    });
  } catch (error) {
    console.error('Get system alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get system alerts'
    });
  }
});

// @desc    Get platform health status
// @route   GET /api/support/system/health
// @access  Private (Platform Support)
const getPlatformHealth = asyncHandler(async (req, res) => {
  try {
    // Mock health data - in real implementation, this would come from monitoring system
    const healthData = {
      overall: 'healthy',
      services: {
        api: { status: 'healthy', responseTime: 120, uptime: 99.9 },
        database: { status: 'healthy', responseTime: 45, uptime: 99.95 },
        payments: { status: 'degraded', responseTime: 800, uptime: 98.5 },
        notifications: { status: 'healthy', responseTime: 200, uptime: 99.8 }
      },
      metrics: {
        activeUsers: 1250,
        ordersPerHour: 45,
        paymentSuccessRate: 94.2,
        averageResponseTime: 180
      },
      lastUpdated: new Date()
    };

    res.json({
      success: true,
      data: healthData
    });
  } catch (error) {
    console.error('Get platform health error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get platform health'
    });
  }
});

// @desc    Get tenant issue heatmap
// @route   GET /api/support/system/heatmap
// @access  Private (Platform Support)
const getTenantHeatmap = asyncHandler(async (req, res) => {
  try {
    const { timeframe = '24h' } = req.query;
    
    let timeFilter;
    switch (timeframe) {
      case '1h':
        timeFilter = new Date(Date.now() - 60 * 60 * 1000);
        break;
      case '24h':
        timeFilter = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        timeFilter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        timeFilter = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }

    // Get ticket counts by tenant
    const ticketsByTenant = await Ticket.aggregate([
      {
        $match: {
          createdAt: { $gte: timeFilter },
          status: { $in: ['open', 'in_progress', 'escalated'] }
        }
      },
      {
        $group: {
          _id: '$tenancy',
          ticketCount: { $sum: 1 },
          highPriorityCount: {
            $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] }
          },
          escalatedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'escalated'] }, 1, 0] }
          }
        }
      },
      {
        $lookup: {
          from: 'tenancies',
          localField: '_id',
          foreignField: '_id',
          as: 'tenant'
        }
      },
      {
        $unwind: '$tenant'
      },
      {
        $project: {
          tenantId: '$_id',
          tenantName: '$tenant.name',
          tenantSlug: '$tenant.slug',
          ticketCount: 1,
          highPriorityCount: 1,
          escalatedCount: 1,
          riskScore: {
            $add: [
              '$ticketCount',
              { $multiply: ['$highPriorityCount', 2] },
              { $multiply: ['$escalatedCount', 3] }
            ]
          }
        }
      },
      {
        $sort: { riskScore: -1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        heatmap: ticketsByTenant,
        timeframe,
        summary: {
          totalTenants: ticketsByTenant.length,
          totalTickets: ticketsByTenant.reduce((sum, t) => sum + t.ticketCount, 0),
          highRiskTenants: ticketsByTenant.filter(t => t.riskScore > 10).length
        }
      }
    });
  } catch (error) {
    console.error('Get tenant heatmap error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tenant heatmap'
    });
  }
});

// ==================== ESCALATION MATRIX ====================

// @desc    Get escalation matrix
// @route   GET /api/support/escalation
// @access  Private (Platform Support)
const getEscalationMatrix = asyncHandler(async (req, res) => {
  try {
    const escalationMatrix = {
      rules: [
        {
          category: 'payment_issues',
          title: 'Payment & Refund Issues',
          escalateTo: 'Platform Finance Admin',
          conditions: ['Payment failures', 'Refund requests', 'Transaction disputes'],
          slaHours: 4,
          autoEscalate: true
        },
        {
          category: 'system_bugs',
          title: 'System Bugs & Technical Issues',
          escalateTo: 'Engineering Team',
          conditions: ['Application errors', 'Performance issues', 'Feature malfunctions'],
          slaHours: 8,
          autoEscalate: true
        },
        {
          category: 'security_concerns',
          title: 'Security & Compliance',
          escalateTo: 'Platform Auditor',
          conditions: ['Security breaches', 'Data concerns', 'Compliance violations'],
          slaHours: 1,
          autoEscalate: true
        },
        {
          category: 'tenant_disputes',
          title: 'Tenant Business Disputes',
          escalateTo: 'Super Admin',
          conditions: ['Billing disputes', 'Service complaints', 'Contract issues'],
          slaHours: 12,
          autoEscalate: false
        }
      ],
      contacts: {
        'Platform Finance Admin': 'finance@laundrylobby.com',
        'Engineering Team': 'engineering@laundrylobby.com',
        'Platform Auditor': 'auditor@laundrylobby.com',
        'Super Admin': 'admin@laundrylobby.com'
      }
    };

    res.json({
      success: true,
      data: escalationMatrix
    });
  } catch (error) {
    console.error('Get escalation matrix error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get escalation matrix'
    });
  }
});

// ==================== SUPPORT AUDIT LOGS ====================

// @desc    Get support audit logs
// @route   GET /api/support/audit
// @access  Private (Platform Support)
const getSupportAuditLogs = asyncHandler(async (req, res) => {
  try {
    const { 
      action, 
      dateFrom, 
      dateTo, 
      page = 1, 
      limit = 50 
    } = req.query;

    let query = {
      module: 'PLATFORM_SUPPORT'
    };

    if (action) {
      query.action = action;
    }

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const auditLogs = await AuditLog.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await AuditLog.countDocuments(query);

    res.json({
      success: true,
      data: {
        logs: auditLogs,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Get support audit logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get audit logs'
    });
  }
});

// @desc    Debug endpoint to check all chat sessions
// @route   GET /api/support/debug/chat-sessions
// @access  Private (Platform Support)
const debugChatSessions = asyncHandler(async (req, res) => {
  try {
    // Get all chat sessions for debugging
    const allSessions = await ChatSession.find({})
      .populate('customerId', 'name email')
      .populate('tenantId', 'name')
      .sort({ createdAt: -1 })
      .limit(20);

    const debugInfo = {
      totalSessions: allSessions.length,
      sessions: allSessions.map(session => ({
        id: session._id,
        sessionId: session.sessionId,
        status: session.status,
        priority: session.priority,
        customerName: session.customerName,
        tenantName: session.tenantName,
        messagesCount: session.messages?.length || 0,
        lastActivity: session.lastActivity,
        createdAt: session.createdAt,
        unreadCount: session.unreadCount
      })),
      statusBreakdown: {}
    };

    // Count by status
    allSessions.forEach(session => {
      const status = session.status || 'unknown';
      debugInfo.statusBreakdown[status] = (debugInfo.statusBreakdown[status] || 0) + 1;
    });

    res.json({
      success: true,
      data: debugInfo
    });
  } catch (error) {
    console.error('Debug chat sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to debug chat sessions'
    });
  }
});

// ==================== USER ASSISTANCE - ACCOUNT RECOVERY ====================

// @desc    Get account recovery requests
// @route   GET /api/support/users/recovery-requests
// @access  Private (Platform Support)
const getRecoveryRequests = asyncHandler(async (req, res) => {
  try {
    const { status, type, dateFrom, dateTo, page = 1, limit = 20 } = req.query;

    let query = {};

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by request type
    if (type) {
      query.requestType = type;
    }

    // Filter by date range
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    // Find recovery requests from audit logs or create a dedicated RecoveryRequest model
    const recoveryRequests = await AuditLog.find({
      action: { $in: ['PASSWORD_RESET_REQUEST', 'ACCOUNT_UNLOCK_REQUEST', 'EMAIL_VERIFICATION_REQUEST', 'PHONE_VERIFICATION_REQUEST'] },
      ...query
    })
    .populate('userId', 'name email phone')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const total = await AuditLog.countDocuments({
      action: { $in: ['PASSWORD_RESET_REQUEST', 'ACCOUNT_UNLOCK_REQUEST', 'EMAIL_VERIFICATION_REQUEST', 'PHONE_VERIFICATION_REQUEST'] },
      ...query
    });

    // Transform audit logs to recovery request format
    const formattedRequests = recoveryRequests.map(log => ({
      id: log._id,
      userId: log.userId?._id,
      userName: log.userId?.name || log.details?.targetUserName || 'Unknown User',
      userEmail: log.userId?.email || log.details?.targetUserEmail || 'unknown@email.com',
      userPhone: log.userId?.phone || log.details?.targetUserPhone || 'No phone',
      requestType: log.action.toLowerCase().replace('_request', '').replace('_', '_'),
      status: log.details?.status || 'pending',
      reason: log.details?.reason || 'User requested account recovery',
      requestedAt: log.createdAt,
      lastUpdated: log.updatedAt,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      priority: log.details?.priority || 'medium'
    }));

    // Calculate stats
    const stats = {
      totalRequests: formattedRequests.length,
      pending: formattedRequests.filter(req => req.status === 'pending').length,
      completed: formattedRequests.filter(req => req.status === 'completed').length,
      failed: formattedRequests.filter(req => req.status === 'failed').length,
      byType: {
        password_reset: formattedRequests.filter(req => req.requestType === 'password_reset').length,
        account_unlock: formattedRequests.filter(req => req.requestType === 'account_unlock').length,
        email_verification: formattedRequests.filter(req => req.requestType === 'email_verification').length,
        phone_verification: formattedRequests.filter(req => req.requestType === 'phone_verification').length
      },
      avgResolutionTime: '1.5h' // TODO: Calculate from actual data
    };

    res.json({
      success: true,
      data: {
        requests: formattedRequests,
        stats,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Get recovery requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recovery requests'
    });
  }
});

// @desc    Approve recovery request
// @route   POST /api/support/users/recovery-requests/:id/approve
// @access  Private (Platform Support)
const approveRecoveryRequest = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, action } = req.body;

    // Find the original request
    const originalRequest = await AuditLog.findById(id);
    if (!originalRequest) {
      return res.status(404).json({
        success: false,
        message: 'Recovery request not found'
      });
    }

    const targetUserId = originalRequest.details?.targetUserId || originalRequest.userId;
    const targetUser = await User.findById(targetUserId);
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Target user not found'
      });
    }

    let actionResult = {};

    // Perform the requested action
    switch (originalRequest.action) {
      case 'PASSWORD_RESET_REQUEST':
        // Generate temporary password
        const tempPassword = Math.random().toString(36).slice(-8);
        targetUser.password = tempPassword;
        targetUser.mustChangePassword = true;
        await targetUser.save();
        actionResult = { temporaryPassword: tempPassword };
        break;

      case 'ACCOUNT_UNLOCK_REQUEST':
        // Unlock account
        targetUser.isActive = true;
        targetUser.loginAttempts = 0;
        targetUser.lockUntil = undefined;
        await targetUser.save();
        actionResult = { accountUnlocked: true };
        break;

      case 'EMAIL_VERIFICATION_REQUEST':
        // Mark email as verified
        targetUser.isEmailVerified = true;
        await targetUser.save();
        actionResult = { emailVerified: true };
        break;

      case 'PHONE_VERIFICATION_REQUEST':
        // Mark phone as verified
        targetUser.phoneVerified = true;
        await targetUser.save();
        actionResult = { phoneVerified: true };
        break;
    }

    // Log the approval action
    await AuditLog.create({
      userId: req.user._id,
      action: 'RECOVERY_REQUEST_APPROVED',
      module: 'PLATFORM_SUPPORT',
      details: {
        originalRequestId: id,
        targetUserId,
        targetUserEmail: targetUser.email,
        requestType: originalRequest.action,
        reason,
        actionResult
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Recovery request approved successfully',
      data: {
        requestId: id,
        action: originalRequest.action,
        targetUser: {
          id: targetUser._id,
          name: targetUser.name,
          email: targetUser.email
        },
        result: actionResult
      }
    });
  } catch (error) {
    console.error('Approve recovery request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve recovery request'
    });
  }
});

// @desc    Reject recovery request
// @route   POST /api/support/users/recovery-requests/:id/reject
// @access  Private (Platform Support)
const rejectRecoveryRequest = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Find the original request
    const originalRequest = await AuditLog.findById(id);
    if (!originalRequest) {
      return res.status(404).json({
        success: false,
        message: 'Recovery request not found'
      });
    }

    // Log the rejection action
    await AuditLog.create({
      userId: req.user._id,
      action: 'RECOVERY_REQUEST_REJECTED',
      module: 'PLATFORM_SUPPORT',
      details: {
        originalRequestId: id,
        targetUserId: originalRequest.details?.targetUserId || originalRequest.userId,
        requestType: originalRequest.action,
        rejectionReason: reason
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Recovery request rejected successfully',
      data: {
        requestId: id,
        rejectionReason: reason
      }
    });
  } catch (error) {
    console.error('Reject recovery request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject recovery request'
    });
  }
});

// @desc    Resend recovery request
// @route   POST /api/support/users/recovery-requests/:id/resend
// @access  Private (Platform Support)
const resendRecoveryRequest = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // Find the original request
    const originalRequest = await AuditLog.findById(id);
    if (!originalRequest) {
      return res.status(404).json({
        success: false,
        message: 'Recovery request not found'
      });
    }

    const targetUserId = originalRequest.details?.targetUserId || originalRequest.userId;
    const targetUser = await User.findById(targetUserId);
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Target user not found'
      });
    }

    // Resend based on request type
    let resendResult = {};
    switch (originalRequest.action) {
      case 'PASSWORD_RESET_REQUEST':
        // Generate new OTP for password reset
        const otp = Math.floor(100000 + Math.random() * 900000);
        targetUser.otp = otp;
        targetUser.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
        await targetUser.save();
        resendResult = { otpSent: true, expiryTime: targetUser.otpExpiry };
        break;

      case 'EMAIL_VERIFICATION_REQUEST':
        // Resend email verification
        resendResult = { emailSent: true };
        break;

      case 'PHONE_VERIFICATION_REQUEST':
        // Resend SMS verification
        resendResult = { smsSent: true };
        break;
    }

    // Log the resend action
    await AuditLog.create({
      userId: req.user._id,
      action: 'RECOVERY_REQUEST_RESENT',
      module: 'PLATFORM_SUPPORT',
      details: {
        originalRequestId: id,
        targetUserId,
        targetUserEmail: targetUser.email,
        requestType: originalRequest.action,
        resendResult
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Recovery request resent successfully',
      data: {
        requestId: id,
        result: resendResult
      }
    });
  } catch (error) {
    console.error('Resend recovery request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend recovery request'
    });
  }
});

// ==================== USER ASSISTANCE - PASSWORD RESET MANAGEMENT ====================

// @desc    Get password reset requests
// @route   GET /api/support/users/password-reset-requests
// @access  Private (Platform Support)
const getPasswordResetRequests = asyncHandler(async (req, res) => {
  try {
    const { status, method, dateFrom, dateTo, page = 1, limit = 20 } = req.query;

    // Find users with recent password reset activity
    let query = {
      $or: [
        { otp: { $exists: true } },
        { otpExpiry: { $exists: true } },
        { mustChangePassword: true }
      ]
    };

    if (dateFrom || dateTo) {
      query.updatedAt = {};
      if (dateFrom) query.updatedAt.$gte = new Date(dateFrom);
      if (dateTo) query.updatedAt.$lte = new Date(dateTo);
    }

    const users = await User.find(query)
      .populate('tenancy', 'name')
      .select('name email phone otp otpExpiry mustChangePassword isActive createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    // Transform to password reset request format
    const passwordResetRequests = users.map(user => ({
      id: user._id,
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      userPhone: user.phone,
      tenantName: user.tenancy?.name || 'No Tenant',
      status: user.otp && user.otpExpiry && user.otpExpiry > new Date() ? 'sent' : 
              user.mustChangePassword ? 'used' : 
              user.otpExpiry && user.otpExpiry < new Date() ? 'expired' : 'pending',
      resetMethod: user.phone ? 'sms' : 'email',
      requestedAt: user.updatedAt,
      expiryTime: user.otpExpiry,
      isActive: user.isActive
    }));

    // Calculate stats
    const stats = {
      totalRequests: passwordResetRequests.length,
      pending: passwordResetRequests.filter(req => req.status === 'pending').length,
      sent: passwordResetRequests.filter(req => req.status === 'sent').length,
      used: passwordResetRequests.filter(req => req.status === 'used').length,
      expired: passwordResetRequests.filter(req => req.status === 'expired').length,
      failed: 0, // TODO: Track failed attempts
      byMethod: {
        email: passwordResetRequests.filter(req => req.resetMethod === 'email').length,
        sms: passwordResetRequests.filter(req => req.resetMethod === 'sms').length,
        admin_override: 0, // TODO: Track admin overrides
        security_questions: 0 // TODO: Implement security questions
      },
      avgResponseTime: '2.5m'
    };

    res.json({
      success: true,
      data: {
        requests: passwordResetRequests,
        stats,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Get password reset requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get password reset requests'
    });
  }
});

// @desc    Generate new password reset
// @route   POST /api/support/users/password-reset-requests/:id/generate
// @access  Private (Platform Support)
const generatePasswordReset = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { method = 'email' } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: 'PASSWORD_RESET_GENERATED',
      module: 'PLATFORM_SUPPORT',
      details: {
        targetUserId: id,
        targetUserEmail: user.email,
        method,
        otpExpiry: user.otpExpiry
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    // TODO: Send OTP via selected method (email/SMS)

    res.json({
      success: true,
      message: 'Password reset generated successfully',
      data: {
        userId: id,
        method,
        otpSent: true,
        expiryTime: user.otpExpiry
      }
    });
  } catch (error) {
    console.error('Generate password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate password reset'
    });
  }
});

// @desc    Resend password reset
// @route   POST /api/support/users/password-reset-requests/:id/resend
// @access  Private (Platform Support)
const resendPasswordReset = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.otp || !user.otpExpiry) {
      return res.status(400).json({
        success: false,
        message: 'No active password reset found'
      });
    }

    // Extend expiry time
    user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: 'PASSWORD_RESET_RESENT',
      module: 'PLATFORM_SUPPORT',
      details: {
        targetUserId: id,
        targetUserEmail: user.email,
        newExpiryTime: user.otpExpiry
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Password reset resent successfully',
      data: {
        userId: id,
        otpResent: true,
        expiryTime: user.otpExpiry
      }
    });
  } catch (error) {
    console.error('Resend password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend password reset'
    });
  }
});

// @desc    Expire password reset
// @route   POST /api/support/users/password-reset-requests/:id/expire
// @access  Private (Platform Support)
const expirePasswordReset = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Expire the OTP
    user.otp = undefined;
    user.otpExpiry = new Date(); // Set to past date
    await user.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: 'PASSWORD_RESET_EXPIRED',
      module: 'PLATFORM_SUPPORT',
      details: {
        targetUserId: id,
        targetUserEmail: user.email,
        reason
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Password reset expired successfully',
      data: {
        userId: id,
        expired: true
      }
    });
  } catch (error) {
    console.error('Expire password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to expire password reset'
    });
  }
});

// ==================== USER ASSISTANCE - ACCOUNT UNLOCK MANAGEMENT ====================

// @desc    Get locked accounts
// @route   GET /api/support/users/locked-accounts
// @access  Private (Platform Support)
const getLockedAccounts = asyncHandler(async (req, res) => {
  try {
    const { status, reason, dateFrom, dateTo, page = 1, limit = 20 } = req.query;

    let query = {
      $or: [
        { isActive: false },
        { loginAttempts: { $gte: 5 } },
        { lockUntil: { $exists: true } }
      ]
    };

    if (dateFrom || dateTo) {
      query.updatedAt = {};
      if (dateFrom) query.updatedAt.$gte = new Date(dateFrom);
      if (dateTo) query.updatedAt.$lte = new Date(dateTo);
    }

    const users = await User.find(query)
      .populate('tenancy', 'name')
      .select('name email phone isActive loginAttempts lockUntil createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    // Transform to locked account format
    const lockedAccounts = users.map(user => {
      const now = new Date();
      const lockStatus = !user.isActive ? 'locked' : 
                        user.lockUntil && user.lockUntil > now ? 'temporarily_locked' :
                        user.loginAttempts >= 5 ? 'pending_review' : 'unlocked';
      
      const lockReason = !user.isActive ? 'admin_action' :
                        user.loginAttempts >= 5 ? 'failed_attempts' :
                        user.lockUntil ? 'suspicious_activity' : 'unknown';

      return {
        id: user._id,
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        userPhone: user.phone,
        tenantName: user.tenancy?.name || 'No Tenant',
        lockStatus,
        lockReason,
        lockDuration: user.lockUntil ? Math.ceil((user.lockUntil - now) / (1000 * 60)) : null,
        loginAttempts: user.loginAttempts || 0,
        lastAttempt: user.updatedAt,
        lockedAt: user.lockUntil || user.updatedAt,
        isActive: user.isActive
      };
    });

    // Calculate stats
    const stats = {
      totalLocked: lockedAccounts.filter(acc => acc.lockStatus !== 'unlocked').length,
      autoLocked: lockedAccounts.filter(acc => acc.lockReason === 'failed_attempts').length,
      manualLocked: lockedAccounts.filter(acc => acc.lockReason === 'admin_action').length,
      unlocked: lockedAccounts.filter(acc => acc.lockStatus === 'unlocked').length,
      permanentlyBanned: lockedAccounts.filter(acc => acc.lockStatus === 'locked' && acc.lockReason === 'admin_action').length,
      byReason: {
        failed_attempts: lockedAccounts.filter(acc => acc.lockReason === 'failed_attempts').length,
        suspicious_activity: lockedAccounts.filter(acc => acc.lockReason === 'suspicious_activity').length,
        admin_action: lockedAccounts.filter(acc => acc.lockReason === 'admin_action').length,
        security_breach: 0, // TODO: Track security breaches
        policy_violation: 0 // TODO: Track policy violations
      },
      avgLockDuration: '2.5h'
    };

    res.json({
      success: true,
      data: {
        accounts: lockedAccounts,
        stats,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Get locked accounts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get locked accounts'
    });
  }
});

// @desc    Unlock account action
// @route   POST /api/support/users/locked-accounts/:id/unlock
// @access  Private (Platform Support)
const unlockAccountAction = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Unlock the account
    user.isActive = true;
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: 'ACCOUNT_UNLOCKED',
      module: 'PLATFORM_SUPPORT',
      details: {
        targetUserId: id,
        targetUserEmail: user.email,
        reason,
        previousLoginAttempts: user.loginAttempts
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Account unlocked successfully',
      data: {
        userId: id,
        isActive: user.isActive,
        loginAttempts: user.loginAttempts
      }
    });
  } catch (error) {
    console.error('Unlock account action error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unlock account'
    });
  }
});

// @desc    Review account action
// @route   POST /api/support/users/locked-accounts/:id/review
// @access  Private (Platform Support)
const reviewAccountAction = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, decision } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Log the review action
    await AuditLog.create({
      userId: req.user._id,
      action: 'ACCOUNT_REVIEWED',
      module: 'PLATFORM_SUPPORT',
      details: {
        targetUserId: id,
        targetUserEmail: user.email,
        reviewNotes: notes,
        reviewDecision: decision
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Account review completed',
      data: {
        userId: id,
        reviewDecision: decision,
        reviewNotes: notes
      }
    });
  } catch (error) {
    console.error('Review account action error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to review account'
    });
  }
});

// @desc    Ban account action
// @route   POST /api/support/users/locked-accounts/:id/ban
// @access  Private (Platform Support)
const banAccountAction = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, permanent = false } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Ban the account
    user.isActive = false;
    if (permanent) {
      user.permanentlyBanned = true;
      user.bannedReason = reason;
    } else {
      user.lockUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    }
    await user.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: permanent ? 'ACCOUNT_PERMANENTLY_BANNED' : 'ACCOUNT_TEMPORARILY_BANNED',
      module: 'PLATFORM_SUPPORT',
      details: {
        targetUserId: id,
        targetUserEmail: user.email,
        reason,
        permanent,
        lockUntil: user.lockUntil
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: `Account ${permanent ? 'permanently' : 'temporarily'} banned successfully`,
      data: {
        userId: id,
        banned: true,
        permanent,
        lockUntil: user.lockUntil
      }
    });
  } catch (error) {
    console.error('Ban account action error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to ban account'
    });
  }
});

// @desc    Approve unlock request
// @route   POST /api/support/users/locked-accounts/:id/approve-request
// @access  Private (Platform Support)
const approveUnlockRequest = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Approve and unlock
    user.isActive = true;
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: 'UNLOCK_REQUEST_APPROVED',
      module: 'PLATFORM_SUPPORT',
      details: {
        targetUserId: id,
        targetUserEmail: user.email,
        approvalNotes: notes
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Unlock request approved successfully',
      data: {
        userId: id,
        approved: true,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Approve unlock request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve unlock request'
    });
  }
});

// ==================== PAYMENT SUPPORT - ADVANCED FEATURES ====================

// @desc    Get refund requests
// @route   GET /api/support/payments/refunds
// @access  Private (Platform Support)
const getRefundRequests = asyncHandler(async (req, res) => {
  try {
    const { status, dateFrom, dateTo, page = 1, limit = 20 } = req.query;

    let query = {
      type: 'refund'
    };

    if (status) {
      query.status = status;
    }

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const refunds = await Transaction.find(query)
      .populate('customerId', 'name email phone')
      .populate('branchId', 'name location')
      .populate('orderId', 'orderNumber status')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(query);

    // Calculate stats
    const stats = {
      totalRequests: total,
      pending: await Transaction.countDocuments({ ...query, status: 'pending' }),
      approved: await Transaction.countDocuments({ ...query, status: 'approved' }),
      processed: await Transaction.countDocuments({ ...query, status: 'completed' }),
      rejected: await Transaction.countDocuments({ ...query, status: 'failed' }),
      totalAmount: refunds.reduce((sum, refund) => sum + refund.amount, 0)
    };

    res.json({
      success: true,
      data: {
        refunds,
        stats,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Get refund requests error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get refund requests'
    });
  }
});

// @desc    Process refund request
// @route   POST /api/support/payments/refunds/:id/process
// @access  Private (Platform Support)
const processRefundRequest = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason } = req.body; // action: 'approve' | 'reject' | 'process'

    const refund = await Transaction.findById(id);
    if (!refund) {
      return res.status(404).json({
        success: false,
        message: 'Refund request not found'
      });
    }

    // Update refund status based on action
    let newStatus = refund.status;
    switch (action) {
      case 'approve':
        newStatus = 'approved';
        break;
      case 'reject':
        newStatus = 'failed';
        break;
      case 'process':
        newStatus = 'completed';
        break;
    }

    refund.status = newStatus;
    refund.processedBy = req.user._id;
    refund.processedAt = new Date();
    refund.processingNotes = reason;
    await refund.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: `REFUND_${action.toUpperCase()}`,
      module: 'PLATFORM_SUPPORT',
      details: {
        refundId: id,
        transactionId: refund.transactionId,
        amount: refund.amount,
        reason,
        customerId: refund.customerId
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: `Refund ${action}ed successfully`,
      data: {
        refundId: id,
        status: newStatus,
        processedAt: refund.processedAt
      }
    });
  } catch (error) {
    console.error('Process refund request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund request'
    });
  }
});

// @desc    Get payment gateway logs
// @route   GET /api/support/payments/gateway-logs
// @access  Private (Platform Support)
const getPaymentGatewayLogs = asyncHandler(async (req, res) => {
  try {
    const { gateway, status, dateFrom, dateTo, page = 1, limit = 20 } = req.query;

    let query = {};

    if (gateway) {
      query.paymentGateway = gateway;
    }

    if (status) {
      query.status = status;
    }

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const logs = await Transaction.find(query)
      .populate('customerId', 'name email')
      .populate('orderId', 'orderNumber')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(query);

    // Calculate gateway stats
    const gatewayStats = await Transaction.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$paymentGateway',
          count: { $sum: 1 },
          successCount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          failureCount: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
          },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        logs,
        gatewayStats,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Get payment gateway logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment gateway logs'
    });
  }
});

// @desc    Retry failed transaction
// @route   POST /api/support/payments/transactions/:id/retry
// @access  Private (Platform Support)
const retryFailedTransaction = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const transaction = await Transaction.findById(id);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Update retry count and status
    transaction.retryCount = (transaction.retryCount || 0) + 1;
    transaction.status = 'pending';
    transaction.retryReason = reason;
    transaction.retriedBy = req.user._id;
    transaction.retriedAt = new Date();
    await transaction.save();

    // Log the retry action
    await AuditLog.create({
      userId: req.user._id,
      action: 'TRANSACTION_RETRY',
      module: 'PLATFORM_SUPPORT',
      details: {
        transactionId: id,
        retryCount: transaction.retryCount,
        reason,
        originalStatus: 'failed'
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Transaction retry initiated',
      data: {
        transactionId: id,
        retryCount: transaction.retryCount,
        status: transaction.status
      }
    });
  } catch (error) {
    console.error('Retry failed transaction error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retry transaction'
    });
  }
});

// ==================== SYSTEM MONITORING - ADVANCED FEATURES ====================

// @desc    Acknowledge system alert
// @route   POST /api/support/system/alerts/:id/acknowledge
// @access  Private (Platform Support)
const acknowledgeSystemAlert = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    // Log the acknowledgment
    await AuditLog.create({
      userId: req.user._id,
      action: 'SYSTEM_ALERT_ACKNOWLEDGED',
      module: 'PLATFORM_SUPPORT',
      details: {
        alertId: id,
        acknowledgedBy: req.user.name,
        notes
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Alert acknowledged successfully',
      data: {
        alertId: id,
        acknowledgedBy: req.user.name,
        acknowledgedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Acknowledge system alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to acknowledge alert'
    });
  }
});

// @desc    Resolve system alert
// @route   POST /api/support/system/alerts/:id/resolve
// @access  Private (Platform Support)
const resolveSystemAlert = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution, notes } = req.body;

    // Log the resolution
    await AuditLog.create({
      userId: req.user._id,
      action: 'SYSTEM_ALERT_RESOLVED',
      module: 'PLATFORM_SUPPORT',
      details: {
        alertId: id,
        resolvedBy: req.user.name,
        resolution,
        notes
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Alert resolved successfully',
      data: {
        alertId: id,
        resolvedBy: req.user.name,
        resolvedAt: new Date(),
        resolution
      }
    });
  } catch (error) {
    console.error('Resolve system alert error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve alert'
    });
  }
});

// @desc    Get detailed system health metrics
// @route   GET /api/support/system/health/detailed
// @access  Private (Platform Support)
const getDetailedSystemHealth = asyncHandler(async (req, res) => {
  try {
    // Get detailed metrics from various sources
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Database performance metrics
    const dbMetrics = {
      connectionCount: 50, // Mock - would come from DB monitoring
      queryPerformance: {
        averageQueryTime: 45,
        slowQueries: 2,
        totalQueries: 1250
      },
      indexUsage: 95.5,
      diskUsage: 68.2
    };

    // API performance metrics
    const apiMetrics = {
      requestsPerMinute: 125,
      averageResponseTime: 180,
      errorRate: 0.5,
      endpointPerformance: [
        { endpoint: '/api/orders', avgTime: 120, requests: 450 },
        { endpoint: '/api/payments', avgTime: 250, requests: 320 },
        { endpoint: '/api/users', avgTime: 95, requests: 280 }
      ]
    };

    // Payment gateway health
    const paymentHealth = {
      razorpay: { status: 'healthy', responseTime: 200, successRate: 98.5 },
      stripe: { status: 'healthy', responseTime: 180, successRate: 99.1 },
      payu: { status: 'degraded', responseTime: 450, successRate: 95.2 }
    };

    // System resources
    const systemResources = {
      cpu: { usage: 45.2, cores: 4 },
      memory: { usage: 68.5, total: 16384, available: 5120 },
      disk: { usage: 72.1, total: 500, available: 139 },
      network: { inbound: 125.5, outbound: 89.3 }
    };

    res.json({
      success: true,
      data: {
        timestamp: now,
        database: dbMetrics,
        api: apiMetrics,
        paymentGateways: paymentHealth,
        systemResources,
        overallHealth: 'healthy'
      }
    });
  } catch (error) {
    console.error('Get detailed system health error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get detailed system health'
    });
  }
});

// ==================== TICKET MANAGEMENT ACTIONS ====================

// @desc    Resolve support ticket
// @route   POST /api/support/tickets/:id/resolve
// @access  Private (Platform Support)
const resolveTicket = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution, status = 'resolved' } = req.body;

    // Import TenantTicket model for platform support tickets
    const TenantTicket = require('../../models/TenantTicket');

    const ticket = await TenantTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Update ticket status
    ticket.status = status;
    ticket.resolution = resolution;
    ticket.resolvedBy = req.user._id;
    ticket.resolvedAt = new Date();
    await ticket.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: 'TICKET_RESOLVED',
      module: 'PLATFORM_SUPPORT',
      details: {
        ticketId: id,
        ticketNumber: ticket.ticketNumber,
        resolution,
        resolvedBy: req.user.name
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Ticket resolved successfully',
      data: {
        ticketId: id,
        status: ticket.status,
        resolvedAt: ticket.resolvedAt
      }
    });
  } catch (error) {
    console.error('Resolve ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve ticket'
    });
  }
});

// @desc    Escalate support ticket
// @route   POST /api/support/tickets/:id/escalate
// @access  Private (Platform Support)
const escalateTicket = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { escalationReason, escalatedTo = 'supervisor' } = req.body;

    // Import TenantTicket model for platform support tickets
    const TenantTicket = require('../../models/TenantTicket');

    const ticket = await TenantTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Update ticket status
    ticket.status = 'escalated';
    ticket.escalatedTo = escalatedTo;
    ticket.escalationReason = escalationReason;
    ticket.escalatedBy = req.user._id;
    ticket.escalatedAt = new Date();
    await ticket.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: 'TICKET_ESCALATED',
      module: 'PLATFORM_SUPPORT',
      details: {
        ticketId: id,
        ticketNumber: ticket.ticketNumber,
        escalationReason,
        escalatedTo,
        escalatedBy: req.user.name
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Ticket escalated successfully',
      data: {
        ticketId: id,
        status: ticket.status,
        escalatedTo: ticket.escalatedTo,
        escalatedAt: ticket.escalatedAt
      }
    });
  } catch (error) {
    console.error('Escalate ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to escalate ticket'
    });
  }
});

// @desc    Update ticket status
// @route   PUT /api/support/tickets/:id/status
// @access  Private (Platform Support)
const updateTicketStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    // Import TenantTicket model for platform support tickets
    const TenantTicket = require('../../models/TenantTicket');

    const ticket = await TenantTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const oldStatus = ticket.status;
    ticket.status = status;
    ticket.statusNotes = notes;
    ticket.statusUpdatedBy = req.user._id;
    ticket.statusUpdatedAt = new Date();
    await ticket.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: 'TICKET_STATUS_UPDATED',
      module: 'PLATFORM_SUPPORT',
      details: {
        ticketId: id,
        ticketNumber: ticket.ticketNumber,
        oldStatus,
        newStatus: status,
        notes,
        updatedBy: req.user.name
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Ticket status updated successfully',
      data: {
        ticketId: id,
        oldStatus,
        newStatus: status,
        updatedAt: ticket.statusUpdatedAt
      }
    });
  } catch (error) {
    console.error('Update ticket status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ticket status'
    });
  }
});

// @desc    Assign ticket to support agent
// @route   POST /api/support/tickets/:id/assign
// @access  Private (Platform Support)
const assignTicket = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedTo, notes } = req.body;

    // Import TenantTicket model for platform support tickets
    const TenantTicket = require('../../models/TenantTicket');

    const ticket = await TenantTicket.findById(id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const previousAssignee = ticket.assignedTo;
    ticket.assignedTo = assignedTo;
    ticket.assignmentNotes = notes;
    ticket.assignedBy = req.user._id;
    ticket.assignedAt = new Date();
    await ticket.save();

    // Log the action
    await AuditLog.create({
      userId: req.user._id,
      action: 'TICKET_ASSIGNED',
      module: 'PLATFORM_SUPPORT',
      details: {
        ticketId: id,
        ticketNumber: ticket.ticketNumber,
        previousAssignee,
        newAssignee: assignedTo,
        notes,
        assignedBy: req.user.name
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      success: true,
      message: 'Ticket assigned successfully',
      data: {
        ticketId: id,
        assignedTo,
        assignedAt: ticket.assignedAt
      }
    });
  } catch (error) {
    console.error('Assign ticket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign ticket'
    });
  }
});

// Helper functions for financial audit
function categorizeRefundReason(reason) {
  if (!reason) return 'customer_request';
  
  const lowerReason = reason.toLowerCase();
  
  if (lowerReason.includes('quality') || lowerReason.includes('damage')) {
    return 'quality_issue';
  } else if (lowerReason.includes('delay') || lowerReason.includes('late')) {
    return 'service_delay';
  } else if (lowerReason.includes('error') || lowerReason.includes('technical')) {
    return 'technical_error';
  } else if (lowerReason.includes('policy') || lowerReason.includes('violation')) {
    return 'policy_violation';
  } else if (lowerReason.includes('fraud') || lowerReason.includes('suspicious')) {
    return 'fraud_prevention';
  } else {
    return 'customer_request';
  }
}

function mapPaymentStatusToRefundStatus(paymentStatus) {
  switch (paymentStatus) {
    case 'refund_requested':
      return 'pending';
    case 'refund_processing':
      return 'approved';
    case 'refunded':
      return 'completed';
    case 'refund_rejected':
      return 'rejected';
    default:
      return 'pending';
  }
}

function calculateRefundRiskFlags(order) {
  const flags = [];
  
  // Check for high value refund
  if ((order.totalAmount || 0) > 5000) {
    flags.push('HIGH_VALUE_REFUND');
  }
  
  // Check for multiple refunds (would need additional query in real implementation)
  // For now, randomly assign some risk flags for demo
  if (Math.random() > 0.8) {
    flags.push('MULTIPLE_RECENT_REFUNDS');
  }
  
  return flags;
}

// ==================== FINANCIAL AUDIT METHODS ====================

// Get refund audit data for financial oversight
const getRefundAuditData = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      category, 
      tenant, 
      range = '30d', 
      search 
    } = req.query;

    const Order = require('../../models/Order');
    const User = require('../../models/User');
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (range) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    // Build query for refunded orders
    const query = {
      paymentStatus: { $in: ['refunded', 'refund_requested', 'refund_processing'] },
      createdAt: { $gte: startDate, $lte: endDate }
    };

    if (status && status !== 'all') {
      query.paymentStatus = status;
    }

    if (tenant && tenant !== 'all') {
      query.tenancyId = tenant;
    }

    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { 'customer.email': { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get refunded orders
    const refundedOrders = await Order.find(query)
      .populate('tenancyId', 'businessName tenancyName')
      .populate('customerId', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Order.countDocuments(query);

    // Transform to refund records format
    const refunds = refundedOrders.map(order => ({
      _id: order._id,
      refundId: `REF-${order.orderNumber}`,
      originalTransactionId: order.orderNumber,
      tenantId: order.tenancyId?._id || 'unknown',
      tenantName: order.tenancyId?.tenancyName || 'Unknown Tenant',
      businessName: order.tenancyId?.businessName || 'Unknown Business',
      customerId: order.customerId?._id || 'unknown',
      customerEmail: order.customerId?.email || order.customer?.email || 'Unknown',
      amount: order.totalAmount || order.pricing?.total || 0,
      originalAmount: order.totalAmount || order.pricing?.total || 0,
      refundType: 'full', // Assume full refund for now
      reason: order.refundReason || 'Customer request',
      category: categorizeRefundReason(order.refundReason),
      status: mapPaymentStatusToRefundStatus(order.paymentStatus),
      requestedAt: order.refundRequestedAt || order.updatedAt,
      approvedAt: order.refundApprovedAt,
      processedAt: order.refundProcessedAt,
      completedAt: order.refundCompletedAt,
      approvedBy: order.refundApprovedBy,
      processedBy: order.refundProcessedBy,
      paymentMethod: order.paymentMethod || 'Unknown',
      processingFee: Math.round((order.totalAmount || 0) * 0.02), // 2% processing fee
      notes: order.refundNotes || [],
      attachments: order.refundAttachments || [],
      customerSatisfaction: order.customerSatisfaction,
      followUpRequired: order.paymentStatus === 'refund_requested',
      riskFlags: calculateRefundRiskFlags(order),
      relatedRefunds: []
    }));

    // Calculate statistics
    const stats = {
      totalRefunds: total,
      totalAmount: refunds.reduce((sum, r) => sum + r.amount, 0),
      pendingApproval: refunds.filter(r => r.status === 'pending').length,
      averageProcessingTime: 4.2, // TODO: Calculate from actual data
      refundRate: 2.8, // TODO: Calculate from order data
      suspiciousRefunds: refunds.filter(r => r.riskFlags.length > 0).length
    };

    res.json({
      success: true,
      data: {
        refunds,
        stats,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching refund audit data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch refund audit data'
    });
  }
};

// Get financial audit reports
const getFinancialAuditReports = async (req, res) => {
  try {
    const { range = '30d' } = req.query;

    const Order = require('../../models/Order');
    
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (range) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    // Get financial metrics from orders
    const financialAggregation = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: { $ifNull: ['$totalAmount', { $ifNull: ['$pricing.total', 0] }] } },
          totalTransactions: { $sum: 1 },
          successfulTransactions: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] }
          },
          refundedTransactions: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, 1, 0] }
          },
          refundedAmount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, { $ifNull: ['$totalAmount', 0] }, 0] }
          },
          failedTransactions: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'failed'] }, 1, 0] }
          }
        }
      }
    ]);

    const metrics = financialAggregation[0] || {
      totalRevenue: 0,
      totalTransactions: 0,
      successfulTransactions: 0,
      refundedTransactions: 0,
      refundedAmount: 0,
      failedTransactions: 0
    };

    // Calculate derived metrics
    const successRate = metrics.totalTransactions > 0 
      ? (metrics.successfulTransactions / metrics.totalTransactions) * 100 
      : 0;
    
    const refundRate = metrics.totalTransactions > 0 
      ? (metrics.refundedTransactions / metrics.totalTransactions) * 100 
      : 0;

    const chargebackRate = 0.8; // Mock data - TODO: implement real chargeback tracking
    const averageTransactionValue = metrics.totalTransactions > 0 
      ? metrics.totalRevenue / metrics.totalTransactions 
      : 0;

    // Get previous period for growth calculation
    const previousStartDate = new Date(startDate);
    previousStartDate.setTime(startDate.getTime() - (endDate.getTime() - startDate.getTime()));
    
    const previousMetrics = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: previousStartDate, $lte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: { $ifNull: ['$totalAmount', { $ifNull: ['$pricing.total', 0] }] } }
        }
      }
    ]);

    const previousRevenue = previousMetrics[0]?.totalRevenue || 0;
    const monthlyGrowth = previousRevenue > 0 
      ? ((metrics.totalRevenue - previousRevenue) / previousRevenue) * 100
      : (metrics.totalRevenue > 0 ? 100 : 0);

    // Get transaction trends
    const trends = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: { $ifNull: ['$totalAmount', { $ifNull: ['$pricing.total', 0] }] } },
          transactions: { $sum: 1 },
          refunds: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ]);

    // Get tenant financial analysis
    const tenantFinancials = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$tenancyId',
          revenue: { $sum: { $ifNull: ['$totalAmount', { $ifNull: ['$pricing.total', 0] }] } },
          transactions: { $sum: 1 },
          refunds: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'refunded'] }, 1, 0] }
          }
        }
      },
      {
        $lookup: {
          from: 'tenancies',
          localField: '_id',
          foreignField: '_id',
          as: 'tenancy'
        }
      },
      {
        $project: {
          tenantId: '$_id',
          tenantName: { $arrayElemAt: ['$tenancy.businessName', 0] },
          revenue: 1,
          transactions: 1,
          refunds: 1,
          refundRate: {
            $cond: [
              { $gt: ['$transactions', 0] },
              { $multiply: [{ $divide: ['$refunds', '$transactions'] }, 100] },
              0
            ]
          },
          riskScore: {
            $cond: [
              { $gt: [{ $divide: ['$refunds', '$transactions'] }, 0.05] },
              4,
              { $cond: [
                { $gt: [{ $divide: ['$refunds', '$transactions'] }, 0.03] },
                3,
                { $cond: [
                  { $gt: [{ $divide: ['$refunds', '$transactions'] }, 0.02] },
                  2,
                  1
                ]}
              ]}
            ]
          }
        }
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 }
    ]);

    const finalMetrics = {
      totalRevenue: metrics.totalRevenue,
      totalTransactions: metrics.totalTransactions,
      successRate: Math.round(successRate * 10) / 10,
      refundRate: Math.round(refundRate * 10) / 10,
      chargebackRate,
      averageTransactionValue: Math.round(averageTransactionValue),
      monthlyGrowth: Math.round(monthlyGrowth * 10) / 10,
      discrepancies: 0 // TODO: Implement discrepancy detection
    };

    res.json({
      success: true,
      data: {
        metrics: finalMetrics,
        trends,
        tenantFinancials
      }
    });

  } catch (error) {
    console.error('Error fetching financial audit reports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch financial audit reports'
    });
  }
};

module.exports = {
  searchOrders,
  getOrderTimeline,
  getStuckOrders,
  
  // Payment Support
  getPaymentIssues,
  lookupTransaction,
  
  // Payment Support - Advanced Features
  getRefundRequests,
  processRefundRequest,
  getPaymentGatewayLogs,
  retryFailedTransaction,
  
  // User Assistance
  searchUsers,
  resendUserOTP,
  unlockUserAccount,
  resetUserPassword,
  
  // User Assistance - Account Recovery
  getRecoveryRequests,
  approveRecoveryRequest,
  rejectRecoveryRequest,
  resendRecoveryRequest,
  
  // User Assistance - Password Reset Management
  getPasswordResetRequests,
  generatePasswordReset,
  resendPasswordReset,
  expirePasswordReset,
  
  // User Assistance - Account Unlock Management
  getLockedAccounts,
  unlockAccountAction,
  reviewAccountAction,
  banAccountAction,
  approveUnlockRequest,
  
  // Live Chat Support
  getActiveChats,
  getChatHistoryList,
  getChatHistory,
  sendChatMessage,
  
  // Tenant Chat Support
  createChatSession,
  getMyChatSessions,
  getActiveSession,
  sendTenantMessage,
  
  // Safe Impersonation
  createImpersonationSession,
  endImpersonationSession,
  getActiveImpersonationSessions,
  
  // System Monitoring
  getSystemAlerts,
  getPlatformHealth,
  getTenantHeatmap,
  
  // System Monitoring - Advanced Features
  acknowledgeSystemAlert,
  resolveSystemAlert,
  getDetailedSystemHealth,
  
  // Escalation Matrix
  getEscalationMatrix,
  
  // Support Audit Logs
  getSupportAuditLogs,
  
  // Financial Audit Methods
  getRefundAuditData,
  getFinancialAuditReports,
  
  // Ticket Management Actions
  resolveTicket,
  escalateTicket,
  updateTicketStatus,
  assignTicket,
  
  // Debug endpoint
  debugChatSessions
};