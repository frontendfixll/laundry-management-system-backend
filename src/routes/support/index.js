const express = require('express');
const { protect, requireSupport } = require('../../middlewares/auth');
const { injectTenancyFromUser } = require('../../middlewares/tenancyMiddleware');
const ticketRoutes = require('./ticketRoutes');
const knowledgeBaseRoutes = require('./knowledgeBaseRoutes');

const router = express.Router();

// Apply authentication and tenancy injection
router.use(protect);
router.use(requireSupport);
router.use(injectTenancyFromUser);

// Mount ticket routes
router.use('/tickets', ticketRoutes);

// Mount knowledge base routes
router.use('/knowledge-base', knowledgeBaseRoutes);

// Support settings routes
router.get('/settings', async (req, res) => {
  try {
    const user = req.user;
    const settings = {
      profile: {
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        department: 'Support'
      },
      notifications: {
        emailNotifications: user.preferences?.emailNotifications ?? true,
        pushNotifications: user.preferences?.pushNotifications ?? true,
        ticketAssigned: user.preferences?.ticketAssigned ?? true,
        ticketUpdated: user.preferences?.ticketUpdated ?? true,
        newMessage: user.preferences?.newMessage ?? true
      },
      preferences: {
        autoAssignTickets: user.preferences?.autoAssignTickets ?? false,
        showClosedTickets: user.preferences?.showClosedTickets ?? false,
        defaultTicketView: user.preferences?.defaultTicketView ?? 'assigned',
        ticketsPerPage: user.preferences?.ticketsPerPage ?? 10
      }
    };
    
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
});

router.put('/settings', async (req, res) => {
  try {
    const User = require('../../models/User');
    const userId = req.user._id;
    const { profile, notifications, preferences } = req.body;
    
    const updateData = {};
    if (profile) {
      if (profile.name) updateData.name = profile.name;
      if (profile.phone) updateData.phone = profile.phone;
    }
    
    if (notifications || preferences) {
      updateData.preferences = {
        ...req.user.preferences,
        ...notifications,
        ...preferences
      };
    }
    
    await User.findByIdAndUpdate(userId, updateData);
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
});

// Messages routes
router.get('/messages', async (req, res) => {
  try {
    const Ticket = require('../../models/Ticket');
    const supportUserId = req.user._id;
    const tenancyId = req.tenancyId;
    
    console.log('🔍 Fetching messages for support user:', supportUserId, 'in tenancy:', tenancyId);
    
    // Get tickets with messages for this support user's tenancy
    const tickets = await Ticket.find({
      tenancy: tenancyId,
      $or: [
        { assignedTo: supportUserId },
        { assignedTo: null, status: 'open' }
      ]
    })
    .populate('raisedBy', 'name email role')
    .populate('messages.sender', 'name email role')
    .select('ticketNumber title messages raisedBy priority status createdAt')
    .sort({ updatedAt: -1 })
    .limit(50);
    
    console.log('📧 Found tickets with messages:', tickets.length);
    
    // Transform tickets into message format
    const messages = [];
    tickets.forEach(ticket => {
      if (ticket.messages && ticket.messages.length > 0) {
        // Get the latest message from each ticket
        const latestMessage = ticket.messages[ticket.messages.length - 1];
        messages.push({
          _id: `${ticket._id}-${latestMessage._id}`,
          subject: `Re: ${ticket.title}`,
          content: latestMessage.message,
          from: {
            name: latestMessage.sender?.name || 'Unknown',
            email: latestMessage.sender?.email || '',
            role: latestMessage.sender?.role || 'customer'
          },
          to: {
            name: req.user.name,
            email: req.user.email,
            role: 'support'
          },
          status: ticket.assignedTo ? 'read' : 'unread',
          priority: ticket.priority || 'medium',
          createdAt: latestMessage.timestamp || ticket.createdAt,
          ticketId: ticket._id
        });
      }
    });
    
    console.log('📤 Sending messages:', messages.length);
    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
});

router.post('/messages/:messageId/read', async (req, res) => {
  try {
    // Extract ticket ID from message ID
    const messageId = req.params.messageId;
    const ticketId = messageId.split('-')[0];
    
    const Ticket = require('../../models/Ticket');
    const supportUserId = req.user._id;
    const tenancyId = req.tenancyId;
    
    // Find and assign ticket if unassigned
    const ticket = await Ticket.findOne({
      _id: ticketId,
      tenancy: tenancyId
    });
    
    if (ticket && !ticket.assignedTo) {
      ticket.assignedTo = supportUserId;
      ticket.status = 'in_progress';
      await ticket.save();
    }
    
    res.json({ success: true, message: 'Message marked as read' });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ success: false, message: 'Failed to mark message as read' });
  }
});

router.post('/messages/:messageId/reply', async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const ticketId = messageId.split('-')[0];
    const { content } = req.body;
    
    const Ticket = require('../../models/Ticket');
    const supportUserId = req.user._id;
    const tenancyId = req.tenancyId;
    
    const ticket = await Ticket.findOne({
      _id: ticketId,
      tenancy: tenancyId
    });
    
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    
    // Add reply message
    await ticket.addMessage(supportUserId, content, false);
    
    // Update ticket status if needed
    if (ticket.status === 'open') {
      ticket.status = 'in_progress';
      ticket.assignedTo = supportUserId;
      await ticket.save();
    }
    
    res.json({ success: true, message: 'Reply sent successfully' });
  } catch (error) {
    console.error('Error sending reply:', error);
    res.status(500).json({ success: false, message: 'Failed to send reply' });
  }
});

// Performance metrics routes
router.get('/performance', async (req, res) => {
  try {
    const Ticket = require('../../models/Ticket');
    const supportUserId = req.user._id;
    const tenancyId = req.tenancyId;
    const { timeRange = '7d' } = req.query;
    
    // Calculate date range
    const days = timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Get tickets resolved by this support user in the time range
    const resolvedTickets = await Ticket.find({
      tenancy: tenancyId,
      resolvedBy: supportUserId,
      resolvedAt: { $gte: startDate }
    });
    
    // Get all tickets assigned to this support user
    const allAssignedTickets = await Ticket.find({
      tenancy: tenancyId,
      assignedTo: supportUserId
    });
    
    // Calculate metrics
    const ticketsResolved = resolvedTickets.length;
    const totalTickets = allAssignedTickets.length;
    const activeTickets = allAssignedTickets.filter(t => ['open', 'in_progress'].includes(t.status)).length;
    const resolutionRate = totalTickets > 0 ? (ticketsResolved / totalTickets) * 100 : 0;
    
    // Calculate average response time (mock data for now)
    const averageResponseTime = resolvedTickets.length > 0 ? 
      resolvedTickets.reduce((sum, ticket) => {
        const responseTime = ticket.firstResponseAt ? 
          (new Date(ticket.firstResponseAt) - new Date(ticket.createdAt)) / (1000 * 60 * 60) : 24;
        return sum + responseTime;
      }, 0) / resolvedTickets.length : 12;
    
    // Mock customer satisfaction (would come from surveys)
    const customerSatisfaction = 87.5;
    
    const metrics = {
      ticketsResolved,
      averageResponseTime: Math.round(averageResponseTime * 10) / 10,
      customerSatisfaction,
      activeTickets,
      totalTickets,
      resolutionRate: Math.round(resolutionRate * 10) / 10,
      responseTimeTarget: 24,
      satisfactionTarget: 90
    };
    
    res.json({ success: true, data: metrics });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch performance metrics' });
  }
});

module.exports = router;