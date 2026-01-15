const bcrypt = require('bcryptjs');
const PendingSignup = require('../models/PendingSignup');
const { BillingPlan } = require('../models/TenancyBilling');
const Tenancy = require('../models/Tenancy');
const User = require('../models/User');
const FeatureDefinition = require('../models/FeatureDefinition');

// Initialize Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? require('stripe')(stripeSecretKey) : null;

/**
 * Signup Controller
 * Handles self-service signup flow with Stripe payment
 */
const signupController = {
  
  /**
   * Initiate signup - creates pending signup and Stripe checkout session
   * POST /api/public/signup/initiate
   */
  initiateSignup: async (req, res) => {
    try {
      const {
        businessName,
        ownerName,
        email,
        phone,
        password,
        address,
        planId,
        billingCycle = 'monthly'
      } = req.body;
      
      // Validate required fields
      if (!businessName || !ownerName || !email || !phone || !password || !planId) {
        return res.status(400).json({
          success: false,
          message: 'All fields are required: businessName, ownerName, email, phone, password, planId'
        });
      }
      
      // Check if email already exists in Users
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'An account with this email already exists'
        });
      }
      
      // Check if phone already exists in Users
      const existingPhone = await User.findOne({ phone: phone });
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: 'An account with this phone number already exists'
        });
      }
      
      // Check if there's already a pending signup with this email
      const existingPending = await PendingSignup.findOne({ 
        email: email.toLowerCase(),
        status: 'pending'
      });
      if (existingPending) {
        // Delete old pending signup
        await PendingSignup.deleteOne({ _id: existingPending._id });
      }
      
      // Get the billing plan
      const plan = await BillingPlan.findById(planId);
      if (!plan || !plan.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or inactive plan selected'
        });
      }
      
      // Calculate amount
      const price = billingCycle === 'yearly' ? plan.price.yearly : plan.price.monthly;
      
      // For free plans, skip Stripe and create directly
      if (price === 0) {
        return await signupController.createFreeTenancy(req, res, {
          businessName, ownerName, email, phone, password, address, plan, billingCycle
        });
      }
      
      // Check Stripe configuration
      if (!stripe) {
        return res.status(500).json({
          success: false,
          message: 'Payment gateway not configured. Please contact support.'
        });
      }
      
      const tax = Math.round(price * 0.18); // 18% GST
      const total = price + tax;
      
      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);
      
      // Create pending signup
      const pendingSignup = await PendingSignup.create({
        businessName,
        ownerName,
        email: email.toLowerCase(),
        phone,
        passwordHash,
        address: address || {},
        plan: plan._id,
        planName: plan.name,
        billingCycle,
        amount: {
          subtotal: price,
          tax,
          discount: 0,
          total
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      // Create Stripe checkout session
      const marketingUrl = process.env.MARKETING_URL || 'http://localhost:3004';
      
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: email,
        line_items: [
          {
            price_data: {
              currency: 'inr',
              product_data: {
                name: `${plan.displayName} Plan`,
                description: `${billingCycle === 'yearly' ? 'Annual' : 'Monthly'} subscription for LaundryLobby`,
              },
              unit_amount: total * 100, // Stripe uses paise
            },
            quantity: 1,
          },
        ],
        metadata: {
          signupToken: pendingSignup.token,
          planId: plan._id.toString(),
          planName: plan.name,
          billingCycle,
          type: 'self_service_signup'
        },
        success_url: `${marketingUrl}/signup/success?token=${pendingSignup.token}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${marketingUrl}/signup/${planId}?cancelled=true`,
      });
      
      // Store Stripe session ID
      pendingSignup.stripeSessionId = session.id;
      pendingSignup.status = 'payment_processing';
      await pendingSignup.save();
      
      res.json({
        success: true,
        message: 'Checkout session created',
        data: {
          token: pendingSignup.token,
          sessionId: session.id,
          checkoutUrl: session.url
        }
      });
      
    } catch (error) {
      console.error('Initiate signup error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to initiate signup'
      });
    }
  },
  
  /**
   * Create tenancy for free plan (no payment required)
   */
  createFreeTenancy: async (req, res, data) => {
    try {
      const { businessName, ownerName, email, phone, password, address, plan, billingCycle } = data;
      
      // Check if user already exists
      let user = await User.findOne({ $or: [{ email: email.toLowerCase() }, { phone: phone }] });
      if (user) {
        return res.status(400).json({
          success: false,
          message: 'An account with this email or phone already exists'
        });
      }
      
      // Generate slug
      const slug = businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      
      // Check if slug exists
      let finalSlug = slug;
      let counter = 1;
      while (await Tenancy.findOne({ slug: finalSlug })) {
        finalSlug = `${slug}-${counter}`;
        counter++;
      }
      
      // Get plan features
      const features = plan.features instanceof Map 
        ? Object.fromEntries(plan.features)
        : plan.features || {};
      
      // Create user first (password will be hashed by User model pre-save hook)
      user = await User.create({
        name: ownerName,
        email: email.toLowerCase(),
        phone,
        password: password, // Raw password - will be hashed by model
        role: 'admin',
        isVerified: true,
        permissions: User.getDefaultAdminPermissions()
      });
      
      // Calculate trial end date
      const trialDays = plan.trialDays || 14;
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);
      
      // Create tenancy
      const tenancy = await Tenancy.create({
        name: businessName,
        slug: finalSlug,
        subdomain: finalSlug,
        owner: user._id,
        contact: {
          email: email.toLowerCase(),
          phone,
          address: address || {}
        },
        subscription: {
          plan: plan.name,
          status: 'trial',
          startDate: new Date(),
          trialEndsAt,
          features
        },
        status: 'active'
      });
      
      // Update user with tenancy
      user.tenancy = tenancy._id;
      await user.save();
      
      // TODO: Send welcome email
      
      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        data: {
          tenancy: {
            id: tenancy._id,
            name: tenancy.name,
            slug: tenancy.slug,
            subdomain: tenancy.subdomain
          },
          user: {
            id: user._id,
            email: user.email,
            name: user.name
          },
          loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/login`
        }
      });
      
    } catch (error) {
      console.error('Create free tenancy error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create account'
      });
    }
  },
  
  /**
   * Verify signup after Stripe payment
   * POST /api/public/signup/verify
   */
  verifySignup: async (req, res) => {
    try {
      const { token, sessionId } = req.body;
      
      if (!token || !sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Token and sessionId are required'
        });
      }
      
      const pendingSignup = await PendingSignup.findByToken(token);
      
      if (!pendingSignup) {
        return res.status(404).json({
          success: false,
          message: 'Signup not found'
        });
      }
      
      // If already completed, return success
      if (pendingSignup.status === 'completed') {
        return res.json({
          success: true,
          message: 'Account already created',
          data: {
            tenancy: pendingSignup.tenancy,
            loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/login`
          }
        });
      }
      
      // Verify with Stripe
      if (!stripe) {
        return res.status(500).json({
          success: false,
          message: 'Payment gateway not configured'
        });
      }
      
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      
      if (session.payment_status !== 'paid') {
        return res.status(400).json({
          success: false,
          message: 'Payment not completed'
        });
      }
      
      // Create tenancy and user
      const result = await signupController.completePendingSignup(pendingSignup, session);
      
      res.json({
        success: true,
        message: 'Account created successfully',
        data: result
      });
      
    } catch (error) {
      console.error('Verify signup error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to verify signup'
      });
    }
  },
  
  /**
   * Complete pending signup - creates tenancy and user
   */
  completePendingSignup: async (pendingSignup, stripeSession) => {
    // Check if already completed
    if (pendingSignup.status === 'completed' && pendingSignup.tenancy) {
      const existingTenancy = await Tenancy.findById(pendingSignup.tenancy);
      if (existingTenancy) {
        return {
          tenancy: {
            id: existingTenancy._id,
            name: existingTenancy.name,
            slug: existingTenancy.slug,
            subdomain: existingTenancy.subdomain
          },
          user: {
            id: pendingSignup.user,
            email: pendingSignup.email,
            name: pendingSignup.ownerName
          },
          loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/login`
        };
      }
    }
    
    // Check if user already exists (in case of retry)
    let user = await User.findOne({ email: pendingSignup.email });
    if (user) {
      // User already exists, check if tenancy exists
      if (user.tenancy) {
        const existingTenancy = await Tenancy.findById(user.tenancy);
        if (existingTenancy) {
          // Mark pending signup as completed
          await pendingSignup.markCompleted(existingTenancy._id, user._id);
          return {
            tenancy: {
              id: existingTenancy._id,
              name: existingTenancy.name,
              slug: existingTenancy.slug,
              subdomain: existingTenancy.subdomain
            },
            user: {
              id: user._id,
              email: user.email,
              name: user.name
            },
            loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/login`
          };
        }
      }
    }
    
    // Get the plan
    const plan = await BillingPlan.findById(pendingSignup.plan);
    if (!plan) {
      throw new Error('Plan not found');
    }
    
    // Generate slug
    const slug = pendingSignup.businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    // Check if slug exists
    let finalSlug = slug;
    let counter = 1;
    while (await Tenancy.findOne({ slug: finalSlug })) {
      finalSlug = `${slug}-${counter}`;
      counter++;
    }
    
    // Get plan features
    const features = plan.features instanceof Map 
      ? Object.fromEntries(plan.features)
      : plan.features || {};
    
    // Create user if not exists
    if (!user) {
      user = new User({
        name: pendingSignup.ownerName,
        email: pendingSignup.email,
        phone: pendingSignup.phone,
        password: pendingSignup.passwordHash, // Already hashed
        role: 'admin',
        isVerified: true,
        permissions: User.getDefaultAdminPermissions()
      });
      user.$skipPasswordHash = true; // Skip re-hashing since password is already hashed
      await user.save();
    }
    
    // Calculate subscription dates
    const startDate = new Date();
    const endDate = new Date();
    if (pendingSignup.billingCycle === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }
    
    // Create tenancy
    const tenancy = await Tenancy.create({
      name: pendingSignup.businessName,
      slug: finalSlug,
      subdomain: finalSlug,
      owner: user._id,
      contact: {
        email: pendingSignup.email,
        phone: pendingSignup.phone,
        address: pendingSignup.address || {}
      },
      subscription: {
        plan: plan.name,
        status: 'active',
        startDate,
        endDate,
        features
      },
      status: 'active'
    });
    
    // Update user with tenancy
    user.tenancy = tenancy._id;
    await user.save();
    
    // Mark pending signup as completed
    await pendingSignup.markCompleted(tenancy._id, user._id);
    
    // Store payment intent
    if (stripeSession?.payment_intent) {
      pendingSignup.stripePaymentIntentId = stripeSession.payment_intent;
      await pendingSignup.save();
    }
    
    // TODO: Send welcome email
    // TODO: Create initial invoice record
    
    // Notify all superadmins about new signup
    try {
      const NotificationService = require('../services/notificationService');
      await NotificationService.notifyAllSuperAdmins({
        type: 'new_tenancy_signup',
        title: 'New Business Signup! 🎉',
        message: `${tenancy.name} just signed up for ${plan.displayName} plan`,
        icon: 'building',
        severity: 'success',
        data: { tenancyId: tenancy._id, link: `/tenancies/${tenancy._id}` }
      });
    } catch (notifyError) {
      console.error('Failed to notify superadmins:', notifyError);
    }
    
    return {
      tenancy: {
        id: tenancy._id,
        name: tenancy.name,
        slug: tenancy.slug,
        subdomain: tenancy.subdomain
      },
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      },
      loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/login`
    };
  },
  
  /**
   * Stripe webhook handler for signup payments
   * POST /api/public/signup/webhook
   */
  handleStripeWebhook: async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_SIGNUP_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    // Handle checkout.session.completed for self-service signups
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      // Check if this is a self-service signup
      if (session.metadata?.type === 'self_service_signup') {
        try {
          const pendingSignup = await PendingSignup.findOne({
            token: session.metadata.signupToken,
            status: { $in: ['pending', 'payment_processing'] }
          }).populate('plan');
          
          if (pendingSignup) {
            await signupController.completePendingSignup(pendingSignup, session);
            console.log(`Signup completed via webhook: ${pendingSignup.email}`);
          }
        } catch (error) {
          console.error('Webhook signup completion error:', error);
        }
      }
    }
    
    res.json({ received: true });
  },
  
  /**
   * Get signup status by token
   * GET /api/public/signup/status/:token
   */
  getSignupStatus: async (req, res) => {
    try {
      const { token } = req.params;
      
      const pendingSignup = await PendingSignup.findByToken(token);
      
      if (!pendingSignup) {
        return res.status(404).json({
          success: false,
          message: 'Signup not found'
        });
      }
      
      // Check if expired
      if (pendingSignup.isExpired) {
        pendingSignup.status = 'expired';
        await pendingSignup.save();
      }
      
      res.json({
        success: true,
        data: {
          status: pendingSignup.status,
          businessName: pendingSignup.businessName,
          email: pendingSignup.email,
          planName: pendingSignup.planName,
          tenancy: pendingSignup.tenancy,
          completedAt: pendingSignup.completedAt
        }
      });
      
    } catch (error) {
      console.error('Get signup status error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get signup status'
      });
    }
  }
};

module.exports = signupController;
