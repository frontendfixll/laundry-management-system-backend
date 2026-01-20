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
        businessName,
        tagline,
        features
      } = req.body;
      
      // Validate required fields
      if (!name || !ownerData?.email || !ownerData?.name) {
        return res.status(400).json({
          success: false,
          message: 'Tenancy name and owner details (name, email) are required'
        });
      }

      // Use TenancyCreationService for proper isolation
      const TenancyCreationService = require('../services/tenancyCreationService');
      
      // Validate input data
      const validationErrors = TenancyCreationService.validateTenancyData(
        { name, slug, description, businessName, tagline },
        ownerData
      );
      
      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: validationErrors[0],
          errors: validationErrors
        });
      }

      // Generate secure password if not provided
      const adminPassword = ownerData.password || TenancyCreationService.generateSecurePassword();

      // Prepare tenancy data
      const tenancyData = {
        name: name.trim(),
        slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: description || '',
        subdomain: subdomain,
        businessName: businessName || name,
        tagline: tagline || '',
        address: contact?.address || {},
        plan: subscription?.plan || 'trial',
        features: features || {
          orders: true,
          customers: true,
          inventory: true,
          basic_analytics: true,
          email_notifications: true
        }
      };

      // Prepare admin data
      const adminData = {
        name: ownerData.name.trim(),
        email: ownerData.email.toLowerCase().trim(),
        phone: ownerData.phone || '',
        password: adminPassword
      };

      // Create tenancy with isolated admin
      const result = await TenancyCreationService.createTenancyWithAdmin(tenancyData, adminData);

      console.log('✅ Tenancy created successfully:', result.tenancy.id);

      // Send success response with login credentials
      res.status(201).json({
        success: true,
        message: 'Tenancy created successfully with isolated admin credentials',
        data: {
          tenancy: result.tenancy,
          admin: result.admin,
          loginCredentials: {
            email: result.loginCredentials.email,
            password: result.loginCredentials.password,
            loginUrl: result.loginCredentials.loginUrl,
            note: 'These are the admin login credentials for this tenancy. Each tenancy has completely separate login credentials.'
          }
        }
      });

    } catch (error) {
      console.error('❌ Create tenancy error:', error);
      
      if (error.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Failed to create tenancy. Please try again.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  },

  // Get all tenancies with pagination and filtering
  getAllTenancies: async (req, res) => {
    try {
      const { page = 1, limit = 10, search = '', status = 'all', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

      // Build search query
      let query = {};
      if (search) {
        query = {
          $or: [
            { businessName: { $regex: search, $options: 'i' } },
            { subdomain: { $regex: search, $options: 'i' } },
            { contactEmail: { $regex: search, $options: 'i' } }
          ]
        };
      }

      if (status !== 'all') {
        query.isActive = status === 'active';
      }

      // Get total count for pagination
      const total = await Tenancy.countDocuments(query);

      // Get tenancies with pagination
      const tenancies = await Tenancy.find(query)
        .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .populate('owner', 'name email phone')
        .lean();

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
      console.error('Error fetching tenancies:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch tenancies'
      });
    }
  },

  // Get single tenancy by ID
  getTenancyById: async (req, res) => {
    try {
      const { id } = req.params;
      
      const tenancy = await Tenancy.findById(id)
        .populate('owner', 'name email phone')
        .lean();
      
      if (!tenancy) {
        return res.status(404).json({
          success: false,
          message: 'Tenancy not found'
        });
      }
      
      res.json({
        success: true,
        data: { tenancy }
      });
    } catch (error) {
      console.error('Error fetching tenancy:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch tenancy'
      });
    }
  },

  // Update tenancy
  updateTenancy: async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const tenancy = await Tenancy.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
      ).populate('owner', 'name email phone');
      
      if (!tenancy) {
        return res.status(404).json({
          success: false,
          message: 'Tenancy not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Tenancy updated successfully',
        data: { tenancy }
      });
    } catch (error) {
      console.error('Error updating tenancy:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update tenancy'
      });
    }
  },

  // Update tenancy status
  updateTenancyStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      const tenancy = await Tenancy.findByIdAndUpdate(
        id,
        { status },
        { new: true }
      ).populate('owner', 'name email phone');
      
      if (!tenancy) {
        return res.status(404).json({
          success: false,
          message: 'Tenancy not found'
        });
      }
      
      res.json({
        success: true,
        message: `Tenancy ${status}`,
        data: { tenancy }
      });
    } catch (error) {
      console.error('Error updating tenancy status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update tenancy status'
      });
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
      ).populate('owner', 'name email phone');
      
      if (!tenancy) {
        return res.status(404).json({
          success: false,
          message: 'Tenancy not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Branding updated successfully',
        data: { tenancy }
      });
    } catch (error) {
      console.error('Error updating branding:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update branding'
      });
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
      ).populate('owner', 'name email phone');
      
      if (!tenancy) {
        return res.status(404).json({
          success: false,
          message: 'Tenancy not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Subscription updated successfully',
        data: { tenancy }
      });
    } catch (error) {
      console.error('Error updating subscription:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update subscription'
      });
    }
  },

  // Update tenancy features
  updateFeatures: async (req, res) => {
    try {
      const { id } = req.params;
      const { features } = req.body;
      
      const tenancy = await Tenancy.findById(id);
      if (!tenancy) {
        return res.status(404).json({
          success: false,
          message: 'Tenancy not found'
        });
      }
      
      // Update features in subscription
      tenancy.subscription.features = {
        ...tenancy.subscription.features,
        ...features
      };
      
      await tenancy.save();
      
      res.json({
        success: true,
        message: 'Features updated successfully',
        data: { 
          tenancy: await Tenancy.findById(id).populate('owner', 'name email phone')
        }
      });
    } catch (error) {
      console.error('Error updating features:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update features'
      });
    }
  },

  // Delete tenancy (soft delete)
  deleteTenancy: async (req, res) => {
    try {
      const { id } = req.params;
      
      const tenancy = await Tenancy.findByIdAndUpdate(
        id,
        { 
          isDeleted: true, 
          deletedAt: new Date(), 
          status: 'inactive'
        },
        { new: true }
      );
      
      if (!tenancy) {
        return res.status(404).json({
          success: false,
          message: 'Tenancy not found'
        });
      }
      
      // Deactivate owner
      await User.findByIdAndUpdate(tenancy.owner, { isActive: false });
      
      res.json({
        success: true,
        message: 'Tenancy deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting tenancy:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete tenancy'
      });
    }
  },

  // Update tenancy owner permissions
  updateOwnerPermissions: async (req, res) => {
    try {
      const { id } = req.params;
      const { permissions } = req.body;
      
      console.log(`🔧 SuperAdmin updating owner permissions for tenancy: ${id}`);
      
      // Validate permissions object
      if (!permissions || typeof permissions !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Valid permissions object is required'
        });
      }
      
      // Find tenancy
      const tenancy = await Tenancy.findById(id).populate('owner');
      if (!tenancy) {
        return res.status(404).json({
          success: false,
          message: 'Tenancy not found'
        });
      }
      
      if (!tenancy.owner) {
        return res.status(404).json({
          success: false,
          message: 'Tenancy owner not found'
        });
      }
      
      // Update owner permissions
      const owner = await User.findById(tenancy.owner._id);
      owner.permissions = permissions;
      await owner.save();
      
      console.log(`✅ Updated permissions for owner: ${owner.email}`);
      
      // Notify owner about permission update via WebSocket
      try {
        const PermissionSyncService = require('../services/permissionSyncService');
        await PermissionSyncService.notifyPermissionUpdate(owner._id, {
          permissions: owner.permissions,
          tenancy: tenancy._id,
          recipientType: 'tenancy_owner'
        });
        console.log('📢 Notified tenancy owner about permission update via WebSocket');
      } catch (notifyError) {
        console.log('⚠️ WebSocket notification failed:', notifyError.message);
      }
      
      res.json({
        success: true,
        message: 'Owner permissions updated successfully',
        data: {
          tenancy: {
            _id: tenancy._id,
            name: tenancy.name,
            owner: {
              _id: owner._id,
              name: owner.name,
              email: owner.email,
              permissions: owner.permissions
            }
          }
        }
      });
    } catch (error) {
      console.error('Error updating owner permissions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update owner permissions'
      });
    }
  },

  // Get tenancy owner permissions
  getOwnerPermissions: async (req, res) => {
    try {
      const { id } = req.params;
      
      const tenancy = await Tenancy.findById(id).populate('owner', 'name email permissions');
      if (!tenancy) {
        return res.status(404).json({
          success: false,
          message: 'Tenancy not found'
        });
      }
      
      if (!tenancy.owner) {
        return res.status(404).json({
          success: false,
          message: 'Tenancy owner not found'
        });
      }
      
      // Count permissions
      const permissions = tenancy.owner.permissions || {};
      let modules = 0;
      let totalPermissions = 0;
      
      for (const [moduleName, modulePerms] of Object.entries(permissions)) {
        if (typeof modulePerms === 'object' && modulePerms !== null) {
          let moduleHasPermission = false;
          for (const value of Object.values(modulePerms)) {
            if (value === true) {
              totalPermissions++;
              moduleHasPermission = true;
            }
          }
          if (moduleHasPermission) modules++;
        }
      }
      
      res.json({
        success: true,
        data: {
          owner: {
            _id: tenancy.owner._id,
            name: tenancy.owner.name,
            email: tenancy.owner.email,
            permissions: tenancy.owner.permissions,
            permissionSummary: { modules, totalPermissions }
          }
        }
      });
    } catch (error) {
      console.error('Error getting owner permissions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get owner permissions'
      });
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
      console.error('Error fetching tenancy stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch stats'
      });
    }
  }
};

module.exports = tenancyController;
