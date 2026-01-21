const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const SalesUser = require('../models/SalesUser');
const { sendSuccess, sendError, asyncHandler } = require('../utils/helpers');
const { validationResult } = require('express-validator');
const geoip = require('geoip-lite');

/**
 * Generate JWT token for sales user
 */
const generateToken = (salesUser, sessionId = null) => {
  const payload = {
    salesUserId: salesUser._id,
    email: salesUser.email,
    role: 'sales_admin',
    sessionId
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '7d' // 7 days
  });
};

/**
 * Sales User Login
 * POST /api/sales/auth/login
 */
exports.login = asyncHandler(async (req, res) => {
  try {
    // Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendError(res, 'VALIDATION_ERROR', 'Validation failed', 400);
    }

    const { email, password, rememberMe } = req.body;

    console.log('🔐 Login attempt for:', email);

    // Check if MongoDB is connected
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ MongoDB not connected, readyState:', mongoose.connection.readyState);
      return sendError(res, 'DATABASE_ERROR', 'Database connection unavailable. Please try again later.', 500);
    }

    // Find sales user with timeout handling
    const salesUser = await Promise.race([
      SalesUser.findOne({ email: email.toLowerCase() }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database query timeout')), 8000)
      )
    ]);
    
    console.log('🔍 Search query:', { email: email.toLowerCase() });
    console.log('🔍 Found user:', salesUser ? 'YES' : 'NO');
    
    if (salesUser) {
      console.log('📧 User email:', salesUser.email);
      console.log('👤 User name:', salesUser.name);
    }
    
    if (!salesUser) {
      console.log('❌ User not found:', email);
      return sendError(res, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    console.log('✅ User found:', salesUser.name);

    // Check if account is locked
    if (salesUser.isLocked()) {
      console.log('🔒 Account locked');
      return sendError(res, 'ACCOUNT_LOCKED', 'Account is temporarily locked due to multiple failed login attempts. Please try again later.', 403);
    }

    // Check if account is active
    if (!salesUser.isActive) {
      console.log('⛔ Account inactive');
      return sendError(res, 'ACCOUNT_INACTIVE', 'Account is deactivated. Please contact administrator.', 403);
    }

    // Verify password
    const isPasswordValid = await salesUser.comparePassword(password);
    
    if (!isPasswordValid) {
      console.log('❌ Invalid password');
      // Increment login attempts
      await salesUser.incLoginAttempts();
      return sendError(res, 'INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    console.log('✅ Password valid');

    // Reset login attempts on successful login
    await salesUser.resetLoginAttempts();

    // Create session
    const sessionId = crypto.randomBytes(32).toString('hex');
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent') || 'Unknown';
    const geo = geoip.lookup(ipAddress);
    const location = geo ? `${geo.city}, ${geo.country}` : 'Unknown';
    
    const sessionExpiry = rememberMe 
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);  // 7 days

    const sessionData = {
      sessionId,
      ipAddress,
      userAgent,
      location,
      isActive: true,
      lastActivity: new Date(),
      createdAt: new Date(),
      expiresAt: sessionExpiry
    };

    await salesUser.addSession(sessionData);

    // Update last login
    salesUser.lastLogin = new Date();
    salesUser.lastLoginIP = ipAddress;
    salesUser.lastActivity = new Date();
    await salesUser.save();

    console.log('✅ Session created');

    // Generate token
    const token = generateToken(salesUser, sessionId);

    // Set cookie
    res.cookie('sales_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
    });

    // Remove password from response
    const salesUserResponse = salesUser.toObject();
    delete salesUserResponse.password;
    delete salesUserResponse.sessions;

    console.log('✅ Login successful for:', salesUser.name);

    sendSuccess(res, {
      token,
      salesUser: salesUserResponse,
      session: {
        sessionId,
        expiresAt: sessionExpiry
      }
    }, 'Login successful');
  } catch (error) {
    console.error('❌ Login error:', error);
    return sendError(res, 'LOGIN_ERROR', error.message, 500);
  }
});

/**
 * Sales User Logout
 * POST /api/sales/auth/logout
 */
exports.logout = asyncHandler(async (req, res) => {
  const salesUser = req.salesUser;
  const token = req.headers.authorization?.split(' ')[1] || req.cookies.sales_token;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.sessionId) {
        await salesUser.removeSession(decoded.sessionId);
      }
    } catch (error) {
      console.error('Logout token decode error:', error);
    }
  }

  // Clear cookie
  res.clearCookie('sales_token');

  sendSuccess(res, 'Logout successful');
});

/**
 * Logout from all devices
 * POST /api/sales/auth/logout-all
 */
exports.logoutAll = asyncHandler(async (req, res) => {
  const salesUser = req.salesUser;

  // Clear all sessions
  salesUser.sessions = [];
  await salesUser.save();

  // Clear cookie
  res.clearCookie('sales_token');

  sendSuccess(res, 'Logged out from all devices');
});

/**
 * Get current sales user profile
 * GET /api/sales/auth/profile
 */
exports.getProfile = asyncHandler(async (req, res) => {
  const salesUser = req.salesUser;

  const salesUserResponse = salesUser.toObject();
  delete salesUserResponse.password;
  delete salesUserResponse.sessions;

  sendSuccess(res, 'Profile retrieved', salesUserResponse);
});

/**
 * Update sales user profile
 * PUT /api/sales/auth/profile
 */
exports.updateProfile = asyncHandler(async (req, res) => {
  const salesUser = req.salesUser;
  const { name, phone } = req.body;

  if (name) salesUser.name = name;
  if (phone) salesUser.phone = phone;

  await salesUser.save();

  const salesUserResponse = salesUser.toObject();
  delete salesUserResponse.password;
  delete salesUserResponse.sessions;

  sendSuccess(res, 'Profile updated', salesUserResponse);
});

/**
 * Change password
 * POST /api/sales/auth/change-password
 */
exports.changePassword = asyncHandler(async (req, res) => {
  const salesUser = req.salesUser;
  const { currentPassword, newPassword } = req.body;

  // Verify current password
  const isPasswordValid = await salesUser.comparePassword(currentPassword);
  
  if (!isPasswordValid) {
    return sendError(res, 'Current password is incorrect', 401);
  }

  // Update password
  salesUser.password = newPassword;
  await salesUser.save();

  sendSuccess(res, 'Password changed successfully');
});

/**
 * Forgot Password
 * POST /api/sales/auth/forgot-password
 */
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const salesUser = await SalesUser.findOne({ email: email.toLowerCase() });
  
  if (!salesUser) {
    // Don't reveal if email exists
    return sendSuccess(res, 'If the email exists, a password reset link has been sent');
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  salesUser.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  salesUser.resetPasswordExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  await salesUser.save();

  // TODO: Send email with reset link
  // const resetUrl = `${process.env.SALES_FRONTEND_URL}/auth/reset-password?token=${resetToken}`;
  // await sendEmail({ to: salesUser.email, subject: 'Password Reset', resetUrl });

  sendSuccess(res, 'If the email exists, a password reset link has been sent');
});

/**
 * Reset Password
 * POST /api/sales/auth/reset-password
 */
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  // Hash token
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  // Find user with valid token
  const salesUser = await SalesUser.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() }
  });

  if (!salesUser) {
    return sendError(res, 'Invalid or expired reset token', 400);
  }

  // Update password
  salesUser.password = password;
  salesUser.resetPasswordToken = undefined;
  salesUser.resetPasswordExpires = undefined;
  await salesUser.save();

  sendSuccess(res, 'Password reset successful');
});

/**
 * Refresh session
 * POST /api/sales/auth/refresh-session
 */
exports.refreshSession = asyncHandler(async (req, res) => {
  const salesUser = req.salesUser;
  const token = req.headers.authorization?.split(' ')[1] || req.cookies.sales_token;

  if (!token) {
    return sendError(res, 'No token provided', 401);
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  
  if (decoded.sessionId) {
    const session = salesUser.sessions.find(s => s.sessionId === decoded.sessionId);
    
    if (session) {
      // Extend session by 7 days
      session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      session.lastActivity = new Date();
      await salesUser.save();

      sendSuccess(res, 'Session refreshed', {
        expiresAt: session.expiresAt
      });
    } else {
      return sendError(res, 'Session not found', 404);
    }
  } else {
    return sendError(res, 'Invalid token', 401);
  }
});

/**
 * GET /api/sales/auth/team
 * Get team members for sales users
 */
exports.getTeamMembers = asyncHandler(async (req, res) => {
  try {
    console.log('🔍 Fetching team members...');
    console.log('🔍 Request user:', req.salesUser ? 'EXISTS' : 'MISSING');
    console.log('🔍 User email:', req.salesUser?.email || 'N/A');
    
    if (!req.salesUser) {
      console.error('❌ No sales user in request');
      return sendError(res, 'UNAUTHORIZED', 'Sales user not found in request', 401);
    }
    
    // Sales users can see limited team info (not all sales users)
    // For now, return current user info and sample team data
    const currentUser = req.salesUser;
    
    const teamMembers = [
      {
        _id: currentUser._id,
        name: currentUser.name,
        email: currentUser.email,
        phone: currentUser.phone,
        designation: currentUser.designation || 'Sales Executive',
        department: currentUser.department || 'Sales',
        isActive: currentUser.isActive,
        performance: currentUser.performance || {
          leadsAssigned: 0,
          leadsConverted: 0,
          conversionRate: 0,
          totalRevenue: 0,
          currentMonthRevenue: 0,
          target: 0,
          targetAchieved: 0
        },
        createdAt: currentUser.createdAt,
        lastLogin: currentUser.lastLogin
      }
    ];

    console.log('✅ Team members response:', teamMembers.length);
    sendSuccess(res, { salesUsers: teamMembers }, 'Team members retrieved');

  } catch (error) {
    console.error('❌ Team members error:', error);
    
    // Fallback to sample data
    const fallbackData = {
      salesUsers: [{
        _id: 'sample_id',
        name: 'Sample Sales User',
        email: 'sample@sales.com',
        designation: 'Sales Executive',
        department: 'Sales',
        isActive: true,
        performance: {
          leadsAssigned: 0,
          leadsConverted: 0,
          conversionRate: 0,
          totalRevenue: 0,
          currentMonthRevenue: 0,
          target: 0,
          targetAchieved: 0
        },
        createdAt: new Date(),
        lastLogin: new Date()
      }]
    };
    
    console.log('🔄 Using fallback team data');
    sendSuccess(res, fallbackData, 'Team members retrieved (fallback)');
  }
});