const User = require('../models/User');
const AdminInvitation = require('../models/AdminInvitation');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateAccessToken, generateEmailVerificationToken, verifyEmailVerificationToken } = require('../utils/jwt');
const { sendEmail, emailTemplates } = require('../config/email');
const { setAuthCookie, clearAuthCookie } = require('../utils/cookieConfig');
const { trackFailedAttempt, clearFailedAttempts } = require('../middlewares/auth');
const crypto = require('crypto');

const register = async (req, res) => {
  try {
    const { name, email, phone, password, tenancySlug, referralCode } = req.body;

    const existingUser = await User.findOne({
      $or: [{ email }, { phone }]
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists'
        });
      }
      if (existingUser.phone === phone) {
        return res.status(400).json({
          success: false,
          message: 'User with this phone number already exists'
        });
      }
    }

    const hashedPassword = await hashPassword(password);

    const userData = {
      name,
      email,
      phone,
      password: hashedPassword,
      isEmailVerified: false
    };

    let tenancyId = null;
    if (tenancySlug) {
      const Tenancy = require('../models/Tenancy');
      const tenancy = await Tenancy.findOne({
        $or: [{ slug: tenancySlug }, { subdomain: tenancySlug }],
        status: 'active'
      });
      if (tenancy) {
        userData.tenancy = tenancy._id;
        tenancyId = tenancy._id;
      }
    }

    const user = new User(userData);
    const verificationToken = generateEmailVerificationToken(user._id, email);
    await user.save();

    let referralApplied = false;
    let referralReward = null;

    if (referralCode) {
      try {
        const { Referral } = require('../models/Referral');

        const referral = await Referral.findOne({
          code: referralCode.toUpperCase(),
          status: 'pending'
        }).populate('program');
        
        if (referral && referral.isValid()) {
          if (referral.program && referral.program.isValid()) {
            referral.signups += 1;
            referral.referee = user._id;
            await referral.save();

            referralApplied = true;
            referralReward = referral.program.refereeReward;

            user.referredBy = referral.referrer;
            user.referralCode = referralCode.toUpperCase();
            await user.save();
            
            console.log(`✅ Referral signup recorded: ${referralCode} -> ${user.email}`);
          }
        }
      } catch (refError) {
        console.error('Referral processing error:', refError);
        // Don't fail registration if referral fails
      }
    }

    const emailOptions = emailTemplates.verification(verificationToken, email);
    const emailResult = await sendEmail(emailOptions);

    if (!emailResult.success) {
      console.error('Failed to send verification email:', emailResult.error);
      // Don't fail registration if email fails, just log it
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful! Please check your email to verify your account.',
      data: {
        userId: user._id,
        email: user.email,
        name: user.name,
        emailSent: emailResult.success,
        referralApplied,
        referralReward: referralApplied ? {
          type: referralReward?.type,
          value: referralReward?.value,
          message: `You'll receive ${referralReward?.type === 'credit' ? '₹' : ''}${referralReward?.value}${referralReward?.type === 'discount' ? '%' : ''} ${referralReward?.type} on your first order!`
        } : null
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    const decoded = verifyEmailVerificationToken(token);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification token'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    user.isEmailVerified = true;
    await user.save();

    const accessToken = generateAccessToken(
      user._id, 
      user.email, 
      user.role,
      user.assignedBranch
    );

    res.status(200).json({
      success: true,
      message: 'Email verified successfully!',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isEmailVerified: user.isEmailVerified
        },
        token: accessToken
      }
    });

  } catch (error) {
    console.error('Email verification error:', error);
    res.status(400).json({
      success: false,
      message: 'Invalid or expired verification token'
    });
  }
};

const resendVerificationEmail = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({
        success: false,
        message: 'Email is already verified'
      });
    }

    const verificationToken = generateEmailVerificationToken(user._id, email);

    const emailOptions = emailTemplates.verification(verificationToken, email);
    const emailResult = await sendEmail(emailOptions);

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send verification email'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Verification email sent successfully!'
    });

  } catch (error) {
    console.error('Resend verification email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend verification email'
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password, tenantSlug } = req.body;

    console.log(`🔐 Login attempt for: ${email}`);

    const user = await User.findOne({ email })
      .select('+password')
      .populate('tenancy', 'name slug subdomain branding subscription status');

    if (!user) {
      try {
        await trackFailedAttempt(email, 'user', req);
      } catch (error) {
        console.log('Failed attempt tracking failed, but continuing login');
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      try {
        await trackFailedAttempt(email, 'user', req);
      } catch (error) {
        console.log('Failed attempt tracking failed, but continuing login');
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    try {
      clearFailedAttempts(email, 'user');
    } catch (error) {
      console.log('Clear failed attempts failed, but continuing login');
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    // TENANCY: Customers must login from a valid tenant page
    if (user.role === 'customer') {
      if (!tenantSlug || !tenantSlug.trim()) {
        return res.status(403).json({
          success: false,
          message: 'Please login from a laundry\'s page.',
          code: 'TENANCY_REQUIRED'
        });
      }
      const Tenancy = require('../models/Tenancy');
      const tenancy = await Tenancy.findOne({
        $or: [{ slug: tenantSlug.trim() }, { subdomain: tenantSlug.trim() }],
        status: { $in: ['active', 'trial'] }
      });
      if (!tenancy) {
        return res.status(403).json({
          success: false,
          message: 'Invalid laundry. Please login from a valid laundry\'s page.',
          code: 'TENANCY_INVALID'
        });
      }
      if (user.tenancy) {
        if (user.tenancy._id.toString() !== tenancy._id.toString()) {
          // Demo customer: allow login from any tenant and re-associate (for testing/demo on localhost + production)
          const isDemoCustomer = email && String(email).toLowerCase() === 'testcustomer@demo.com';
          if (isDemoCustomer) {
            user.tenancy = tenancy._id;
            await user.save({ validateBeforeSave: false });
            user.tenancy = tenancy; // Keep full object for response
          } else {
            return res.status(403).json({
              success: false,
              message: 'This account is associated with a different laundry. Please login from that laundry\'s page.',
              code: 'TENANCY_MISMATCH'
            });
          }
        }
      } else {
        // First-time: associate customer with tenant
        user.tenancy = tenancy._id;
        await user.save({ validateBeforeSave: false });
      }
    }

    if ((user.role === 'admin' || user.role === 'branch_admin') && user.tenancy) {
      if (user.tenancy.status !== 'active' && user.tenancy.status !== 'trial') {
        return res.status(403).json({
          success: false,
          message: 'Your laundry portal is currently inactive. Please contact support.'
        });
      }
    }

    // TENANCY ISOLATION: Ensure admin/staff users have tenancy
    if (user.role === 'admin' || user.role === 'branch_admin' || user.role === 'staff') {
      if (!user.tenancy) {
        return res.status(403).json({
          success: false,
          message: 'User is not associated with any tenancy. Please contact SuperAdmin.'
        });
      }
      
      // CRITICAL: Validate user belongs to the tenancy being accessed via subdomain
      if (req.tenancy && req.tenancyId) {
        // User is accessing via subdomain - ensure they belong to this tenancy
        if (user.tenancy._id.toString() !== req.tenancyId.toString()) {
          console.log(`🚨 TENANCY ISOLATION VIOLATION: User ${user.email} (tenancy: ${user.tenancy.name}) tried to access ${req.tenancy.name} via subdomain`);
          return res.status(403).json({
            success: false,
            message: 'Access denied. You do not have permission to access this laundry portal.',
            code: 'TENANCY_MISMATCH'
          });
        }
        console.log(`✅ TENANCY VALIDATION: User ${user.email} accessing correct tenancy: ${req.tenancy.name}`);
      }
    }

    try {
      user.lastLogin = new Date();
      user.save({ validateBeforeSave: false }); // non-blocking
    } catch (error) {
      console.log('LastLogin update failed, but login continues:', error.message);
    }

    const accessToken = generateAccessToken(
      user._id,
      user.email,
      user.role,
      user.assignedBranch,
      user.tenancy?._id
    );

    setAuthCookie(res, accessToken);

    console.log(`✅ Login successful for ${user.email} (${user.role})`);
    console.log(`🏢 Tenancy: ${user.tenancy?.name || 'None'}`);

    return res.status(200).json({
      success: true,
      message: 'Login successful!',
      data: {
        user: {
          _id: user._id,
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          permissions: user.permissions || {},
          assignedBranch: user.assignedBranch,
          tenancy: user.tenancy ? {
            _id: user.tenancy._id,
            name: user.tenancy.name,
            slug: user.tenancy.slug,
            subdomain: user.tenancy.subdomain,
            branding: user.tenancy.branding,
            subscription: user.tenancy.subscription
          } : null,
          isEmailVerified: user.isEmailVerified,
          isActive: user.isActive,
          lastLogin: user.lastLogin
        },
        token: accessToken
      }
    });

  } catch (error) {
    console.error('Login error:', error);

    if (error.name === 'MongoTimeoutError' || error.message.includes('timeout')) {
      return res.status(503).json({
        success: false,
        message: 'Database connection timeout. Please try again later.'
      });
    }
    
    if (error.name === 'MongoNetworkError') {
      return res.status(503).json({
        success: false,
        message: 'Database connection unavailable. Please try again later.'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
};

const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('tenancy');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let features = {};
    let tenancyData = null;

    if (user.tenancy) {
      const Tenancy = require('../models/Tenancy');
      const tenancy = await Tenancy.findById(user.tenancy._id).select('name slug subdomain branding subscription');

      if (tenancy) {
        features = tenancy.subscription?.features || {};
        
        tenancyData = {
          _id: tenancy._id,
          name: tenancy.name,
          slug: tenancy.slug,
          subdomain: tenancy.subdomain,
          branding: tenancy.branding,
          subscription: tenancy.subscription
        };
      }
    }

    console.log(`🔍 Profile request for user ${user.email}:`, {
      role: user.role,
      permissionModules: Object.keys(user.permissions || {}),
      featureCount: Object.keys(features).length,
      tenancyId: user.tenancy?._id
    });

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        permissions: user.permissions || {},
        features: features, // Include tenancy features
        isEmailVerified: user.isEmailVerified,
        phoneVerified: user.phoneVerified,
        addresses: user.addresses,
        preferences: user.preferences,
        rewardPoints: user.rewardPoints,
        totalOrders: user.totalOrders,
        isVIP: user.isVIP,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
        tenancy: tenancyData,
        tenancySlug: tenancyData?.slug
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, phone, preferredPickupTime, savedServices } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (phone && phone !== user.phone) {
      const existingUser = await User.findOne({ phone, _id: { $ne: user._id } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is already registered with another account'
        });
      }
      user.phone = phone;
      user.phoneVerified = false; // Reset phone verification if changed
    }

    if (name) user.name = name;
    if (preferredPickupTime) user.preferences.preferredPickupTime = preferredPickupTime;
    if (savedServices) user.preferences.savedServices = savedServices;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully!',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
          phoneVerified: user.phoneVerified,
          preferences: user.preferences
        }
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

const logout = async (req, res) => {
  try {
    clearAuthCookie(res);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
};

const verifyInvitation = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Invitation token is required'
      });
    }

    await AdminInvitation.markExpired();

    const invitation = await AdminInvitation.findOne({ invitationToken: token })
      .populate('assignedBranch', 'name code');

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: 'Invalid invitation token'
      });
    }

    if (!invitation.isValid()) {
      return res.status(400).json({
        success: false,
        message: invitation.status === 'expired' ? 'Invitation has expired' : 'Invitation is no longer valid'
      });
    }

    res.json({
      success: true,
      data: {
        invitation: {
          email: invitation.email,
          role: invitation.role,
          assignedBranch: invitation.assignedBranch,
          expiresAt: invitation.expiresAt
        }
      }
    });
  } catch (error) {
    console.error('Verify invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify invitation'
    });
  }
};

const acceptInvitation = async (req, res) => {
  try {
    const { token, name, phone, password } = req.body;

    if (!token || !name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token, name, phone, and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    await AdminInvitation.markExpired();

    const invitation = await AdminInvitation.findOne({ invitationToken: token });

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: 'Invalid invitation token'
      });
    }

    if (!invitation.isValid()) {
      return res.status(400).json({
        success: false,
        message: invitation.status === 'expired' ? 'Invitation has expired' : 'Invitation is no longer valid'
      });
    }

    let user = await User.findOne({ email: invitation.email });

    if (user) {
      if (user.role === 'admin' || user.role === 'center_admin') {
        return res.status(400).json({
          success: false,
          message: 'This email is already registered as an admin'
        });
      }

      // Existing customer - upgrade to admin/center_admin
      if (user.phone !== phone) {
        const existingPhone = await User.findOne({ phone, _id: { $ne: user._id } });
        if (existingPhone) {
          return res.status(400).json({
            success: false,
            message: 'Phone number is already registered to another account'
          });
        }
        user.phone = phone;
      }

      user.name = name;
      user.password = password; // Will be hashed by pre-save hook
      user.role = invitation.role;
      user.permissions = invitation.permissions;
      user.assignedBranch = invitation.assignedBranch || user.assignedBranch;
      user.isEmailVerified = true;
      user.isActive = true;
      
      await user.save();
    } else {
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is already registered'
        });
      }

      user = new User({
        name,
        email: invitation.email,
        phone,
        password: password, // hashed by User model's pre-save hook
        role: invitation.role,
        permissions: invitation.permissions,
        assignedBranch: invitation.assignedBranch || undefined,
        isEmailVerified: true,
        isActive: true
      });

      await user.save();
    }

    await invitation.markAccepted();

    const accessToken = generateAccessToken(
      user._id,
      user.email,
      user.role,
      user.assignedBranch
    );

    setAuthCookie(res, accessToken);

    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      data: {
        user: {
          _id: user._id,
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          permissions: user.permissions,
          assignedBranch: user.assignedBranch,
          isEmailVerified: user.isEmailVerified,
          isActive: user.isActive
        },
        token: accessToken
      }
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create account'
    });
  }
};

module.exports = {
  register,
  verifyEmail,
  resendVerificationEmail,
  login,
  getProfile,
  updateProfile,
  logout,
  verifyInvitation,
  acceptInvitation
};