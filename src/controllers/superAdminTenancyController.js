const Tenancy = require('../models/Tenancy');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { sendEmail, emailTemplates } = require('../config/email');
const { validationResult } = require('express-validator');
const subdomainService = require('../services/subdomainService');

const tenancyController = {
  // Get all tenancies
  getAllTenancies: async (req, res) => {
    try {
      const { page = 1, limit = 20, status, search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
      
      const query = { isDeleted: false };
      
      if (status) query.status = status;
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { slug: { $regex: search, $options: 'i' } },
          { subdomain: { $regex: search, $options: 'i' } }
        ];
      }
      
      const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
      
      const [tenancies, total] = await Promise.all([
        Tenancy.find(query)
          .populate('owner', 'name email phone')
          .sort(sort)
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .lean(),
        Tenancy.countDocuments(query)
      ]);
      
      res.json({
        success: true,
        data: {
          tenancies,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
            limit: parseInt(limit)
          }
        }
      });
    } catch (error) {
      console.error('Get tenancies error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch tenancies' });
    }
  },

  // Get single tenancy
  getTenancyById: async (req, res) => {
    try {
      const tenancy = await Tenancy.findById(req.params.id)
        .populate('owner', 'name email phone')
        .lean();
      
      if (!tenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }
      
      res.json({ success: true, data: { tenancy } });
    } catch (error) {
      console.error('Get tenancy error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch tenancy' });
    }
  },

  // Create new tenancy
  createTenancy: async (req, res) => {
    try {
      console.log('📝 Create tenancy request body:', JSON.stringify(req.body, null, 2));
      
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('❌ Validation errors:', errors.array());
        return res.status(400).json({
          success: false,
          message: errors.array()[0].msg,
          errors: errors.array()
        });
      }

      const {
        name,
        slug,
        description,
        subdomain,
        contact,
        owner: ownerData,  // { name, email, phone, password }
        subscription,
        createSubdomain = true // New flag to control subdomain creation
      } = req.body;
      
      // Validate required fields
      if (!name || !ownerData?.email || !ownerData?.name) {
        return res.status(400).json({
          success: false,
          message: 'Name and owner details (name, email) are required'
        });
      }
      
      // Generate unique subdomain if not provided
      let finalSubdomain = subdomain || slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      
      if (createSubdomain) {
        try {
          // Generate unique subdomain using the service
          finalSubdomain = await subdomainService.generateUniqueSubdomain(name);
          console.log('🌐 Generated unique subdomain:', finalSubdomain);
        } catch (error) {
          console.error('Failed to generate subdomain:', error);
          // Fall back to manual generation if service fails
          finalSubdomain = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        }
      }
      
      // Check if slug/subdomain already exists in database
      const existingTenancy = await Tenancy.findOne({
        $or: [
          { slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
          { subdomain: finalSubdomain }
        ]
      });
      
      if (existingTenancy) {
        return res.status(400).json({
          success: false,
          message: 'A tenancy with this name/subdomain already exists'
        });
      }
      
      // Check if owner email already exists
      const existingUser = await User.findOne({ email: ownerData.email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'A user with this email already exists'
        });
      }
      
      // Check if phone number already exists (if provided)
      if (ownerData.phone) {
        const existingPhoneUser = await User.findOne({ phone: ownerData.phone });
        if (existingPhoneUser) {
          return res.status(400).json({
            success: false,
            message: 'A user with this phone number already exists'
          });
        }
      }
      
      // Create owner (laundry admin)
      const salt = await bcrypt.genSalt(10);
      const tempPassword = ownerData.password || Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, salt);
      
      // Generate unique phone if not provided or if provided phone already exists
      let finalPhone = ownerData.phone;
      if (!finalPhone) {
        // Generate a unique phone number
        let phoneExists = true;
        let attempts = 0;
        while (phoneExists && attempts < 10) {
          finalPhone = `9${Math.floor(Math.random() * 900000000) + 100000000}`;
          const existingPhone = await User.findOne({ phone: finalPhone });
          phoneExists = !!existingPhone;
          attempts++;
        }
        if (phoneExists) {
          finalPhone = `9${Date.now().toString().slice(-9)}`;
        }
      }
      
      const owner = new User({
        name: ownerData.name,
        email: ownerData.email.toLowerCase(),
        phone: finalPhone,
        password: hashedPassword,
        role: 'admin',
        isActive: true,
        isEmailVerified: true
      });
      
      console.log('📝 Creating owner user:', { name: ownerData.name, email: ownerData.email });
      await owner.save();
      console.log('✅ Owner saved:', owner._id);
      
      // Build subscription object with proper trialEndsAt calculation
      const trialDays = subscription?.trialDays || 14;
      
      // Get features from billing plan if planId or plan name provided
      let planFeatures = subscription?.features || {};
      const planName = subscription?.plan || 'free';
      
      // If features not provided, fetch from BillingPlan
      if (Object.keys(planFeatures).length === 0) {
        const { BillingPlan } = require('../models/TenancyBilling');
        const billingPlan = await BillingPlan.findOne({ name: planName });
        if (billingPlan) {
          planFeatures = billingPlan.features instanceof Map 
            ? Object.fromEntries(billingPlan.features)
            : billingPlan.features || {};
          console.log('📝 Loaded features from plan:', planName, planFeatures);
        }
      }
      
      const subscriptionData = {
        plan: planName,
        status: subscription?.status || 'trial',
        features: planFeatures,
        trialEndsAt: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000),
        startDate: new Date(),
        billingCycle: subscription?.billingCycle || 'monthly'
      };
      
      // If planId is provided, add it
      if (subscription?.planId) {
        subscriptionData.planId = subscription.planId;
      }
      
      console.log('📝 Subscription data:', JSON.stringify(subscriptionData, null, 2));
      
      // Create DNS subdomain if enabled
      let subdomainResult = null;
      if (createSubdomain && process.env.DNS_PROVIDER && process.env.MAIN_DOMAIN) {
        try {
          console.log('🌐 Creating DNS subdomain:', finalSubdomain);
          subdomainResult = await subdomainService.createSubdomain(finalSubdomain, 'temp-id');
          console.log('✅ DNS subdomain created:', subdomainResult);
        } catch (error) {
          console.error('❌ Failed to create DNS subdomain:', error.message);
          // Continue with tenancy creation even if DNS fails
          // You can decide whether to fail the entire process or continue
          console.log('⚠️ Continuing with tenancy creation despite DNS failure');
        }
      }
      
      // Create tenancy
      const tenancy = new Tenancy({
        name,
        slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description,
        subdomain: finalSubdomain,
        contact,
        owner: owner._id,
        subscription: subscriptionData,
        status: 'active',
        createdBy: req.admin?._id || null,
        // Store DNS record info if created
        dnsRecord: subdomainResult ? {
          recordId: subdomainResult.recordId,
          provider: subdomainResult.provider,
          createdAt: new Date()
        } : null
      });
      
      console.log('📝 Creating tenancy:', { 
        name, 
        slug: tenancy.slug, 
        subdomain: tenancy.subdomain, 
        ownerId: owner._id,
        dnsCreated: !!subdomainResult
      });
      
      await tenancy.save();
      console.log('✅ Tenancy saved:', tenancy._id);
      
      // Update subdomain service log with actual tenant ID
      if (subdomainResult) {
        await subdomainService.logSubdomainCreation(finalSubdomain, tenancy._id.toString(), subdomainResult);
      }
      
      // Update owner with tenancy reference
      owner.tenancy = tenancy._id;
      await owner.save();
      
      // Determine the portal URL
      const portalUrl = subdomainResult 
        ? subdomainResult.url 
        : `https://${tenancy.subdomain}.${process.env.MAIN_DOMAIN || 'laundry-platform.com'}`;
      
      // Send welcome email to owner
      try {
        await sendEmail({
          to: owner.email,
          subject: `Welcome to ${name} - Your Laundry Portal is Ready!`,
          html: `
            <h2>Welcome to ${name}!</h2>
            <p>Your laundry portal has been created successfully.</p>
            <p><strong>Portal URL:</strong> ${portalUrl}</p>
            <p><strong>Admin Login:</strong> ${portalUrl}/auth/login</p>
            <p><strong>Email:</strong> ${owner.email}</p>
            <p><strong>Temporary Password:</strong> ${tempPassword}</p>
            <p>Please change your password after first login.</p>
            ${subdomainResult ? '<p>✅ Custom subdomain has been configured and is ready to use!</p>' : ''}
          `
        });
      } catch (emailError) {
        console.error('Failed to send welcome email:', emailError);
      }
      
      // Verify subdomain is working (optional, non-blocking)
      if (subdomainResult) {
        setTimeout(async () => {
          try {
            const isWorking = await subdomainService.verifySubdomain(finalSubdomain);
            console.log(`🔍 Subdomain verification for ${finalSubdomain}:`, isWorking ? '✅ Working' : '❌ Not working');
          } catch (error) {
            console.error('Subdomain verification error:', error);
          }
        }, 30000); // Check after 30 seconds to allow DNS propagation
      }
      
      res.status(201).json({
        success: true,
        message: 'Tenancy created successfully' + (subdomainResult ? ' with custom subdomain' : ''),
        data: {
          tenancy: await Tenancy.findById(tenancy._id).populate('owner', 'name email phone'),
          owner: { email: owner.email, tempPassword },
          subdomain: subdomainResult ? {
            url: subdomainResult.url,
            subdomain: subdomainResult.subdomain,
            dnsCreated: true
          } : {
            url: portalUrl,
            subdomain: `${finalSubdomain}.${process.env.MAIN_DOMAIN || 'laundry-platform.com'}`,
            dnsCreated: false
          }
        }
      });
    } catch (error) {
      console.error('Create tenancy error:', error.message);
      console.error('Error stack:', error.stack);
      res.status(500).json({ success: false, message: 'Failed to create tenancy: ' + error.message });
    }
  },

  // Update tenancy
  updateTenancy: async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      // Remove fields that shouldn't be updated directly
      delete updates.owner;
      delete updates.createdBy;
      delete updates.stats;
      
      // Get existing tenancy first
      const existingTenancy = await Tenancy.findById(id);
      if (!existingTenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }
      
      // Track if features changed
      const featuresChanged = updates.subscription?.features && 
        JSON.stringify(existingTenancy.subscription.features) !== JSON.stringify(updates.subscription.features);
      
      // Handle subscription.features merge properly
      if (updates.subscription?.features) {
        // Merge existing subscription with new updates
        updates.subscription = {
          ...existingTenancy.subscription.toObject(),
          ...updates.subscription,
          features: {
            ...existingTenancy.subscription.features,
            ...updates.subscription.features
          }
        };
      }
      
      const tenancy = await Tenancy.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
      ).populate('owner', 'name email phone');
      
      console.log('✅ Tenancy updated:', id, 'Features:', tenancy.subscription?.features);
      
      // Notify all admins of this tenancy if features changed
      if (featuresChanged) {
        console.log('🔔 Features changed, notifying admins of tenancy:', id);
        const User = require('../models/User');
        const PermissionSyncService = require('../services/permissionSyncService');
        
        // Find all admins in this tenancy
        const admins = await User.find({ 
          tenancy: id, 
          role: { $in: ['admin', 'branch_admin'] },
          isActive: true 
        });
        
        console.log(`📢 Found ${admins.length} admins to notify`);
        
        // Notify each admin
        for (const admin of admins) {
          await PermissionSyncService.notifyPermissionUpdate(admin._id, {
            features: tenancy.subscription.features,
            tenancy: id,
            recipientType: admin.role === 'admin' ? 'admin' : 'branch_admin'
          });
        }
      }
      
      res.json({
        success: true,
        message: 'Tenancy updated successfully',
        data: { tenancy }
      });
    } catch (error) {
      console.error('Update tenancy error:', error);
      res.status(500).json({ success: false, message: 'Failed to update tenancy' });
    }
  },

  // Update tenancy status
  updateTenancyStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!['active', 'inactive', 'suspended', 'pending'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      
      const tenancy = await Tenancy.findByIdAndUpdate(
        id,
        { status },
        { new: true }
      ).populate('owner', 'name email phone');
      
      if (!tenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }
      
      res.json({
        success: true,
        message: `Tenancy ${status === 'active' ? 'activated' : status}`,
        data: { tenancy }
      });
    } catch (error) {
      console.error('Update tenancy status error:', error);
      res.status(500).json({ success: false, message: 'Failed to update status' });
    }
  },

  // Update tenancy branding
  updateBranding: async (req, res) => {
    try {
      const { id } = req.params;
      const { branding } = req.body;
      
      const tenancy = await Tenancy.findByIdAndUpdate(
        id,
        { $set: { branding } },
        { new: true }
      );
      
      if (!tenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }
      
      res.json({
        success: true,
        message: 'Branding updated successfully',
        data: { tenancy }
      });
    } catch (error) {
      console.error('Update branding error:', error);
      res.status(500).json({ success: false, message: 'Failed to update branding' });
    }
  },

  // Update subscription
  updateSubscription: async (req, res) => {
    try {
      const { id } = req.params;
      const { subscription } = req.body;
      
      const tenancy = await Tenancy.findByIdAndUpdate(
        id,
        { $set: { subscription } },
        { new: true }
      );
      
      if (!tenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }
      
      res.json({
        success: true,
        message: 'Subscription updated successfully',
        data: { tenancy }
      });
    } catch (error) {
      console.error('Update subscription error:', error);
      res.status(500).json({ success: false, message: 'Failed to update subscription' });
    }
  },

  // Update tenancy features/permissions
  updateFeatures: async (req, res) => {
    try {
      const { id } = req.params;
      const { features } = req.body;
      
      if (!features || typeof features !== 'object') {
        return res.status(400).json({ 
          success: false, 
          message: 'Features object is required' 
        });
      }
      
      const tenancy = await Tenancy.findById(id);
      if (!tenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }
      
      // Update features in subscription
      tenancy.subscription.features = {
        ...tenancy.subscription.features,
        ...features
      };
      
      await tenancy.save();
      
      console.log('✅ Features updated for tenancy:', id, features);
      
      // Notify all admins in this tenancy about feature update via WebSocket
      const User = require('../models/User');
      const PermissionSyncService = require('../services/permissionSyncService');
      
      const admins = await User.find({ 
        tenancy: id, 
        role: { $in: ['admin', 'branch_admin'] },
        isActive: true 
      }).select('_id email role');
      
      console.log(`📋 Found ${admins.length} admin(s) in tenancy ${id}:`, admins.map(a => ({
        id: a._id,
        email: a.email,
        role: a.role
      })));
      
      for (const admin of admins) {
        await PermissionSyncService.notifyPermissionUpdate(admin._id, {
          features: tenancy.subscription.features,
          tenancy: id,
          recipientType: 'admin'
        });
      }
      console.log(`📢 Notified ${admins.length} admin(s) about feature update via WebSocket`);
      
      res.json({
        success: true,
        message: 'Features updated successfully',
        data: { 
          tenancy: await Tenancy.findById(id).populate('owner', 'name email phone')
        }
      });
    } catch (error) {
      console.error('Update features error:', error);
      res.status(500).json({ success: false, message: 'Failed to update features' });
    }
  },

  // Delete tenancy (soft delete)
  deleteTenancy: async (req, res) => {
    try {
      const { id } = req.params;
      
      const tenancy = await Tenancy.findById(id);
      if (!tenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }
      
      // Delete DNS record if it exists
      if (tenancy.dnsRecord?.recordId) {
        try {
          console.log('🗑️ Deleting DNS record for tenancy:', tenancy.subdomain);
          await subdomainService.deleteSubdomain(tenancy.subdomain, tenancy.dnsRecord.recordId);
          console.log('✅ DNS record deleted successfully');
        } catch (error) {
          console.error('❌ Failed to delete DNS record:', error.message);
          // Continue with tenancy deletion even if DNS deletion fails
        }
      }
      
      // Soft delete the tenancy
      const updatedTenancy = await Tenancy.findByIdAndUpdate(
        id,
        { 
          isDeleted: true, 
          deletedAt: new Date(), 
          status: 'inactive',
          // Clear DNS record info since it's deleted
          dnsRecord: null
        },
        { new: true }
      );
      
      // Deactivate owner
      await User.findByIdAndUpdate(tenancy.owner, { isActive: false });
      
      res.json({
        success: true,
        message: 'Tenancy and associated subdomain deleted successfully'
      });
    } catch (error) {
      console.error('Delete tenancy error:', error);
      res.status(500).json({ success: false, message: 'Failed to delete tenancy' });
    }
  },

  // Get tenancy stats
  getTenancyStats: async (req, res) => {
    try {
      const [
        totalTenancies,
        activeTenancies,
        trialTenancies,
        suspendedTenancies
      ] = await Promise.all([
        Tenancy.countDocuments({ isDeleted: false }),
        Tenancy.countDocuments({ status: 'active', isDeleted: false }),
        Tenancy.countDocuments({ 'subscription.status': 'trial', isDeleted: false }),
        Tenancy.countDocuments({ status: 'suspended', isDeleted: false })
      ]);
      
      res.json({
        success: true,
        data: {
          stats: {
            total: totalTenancies,
            active: activeTenancies,
            trial: trialTenancies,
            suspended: suspendedTenancies
          }
        }
      });
    } catch (error) {
      console.error('Get tenancy stats error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
  }
};

module.exports = tenancyController;
