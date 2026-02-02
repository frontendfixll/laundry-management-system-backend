const User = require('../models/User');
const AdminInvitation = require('../models/AdminInvitation');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateAccessToken, generateEmailVerificationToken, verifyEmailVerificationToken } = require('../utils/jwt');
const { sendEmail, emailTemplates } = require('../config/email');
const { setAuthCookie, clearAuthCookie } = require('../utils/cookieConfig');
const crypto = require('crypto');

// Register new user
const register = async (req, res) => {
  try {
    const { name, email, phone, password, tenancySlug, referralCode } = req.body;

    // Check if user already exists
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

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user data
    const userData = {
      name,
      email,
      phone,
      password: hashedPassword,
      isEmailVerified: false
    };

    // Determine tenancy
    let tenancyId = null;
    
    // If tenancy slug provided, associate customer with tenancy
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

    // Create user
    const user = new User(userData);

    // Generate email verification token
    const verificationToken = generateEmailVerificationToken(user._id, email);
    
    // Save user
    await user.save();
    
    // Handle referral code if provided
    let referralApplied = false;
    let referralReward = null;
    
    if (referralCode) {
      try {
        const { Referral } = require('../models/Referral');
        
        // Find the referral by code
        const referral = await Referral.findOne({
          code: referralCode.toUpperCase(),
          status: 'pending'
        }).populate('program');
        
        if (referral && referral.isValid()) {
          // Check if program is still active
          if (referral.program && referral.program.isValid()) {
            // Record signup - link referee to referrer
            referral.signups += 1;
            referral.referee = user._id;
            await referral.save();
            
            referralApplied = true;
            referralReward = referral.program.refereeReward;
            
            // Store referral info in user for later reward processing
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

    // Send verification email
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

// Verify email
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;

    // Verify token
    const decoded = verifyEmailVerificationToken(token);
    
    // Find user
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

    // Update user
    user.isEmailVerified = true;
    await user.save();

    // Generate access token (include assignedBranch for admin)
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

// Resend verification email
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

    // Generate new verification token
    const verificationToken = generateEmailVerificationToken(user._id, email);

    // Send verification email
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

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Use serverless DB utility for better connection handling
    const { withConnection, addTimeout } = require('../utils/serverlessDB');
    
    const loginOperation = async () => {
      console.log(`🔐 Login attempt for: ${email}`);
      
      // Find user and include password
      const userQuery = User.findOne({ email })
        .select('+password')
        .populate('tenancy', 'name slug subdomain branding subscription status');
      const user = await addTimeout(userQuery, 3000);
      
      if (!user) {
        // Track failed attempt for unknown email
        const { trackFailedAttempt } = require('../middlewares/auth');
        await trackFailedAttempt(email, 'user');
        
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Check password
      const isPasswordValid = await comparePassword(password, user.password);
      
      if (!isPasswordValid) {
        // Track failed attempt for wrong password
        const { trackFailedAttempt } = require('../middlewares/auth');
        await trackFailedAttempt(email, 'user');
        
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Clear failed attempts on successful login
      const { clearFailedAttempts } = require('../middlewares/auth');
      clearFailedAttempts(email, 'user');

      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated. Please contact support.'
        });
      }

      // Check tenancy status for admin/branch_admin users
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

      // TENANCY ISOLATION: For customers accessing via subdomain
      if (user.role === 'customer' && req.tenancy && req.tenancyId) {
        // Customers can access any tenancy's services, but we log it for analytics
        console.log(`📊 Customer ${user.email} accessing tenancy: ${req.tenancy.name}`);
      }

      // Validate branch_admin has assigned branch
      if (user.role === 'branch_admin' && !user.assignedBranch) {
        return res.status(400).json({
          success: false,
          message: 'Branch admin account must have an assigned branch. Please contact your admin.'
        });
      }

      // Validate admin has assigned branch (for legacy support)
      if (user.role === 'admin' && !user.assignedBranch && !user.tenancy) {
        return res.status(400).json({
          success: false,
          message: 'Admin account must have an assigned branch or tenancy. Please contact SuperAdmin.'
        });
      }

      // Update last login with timeout
      await addTimeout(user.updateLastLogin(), 2000);

      // Generate access token (include assignedBranch and tenancy for admin)
      const accessToken = generateAccessToken(
        user._id, 
        user.email, 
        user.role, 
        user.assignedBranch,
        user.tenancy?._id
      );

      // Set HTTP-only cookie
      setAuthCookie(res, accessToken);

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
          token: accessToken  // Still send token for backward compatibility
        }
      });
    };

    // Execute with connection handling and fallback
    await withConnection(loginOperation, null);

  } catch (error) {
    console.error('Login error:', error);
    
    // Provide more specific error messages for debugging
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

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('tenancy');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get tenancy features if user has tenancy
    let features = {};
    let tenancyData = null;
    
    if (user.tenancy) {
      const Tenancy = require('../models/Tenancy');
      const tenancy = await Tenancy.findById(user.tenancy._id).select('name slug subdomain branding subscription');
      
      if (tenancy) {
        // Extract features from tenancy subscription
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

// Update user profile
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

    // Check if phone is being changed and if it's already taken
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

    // Update fields
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

// Logout (clear cookie)
const logout = async (req, res) => {
  try {
    // Clear the auth cookie
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

// Verify invitation token
const verifyInvitation = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Invitation token is required'
      });
    }

    // Mark expired invitations first
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

// Accept invitation and create account
const acceptInvitation = async (req, res) => {
  try {
    const { token, name, phone, password } = req.body;

    // Validate required fields
    if (!token || !name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token, name, phone, and password are required'
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Mark expired invitations first
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

    // Check if user already exists with this email
    let user = await User.findOne({ email: invitation.email });
    
    if (user) {
      // User exists - check if already admin/center_admin
      if (user.role === 'admin' || user.role === 'center_admin') {
        return res.status(400).json({
          success: false,
          message: 'This email is already registered as an admin'
        });
      }
      
      // Existing customer - upgrade to admin/center_admin
      // Check if phone matches or update it
      if (user.phone !== phone) {
        // Check if new phone is already used by someone else
        const existingPhone = await User.findOne({ phone, _id: { $ne: user._id } });
        if (existingPhone) {
          return res.status(400).json({
            success: false,
            message: 'Phone number is already registered to another account'
          });
        }
        user.phone = phone;
      }
      
      // Update user to admin/center_admin
      user.name = name;
      user.password = password; // Will be hashed by pre-save hook
      user.role = invitation.role;
      user.permissions = invitation.permissions;
      user.assignedBranch = invitation.assignedBranch || user.assignedBranch;
      user.isEmailVerified = true;
      user.isActive = true;
      
      await user.save();
    } else {
      // New user - check if phone already exists
      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: 'Phone number is already registered'
        });
      }

      // Create new user (password will be hashed by User model's pre-save hook)
      user = new User({
        name,
        email: invitation.email,
        phone,
        password: password, // Don't hash here - model will hash it
        role: invitation.role,
        permissions: invitation.permissions,
        assignedBranch: invitation.assignedBranch || undefined,
        isEmailVerified: true, // Email is verified since they received the invitation
        isActive: true
      });

      await user.save();
    }

    // Mark invitation as accepted
    await invitation.markAccepted();

    // Generate access token (include assignedBranch for admin)
    const accessToken = generateAccessToken(
      user._id, 
      user.email, 
      user.role,
      user.assignedBranch
    );

    // Set HTTP-only cookie
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