const express = require('express');
const router = express.Router();
const platformSupportController = require('../../controllers/support/platformSupportController');
const { protect } = require('../../middlewares/auth');

// ==================== TENANT CHAT ENDPOINTS ====================

// @route   POST /api/tenant/chat/create
// @desc    Create new chat session (for tenant admins)
// @access  Private (Tenant Admin)
router.post('/create', protect, platformSupportController.createChatSession);

// @route   GET /api/tenant/chat/sessions
// @desc    Get all chat sessions for tenant admin
// @access  Private (Tenant Admin)
router.get('/sessions', protect, platformSupportController.getMyChatSessions);

// @route   GET /api/tenant/chat/active-session
// @desc    Get active chat session for sidebar chatbox
// @access  Private (Tenant Admin)
router.get('/active-session', protect, platformSupportController.getActiveSession);

// @route   GET /api/tenant/chat/:sessionId/messages
// @desc    Get messages for a specific chat session
// @access  Private (Tenant Admin)
router.get('/:sessionId/messages', protect, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    console.log(`🔍 [Tenant API] Getting messages for session: ${sessionId}`);
    console.log(`🔍 [Tenant API] User: ${req.user.name} (${req.user._id})`);
    
    const ChatSession = require('../../models/ChatSession');
    
    // CRITICAL FIX: Always try BOTH lookup methods and use the one that has messages
    let chatSession = null;
    let lookupMethod = 'none';
    
    // Method 1: Try MongoDB ObjectId first
    if (sessionId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log(`🔍 [Tenant API] Trying MongoDB ID lookup: ${sessionId}`);
      try {
        chatSession = await ChatSession.findById(sessionId);
        if (chatSession) {
          lookupMethod = 'ObjectId';
          console.log(`✅ [Tenant API] Found by MongoDB ID, messages: ${chatSession.messages?.length || 0}`);
        }
      } catch (e) {
        console.log(`❌ [Tenant API] MongoDB ID lookup failed: ${e.message}`);
      }
    }
    
    // Method 2: Try custom sessionId if not found or if it's not a MongoDB ID
    if (!chatSession) {
      console.log(`🔍 [Tenant API] Trying custom sessionId lookup: ${sessionId}`);
      try {
        chatSession = await ChatSession.findOne({ sessionId: sessionId });
        if (chatSession) {
          lookupMethod = 'CustomSessionId';
          console.log(`✅ [Tenant API] Found by custom sessionId, messages: ${chatSession.messages?.length || 0}`);
        }
      } catch (e) {
        console.log(`❌ [Tenant API] Custom sessionId lookup failed: ${e.message}`);
      }
    }
    
    // Method 3: If still not found and sessionId looks like custom format, try to find by MongoDB ID
    if (!chatSession && !sessionId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log(`🔍 [Tenant API] Trying to find MongoDB ID for custom sessionId: ${sessionId}`);
      try {
        const sessionByCustomId = await ChatSession.findOne({ sessionId: sessionId });
        if (sessionByCustomId) {
          // Now try to find the same session by its MongoDB ID
          chatSession = await ChatSession.findById(sessionByCustomId._id);
          if (chatSession) {
            lookupMethod = 'CustomToMongoDB';
            console.log(`✅ [Tenant API] Found via custom->MongoDB mapping, messages: ${chatSession.messages?.length || 0}`);
          }
        }
      } catch (e) {
        console.log(`❌ [Tenant API] Custom->MongoDB lookup failed: ${e.message}`);
      }
    }
    
    // Method 4: Last resort - find any session for this user and check if it matches
    if (!chatSession) {
      console.log(`🔍 [Tenant API] Last resort: searching all user sessions for match`);
      try {
        const userSessions = await ChatSession.find({ customerId: req.user._id });
        console.log(`🔍 [Tenant API] User has ${userSessions.length} total sessions`);
        
        // Try to find a session that matches either ID
        for (const session of userSessions) {
          if (session._id.toString() === sessionId || session.sessionId === sessionId) {
            chatSession = session;
            lookupMethod = 'UserSessionScan';
            console.log(`✅ [Tenant API] Found via user session scan, messages: ${chatSession.messages?.length || 0}`);
            break;
          }
        }
        
        // If still not found, log all available sessions for debugging
        if (!chatSession) {
          console.log(`🔍 [Tenant API] Available sessions for debugging:`);
          userSessions.forEach((s, index) => {
            console.log(`   ${index + 1}. MongoDB ID: ${s._id}, Custom ID: ${s.sessionId}, Messages: ${s.messages?.length || 0}`);
          });
        }
      } catch (e) {
        console.log(`❌ [Tenant API] User session scan failed: ${e.message}`);
      }
    }
    
    if (!chatSession) {
      console.log(`❌ [Tenant API] Chat session not found with any method: ${sessionId}`);
      
      return res.status(404).json({
        success: false,
        message: 'Chat session not found',
        debug: {
          searchedSessionId: sessionId,
          lookupMethod: 'all_methods_failed',
          userId: req.user._id
        }
      });
    }

    console.log(`✅ [Tenant API] Found session: ${chatSession.sessionId} (${chatSession._id})`);
    console.log(`🔍 [Tenant API] Lookup method: ${lookupMethod}`);
    console.log(`🔍 [Tenant API] Session customer: ${chatSession.customerId}`);
    console.log(`🔍 [Tenant API] Request user: ${req.user._id}`);
    console.log(`🔍 [Tenant API] Total messages in session: ${chatSession.messages?.length || 0}`);

    // Verify user owns this session
    if (chatSession.customerId.toString() !== req.user._id.toString()) {
      console.log(`❌ [Tenant API] Access denied - user doesn't own session`);
      console.log(`🔍 [Tenant API] Session owner: ${chatSession.customerId}, Request user: ${req.user._id}`);
      return res.status(403).json({
        success: false,
        message: 'Access denied - session ownership mismatch'
      });
    }

    // Mark messages as read by customer
    if (chatSession.unreadCount && chatSession.unreadCount.customer > 0) {
      chatSession.unreadCount.customer = 0;
      await chatSession.save();
      console.log(`📖 [Tenant API] Marked messages as read by customer`);
    }

    // Return messages sorted by timestamp (chronological order) with enhanced logging
    const messages = chatSession.messages
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) // Sort by timestamp ascending
      .map(msg => ({
        id: msg._id,
        sender: {
          name: msg.senderName,
          role: msg.senderRole
        },
        message: msg.message,
        timestamp: msg.createdAt,
        isFromSupport: msg.senderRole === 'platform_support',
        messageType: msg.messageType || 'text'
      }));

    console.log(`📨 [Tenant API] Returning ${messages.length} messages:`);
    messages.forEach((msg, index) => {
      console.log(`   ${index + 1}. [${msg.sender.role}] ${msg.sender.name}: "${msg.message.substring(0, 50)}..." (isFromSupport: ${msg.isFromSupport})`);
    });

    // Count support messages specifically
    const supportMessages = messages.filter(msg => msg.isFromSupport);
    console.log(`🎯 [Tenant API] Support messages in response: ${supportMessages.length}`);
    console.log(`🔗 [Tenant API] Session identifiers - MongoDB ID: ${chatSession._id}, Custom ID: ${chatSession.sessionId}`);

    // CRITICAL DEBUG: Log raw message data to identify why isFromSupport might be false
    if (supportMessages.length === 0 && messages.length > 0) {
      console.log(`🔍 [Tenant API] DEBUGGING: No support messages found, checking raw data...`);
      chatSession.messages.forEach((rawMsg, index) => {
        console.log(`   Raw ${index + 1}: senderRole="${rawMsg.senderRole}", senderName="${rawMsg.senderName}"`);
        console.log(`      isFromSupport would be: ${rawMsg.senderRole === 'platform_support'}`);
      });
    }

    res.json({
      success: true,
      data: {
        messages,
        sessionInfo: {
          sessionId: chatSession.sessionId,
          mongoId: chatSession._id,
          totalMessages: messages.length,
          supportMessages: supportMessages.length,
          lastActivity: chatSession.lastActivity,
          lookupMethod: lookupMethod
        }
      }
    });
  } catch (error) {
    console.error('❌ [Tenant API] Error getting tenant chat history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get chat history'
    });
  }
});

// @route   POST /api/tenant/chat/:sessionId/message
// @desc    Send message to a specific chat session
// @access  Private (Tenant Admin)
router.post('/:sessionId/message', protect, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message, messageType = 'text' } = req.body;
    
    console.log(`📤 [Tenant API] Sending message to session: ${sessionId}`);
    console.log(`📤 [Tenant API] From: ${req.user.name} (${req.user._id})`);
    console.log(`📤 [Tenant API] Message: "${message.substring(0, 50)}..."`);
    
    const ChatSession = require('../../models/ChatSession');
    const AuditLog = require('../../models/AuditLog');
    
    // ENHANCED SESSION LOOKUP: Try both MongoDB _id and sessionId field with comprehensive fallback
    let chatSession;
    
    // Check if sessionId looks like a MongoDB ObjectId (24 hex characters)
    if (sessionId.match(/^[0-9a-fA-F]{24}$/)) {
      console.log(`🔍 [Tenant API] Looking up by MongoDB ID: ${sessionId}`);
      chatSession = await ChatSession.findById(sessionId);
      
      // If not found by ObjectId, try to find by sessionId field as fallback
      if (!chatSession) {
        console.log(`🔍 [Tenant API] ObjectId lookup failed, trying sessionId field...`);
        chatSession = await ChatSession.findOne({ sessionId: sessionId });
      }
    } else {
      console.log(`🔍 [Tenant API] Looking up by custom sessionId: ${sessionId}`);
      // Find by sessionId field (custom string like "CHAT-1769589050170-h03537zds")
      chatSession = await ChatSession.findOne({ sessionId: sessionId });
      
      // If not found by sessionId field, try ObjectId as fallback (if it's 24 chars)
      if (!chatSession && sessionId.length === 24) {
        console.log(`🔍 [Tenant API] SessionId lookup failed, trying ObjectId...`);
        try {
          chatSession = await ChatSession.findById(sessionId);
        } catch (e) {
          console.log(`🔍 [Tenant API] ObjectId fallback failed: ${e.message}`);
        }
      }
    }
    
    if (!chatSession) {
      console.log(`❌ [Tenant API] Chat session not found with any method: ${sessionId}`);
      
      // Debug: List all available sessions for this user
      const userSessions = await ChatSession.find({ customerId: req.user._id }).limit(5);
      console.log(`🔍 [Tenant API] Available sessions for user:`, 
        userSessions.map(s => ({ 
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
          userSessions: userSessions.map(s => ({ 
            _id: s._id, 
            sessionId: s.sessionId 
          }))
        }
      });
    }

    console.log(`✅ [Tenant API] Found session: ${chatSession.sessionId} (${chatSession._id})`);

    // Verify user owns this session
    if (chatSession.customerId.toString() !== req.user._id.toString()) {
      console.log(`❌ [Tenant API] Access denied - user doesn't own session`);
      console.log(`🔍 [Tenant API] Session owner: ${chatSession.customerId}, Request user: ${req.user._id}`);
      return res.status(403).json({
        success: false,
        message: 'Access denied - session ownership mismatch'
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

    console.log(`💾 [Tenant API] Adding message with senderRole: ${newMessage.senderRole}`);

    // Add message to session
    chatSession.messages.push(newMessage);
    
    // Update unread count for support
    chatSession.unreadCount.support += 1;
    chatSession.unreadCount.customer = 0; // Reset customer unread count
    
    // Update last activity
    chatSession.lastActivity = new Date();

    await chatSession.save();
    console.log(`✅ [Tenant API] Session saved with ${chatSession.messages.length} total messages`);
    console.log(`🔗 [Tenant API] Session identifiers - MongoDB ID: ${chatSession._id}, Custom ID: ${chatSession.sessionId}`);

    // Log the message (with error handling)
    try {
      await AuditLog.create({
        userId: req.user._id,
        userEmail: req.user.email || 'unknown@email.com',
        userType: 'admin',
        action: 'TENANT_CHAT_MESSAGE_SENT',
        module: 'TENANT_SUPPORT',
        category: 'system',
        description: `Message sent by ${req.user.name}`,
        status: 'success',
        details: {
          sessionId: chatSession.sessionId,
          mongoId: chatSession._id,
          messageLength: message.length,
          messageType,
          lookupMethod: sessionId.match(/^[0-9a-fA-F]{24}$/) ? 'ObjectId' : 'CustomSessionId'
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      console.log(`📝 [Tenant API] Audit log created`);
    } catch (auditError) {
      console.log('⚠️ [Tenant API] Audit log creation failed (non-critical):', auditError.message);
    }

    const addedMessage = chatSession.messages[chatSession.messages.length - 1];
    console.log(`📨 [Tenant API] Message added with ID: ${addedMessage._id}`);

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
          isFromSupport: false,
          messageType: addedMessage.messageType,
          status: addedMessage.status
        }
      }
    });
  } catch (error) {
    console.error('❌ [Tenant API] Error sending tenant message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message'
    });
  }
});

module.exports = router;