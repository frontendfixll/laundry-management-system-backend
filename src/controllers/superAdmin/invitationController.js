const User = require('../../models/User');
const Tenancy = require('../../models/Tenancy');
const crypto = require('crypto');
const { sendEmail } = require('../../config/email');

// Invitation token model (embedded in User for simplicity)
const generateInvitationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const invitationController = {
  // Create and send invitation to laundry admin
  inviteLaundryAdmin: async (req, res) => {
    try {
      const { tenancyId, email, name, phone } = req.body;

      // Validate tenancy exists
      const tenancy = await Tenancy.findById(tenancyId);
      if (!tenancy) {
        return res.status(404).json({
          success: false,
          message: 'Tenancy not found'
        });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User with this email already exists'
        });
      }

      // Generate invitation token
      const invitationToken = generateInvitationToken();
      const hashedToken = crypto.createHash('sha256').update(invitationToken).digest('hex');

      // Create user with pending status
      const tempPassword = crypto.randomBytes(8).toString('hex');
      const user = await User.create({
        name,
        email: email.toLowerCase(),
        phone,
        password: tempPassword,
        role: 'admin',
        tenancy: tenancyId,
        isActive: false, // Will be activated on first login
        isEmailVerified: false,
        emailVerificationToken: hashedToken,
        emailVerificationExpires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        permissions: User.getDefaultAdminPermissions()
      });

      // Update tenancy owner if not set
      if (!tenancy.owner) {
        tenancy.owner = user._id;
        tenancy.status = 'pending';
        await tenancy.save();
      }

      // Send invitation email
      const inviteUrl = `${process.env.FRONTEND_URL}/auth/accept-invite?token=${invitationToken}&email=${encodeURIComponent(email)}`;
      
      try {
        await sendEmail({
          to: email,
          subject: `You're invited to manage ${tenancy.name} on LaundryPro`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #3B82F6;">Welcome to LaundryPro!</h2>
              <p>Hi ${name},</p>
              <p>You've been invited to manage <strong>${tenancy.name}</strong> on the LaundryPro platform.</p>
              <p>Click the button below to set up your account and start managing your laundry business:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteUrl}" style="background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Accept Invitation
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">This invitation expires in 7 days.</p>
              <p style="color: #666; font-size: 14px;">If you didn't expect this invitation, you can safely ignore this email.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="color: #999; font-size: 12px;">LaundryPro - Professional Laundry Management Platform</p>
            </div>
          `
        });
      } catch (emailError) {
        console.error('Failed to send invitation email:', emailError);
        // Don't fail the request, just log the error
      }

      res.status(201).json({
        success: true,
        message: 'Invitation sent successfully',
        data: {
          userId: user._id,
          email: user.email,
          tenancyId: tenancy._id,
          tenancyName: tenancy.name,
          inviteUrl: process.env.NODE_ENV === 'development' ? inviteUrl : undefined
        }
      });
    } catch (error) {
      console.error('Invite laundry admin error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send invitation'
      });
    }
  },

  // Accept invitation and set password
  acceptInvitation: async (req, res) => {
    try {
      const { token, email, password } = req.body;
      
      console.log('📧 Accept invitation request for:', email);

      if (!token || !email || !password) {
        console.log('❌ Missing required fields');
        return res.status(400).json({
          success: false,
          message: 'Token, email, and password are required'
        });
      }

      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      const user = await User.findOne({
        email: email.toLowerCase(),
        emailVerificationToken: hashedToken,
        emailVerificationExpires: { $gt: Date.now() }
      }).select('+password +emailVerificationToken +emailVerificationExpires');

      if (!user) {
        console.log('❌ User not found or token invalid/expired for:', email);
        // Check if user exists but token is wrong
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
          console.log('  - User exists, isActive:', existingUser.isActive, 'isEmailVerified:', existingUser.isEmailVerified);
        }
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired invitation token'
        });
      }

      console.log('✅ User found:', user.email, 'Current isActive:', user.isActive);

      // Update user
      user.password = password;
      user.isActive = true;
      user.isEmailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      await user.save();
      
      console.log('✅ User updated - isActive:', user.isActive, 'isEmailVerified:', user.isEmailVerified);

      // Activate tenancy
      const tenancy = await Tenancy.findById(user.tenancy);
      if (tenancy && tenancy.status === 'pending') {
        tenancy.status = 'active';
        await tenancy.save();
      }

      res.json({
        success: true,
        message: 'Account activated successfully. You can now login.',
        data: {
          email: user.email,
          tenancyName: tenancy?.name
        }
      });
    } catch (error) {
      console.error('Accept invitation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to accept invitation'
      });
    }
  },

  // Resend invitation
  resendInvitation: async (req, res) => {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (user.isEmailVerified) {
        return res.status(400).json({
          success: false,
          message: 'User has already accepted the invitation'
        });
      }

      const tenancy = await Tenancy.findById(user.tenancy);

      // Generate new token
      const invitationToken = generateInvitationToken();
      const hashedToken = crypto.createHash('sha256').update(invitationToken).digest('hex');

      user.emailVerificationToken = hashedToken;
      user.emailVerificationExpires = Date.now() + 7 * 24 * 60 * 60 * 1000;
      await user.save();

      // Send email
      const inviteUrl = `${process.env.FRONTEND_URL}/auth/accept-invite?token=${invitationToken}&email=${encodeURIComponent(user.email)}`;
      
      try {
        await sendEmail({
          to: user.email,
          subject: `Reminder: You're invited to manage ${tenancy?.name || 'your laundry'} on LaundryPro`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #3B82F6;">Invitation Reminder</h2>
              <p>Hi ${user.name},</p>
              <p>This is a reminder that you've been invited to manage <strong>${tenancy?.name || 'your laundry business'}</strong> on LaundryPro.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${inviteUrl}" style="background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Accept Invitation
                </a>
              </div>
              <p style="color: #666; font-size: 14px;">This invitation expires in 7 days.</p>
            </div>
          `
        });
      } catch (emailError) {
        console.error('Failed to resend invitation email:', emailError);
      }

      res.json({
        success: true,
        message: 'Invitation resent successfully'
      });
    } catch (error) {
      console.error('Resend invitation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to resend invitation'
      });
    }
  },

  // Get pending invitations
  getPendingInvitations: async (req, res) => {
    try {
      const pendingAdmins = await User.find({
        role: 'admin',
        isEmailVerified: false,
        emailVerificationExpires: { $gt: Date.now() }
      })
      .populate('tenancy', 'name subdomain status')
      .select('name email phone tenancy createdAt emailVerificationExpires')
      .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: pendingAdmins
      });
    } catch (error) {
      console.error('Get pending invitations error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch pending invitations'
      });
    }
  },

  // Cancel invitation
  cancelInvitation: async (req, res) => {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (user.isEmailVerified) {
        return res.status(400).json({
          success: false,
          message: 'Cannot cancel - user has already accepted the invitation'
        });
      }

      // Delete the user
      await User.findByIdAndDelete(userId);

      res.json({
        success: true,
        message: 'Invitation cancelled successfully'
      });
    } catch (error) {
      console.error('Cancel invitation error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel invitation'
      });
    }
  }
};

module.exports = invitationController;
