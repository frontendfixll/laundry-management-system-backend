const Tenancy = require('../models/Tenancy');
const User = require('../models/User');
const Branch = require('../models/Branch');
const Order = require('../models/Order');
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
        subscription: {
          plan: subscription?.plan || 'trial',
          features: features || {
            orders: true,
            customers: true,
            inventory: true,
            basic_analytics: true,
            email_notifications: true
          }
        },
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

      // Notify SuperAdmins about new tenancy
      try {
        const NotificationService = require('../services/notificationService');
        await NotificationService.notifyAllSuperAdmins({
          type: 'new_tenancy_signup',
          title: 'New Tenancy Signup! 🎉',
          message: `${result.tenancy.name} just signed up for ${result.tenancy.subscription?.plan || 'a plan'}`,
          icon: 'building',
          severity: 'success',
          data: { tenancyId: result.tenancy._id, link: `/tenancies/${result.tenancy._id}` }
        });
      } catch (notifyError) {
        console.error('⚠️ Failed to notify SuperAdmins:', notifyError.message);
      }

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


  // Update tenancy
  updateTenancy: async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const tenancy = await Tenancy.findById(id);
      if (!tenancy) {
        return res.status(404).json({
          success: false,
          message: 'Tenancy not found'
        });
      }

      // Check if features are being updated
      const isUpdatingFeatures = updates.subscription && updates.subscription.features;
      let featureChanges = {};

      if (isUpdatingFeatures) {
        const oldFeatures = tenancy.subscription.features || {};
        const newFeatures = updates.subscription.features;
        featureChanges = detectFeatureChanges(oldFeatures, newFeatures);

        // Merge features
        tenancy.subscription.features = {
          ...oldFeatures,
          ...newFeatures
        };

        // CRITICAL: Mark field as modified for Mongoose Mixed types
        tenancy.markModified('subscription.features');

        // Remove features from updates to prevent overwrite
        delete updates.subscription.features;
      }

      // Apply other updates
      Object.keys(updates).forEach(key => {
        if (key === 'subscription' && updates.subscription) {
          // Merge subscription updates (excluding features which we handled above)
          Object.keys(updates.subscription).forEach(subKey => {
            tenancy.subscription[subKey] = updates.subscription[subKey];
          });
          tenancy.markModified('subscription');
        } else {
          tenancy[key] = updates[key];
        }
      });

      await tenancy.save();

      // If features were updated, send notifications and sync
      if (isUpdatingFeatures && Object.keys(featureChanges).length > 0) {
        try {
          const permissionSyncService = require('../services/permissionSyncService');
          const NotificationService = require('../services/notificationService');
          const User = require('../models/User');

          // Find ALL active admins in this tenancy
          const tenancyAdmins = await User.find({
            tenancy: id,
            role: { $in: ['admin', 'branch_admin'] },
            isActive: true
          }).select('_id email name');

          console.log(`🎯 Found ${tenancyAdmins.length} admins in tenancy ${tenancy.name} for feature update`);

          for (const admin of tenancyAdmins) {
            try {
              // 1. Send visual notification (Green flash/Inbox)
              await NotificationService.notifyDetailedFeatureUpdate(
                admin._id,
                featureChanges,
                tenancy._id,
                req.admin?.email || 'SuperAdmin'
              );

              // 2. Send real-time state sync (Auth Store update)
              await permissionSyncService.notifyPermissionUpdate(
                admin._id.toString(),
                {
                  features: tenancy.subscription.features,
                  tenancyId: tenancy._id.toString(),
                  updatedBy: req.admin?.email || 'SuperAdmin',
                  reason: 'Tenancy features updated'
                }
              );
              console.log(`📡 Feature update and notification dispatched for admin ${admin.email}`);
            } catch (eventError) {
              console.error('❌ Feature update dispatch failed for admin:', eventError);
            }
          }
        } catch (syncError) {
          console.error('Error in feature sync/notification process:', syncError);
        }
      }

      // Populate and return updated tenancy
      const updatedTenancy = await Tenancy.findById(id).populate('owner', 'name email phone');

      res.json({
        success: true,
        message: 'Tenancy updated successfully',
        data: { tenancy: updatedTenancy }
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

      // Detect feature changes for notification
      const oldFeatures = tenancy.subscription.features || {};
      const featureChanges = detectFeatureChanges(oldFeatures, features);

      // Update features in subscription
      tenancy.subscription.features = {
        ...oldFeatures,
        ...features
      };

      // CRITICAL: Mark field as modified for Mongoose Mixed types
      tenancy.markModified('subscription.features');
      await tenancy.save();

      // Emit real-time updates and notifications
      try {
        const permissionSyncService = require('../services/permissionSyncService');
        const NotificationService = require('../services/notificationService');
        const User = require('../models/User');

        // Find ALL active admins in this tenancy
        const tenancyAdmins = await User.find({
          tenancy: id,
          role: { $in: ['admin', 'branch_admin'] },
          isActive: true
        }).select('_id email name');

        console.log(`🎯 Found ${tenancyAdmins.length} admins in tenancy ${tenancy.name} for feature update`);

        for (const admin of tenancyAdmins) {
          try {
            // 1. Send visual notification (Green flash/Inbox)
            await NotificationService.notifyDetailedFeatureUpdate(
              admin._id,
              featureChanges,
              tenancy._id,
              req.admin?.email || 'SuperAdmin'
            );

            // 2. Send real-time state sync (Auth Store update)
            await permissionSyncService.notifyPermissionUpdate(
              admin._id.toString(),
              {
                features: tenancy.subscription.features,
                tenancyId: tenancy._id.toString(),
                updatedBy: req.admin?.email || 'SuperAdmin',
                reason: 'Tenancy features updated'
              }
            );
            console.log(`📡 Feature update and notification dispatched for admin ${admin.email}`);
          } catch (eventError) {
            console.error('❌ Feature update dispatch failed for admin:', eventError);
          }
        }
      } catch (syncError) {
        console.error('Error in feature sync/notification process:', syncError);
      }

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
      console.log(`📋 Request body permissions:`, JSON.stringify(permissions, null, 2));
      console.log(`👤 SuperAdmin user:`, req.admin?.email || 'Unknown');
      console.log(`🕐 Timestamp:`, new Date().toISOString());

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

      // Get current permissions for comparison
      const owner = await User.findById(tenancy.owner._id);
      const oldPermissions = owner.permissions || {};

      // Detect permission changes
      const permissionChanges = detectPermissionChanges(oldPermissions, permissions);

      // Update owner permissions
      owner.permissions = permissions;
      await owner.save();

      console.log(`✅ Updated permissions for owner: ${owner.email}`);
      console.log(`📊 Permission changes detected:`, JSON.stringify(permissionChanges, null, 2));

      // Send enhanced notification with detailed changes
      try {
        const NotificationService = require('../services/notificationService');

        // Create detailed notification for owner
        await NotificationService.notifyDetailedPermissionUpdate(
          owner._id,
          permissionChanges,
          tenancy._id,
          req.admin?.email || 'SuperAdmin'
        );

        console.log(`📧 Enhanced notification sent to owner: ${owner.email}`);

        // Also notify ALL tenancy admins (in case there are multiple admins)
        const User = require('../models/User');
        const tenancyAdmins = await User.find({
          tenancy: tenancy._id,
          role: 'admin',
          isActive: true,
          _id: { $ne: owner._id } // Exclude the owner we already notified
        }).select('_id email name permissions');

        // Send notifications to all tenancy admins
        for (const admin of tenancyAdmins) {
          const notifResult = await NotificationService.notifyDetailedPermissionUpdate(
            admin._id,
            permissionChanges,
            tenancy._id,
            req.admin?.email || 'SuperAdmin'
          );
          console.log(`📧 Enhanced notification sent to admin: ${admin.email}, Result:`, notifResult ? 'OK' : 'Failed');
        }

        // IMPORTANT: Now publish permission update events for real-time UI updates
        // This is separate from notifications and triggers frontend permission refresh
        const permissionSyncService = require('../services/permissionSyncService');

        console.log('📡 Publishing permission update events for real-time UI updates...');

        // Publish permission update event for owner (triggers frontend refresh)
        try {
          await permissionSyncService.notifyPermissionUpdate(
            owner._id.toString(),
            {
              permissions: permissions, // Use the request body permissions which are already POJO
              tenancyId: tenancy._id.toString(),
              updatedBy: req.admin?.email || 'SuperAdmin',
              reason: 'Tenancy permissions updated'
            }
          );
          console.log(`📡 Permission update event published for owner ${owner.email}`);

        } catch (eventError) {
          console.error('❌ Permission update event failed for owner:', eventError);
        }

        // Publish permission update events for all tenancy admins (triggers frontend refresh)
        for (const admin of tenancyAdmins) {
          try {
            await permissionSyncService.notifyPermissionUpdate(
              admin._id.toString(),
              {
                permissions: permissions, // Use the request body permissions
                tenancyId: tenancy._id.toString(),
                updatedBy: req.admin?.email || 'SuperAdmin',
                reason: 'Tenancy permissions updated'
              }
            );
            console.log(`📡 Permission update event published for admin ${admin.email}`);
          } catch (eventError) {
            console.error('❌ Permission update event failed for admin:', eventError);
          }
        }

        console.log('✅ Both notifications and permission update events sent successfully');

      } catch (notifyError) {
        console.log('⚠️ Notification failed:', notifyError.message);
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
          },
          changes: permissionChanges
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

  // Get full overview of a tenancy (branches, user counts, order stats)
  getTenancyOverview: async (req, res) => {
    try {
      const { id } = req.params;

      const tenancy = await Tenancy.findById(id).populate('owner', 'name email phone').lean();
      if (!tenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }

      const mongoose = require('mongoose');
      const tenancyObjId = new mongoose.Types.ObjectId(id);

      const [
        userRoleCounts,
        branchStats,
        orderStats,
        recentOrders
      ] = await Promise.all([
        // Users grouped by role
        User.aggregate([
          { $match: { tenancy: tenancyObjId } },
          { $group: { _id: '$role', count: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } }
        ]),
        // Branch summary
        Branch.aggregate([
          { $match: { tenancy: tenancyObjId } },
          { $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
            inactive: { $sum: { $cond: [{ $ne: ['$status', 'active'] }, 1, 0] } }
          }}
        ]),
        // Order stats
        Order.aggregate([
          { $match: { tenancy: tenancyObjId } },
          { $group: {
            _id: null,
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $in: ['$status', ['delivered', 'completed']] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $in: ['$status', ['placed', 'confirmed', 'processing', 'ready_for_pickup', 'out_for_delivery']] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ['$isCancelled', true] }, 1, 0] } },
            revenue: { $sum: { $ifNull: ['$pricing.total', 0] } }
          }}
        ]),
        // 5 most recent orders
        Order.find({ tenancy: tenancyObjId })
          .populate('customer', 'name phone')
          .populate('branch', 'name')
          .select('orderNumber status pricing.total createdAt customer branch')
          .sort({ createdAt: -1 })
          .limit(5)
          .lean()
      ]);

      const roleMap = userRoleCounts.reduce((acc, r) => { acc[r._id] = r; return acc; }, {});
      const branches = branchStats[0] || { total: 0, active: 0, inactive: 0 };
      const orders = orderStats[0] || { total: 0, completed: 0, pending: 0, cancelled: 0, revenue: 0 };

      res.json({
        success: true,
        data: {
          tenancy,
          summary: {
            branches,
            users: {
              total: userRoleCounts.reduce((s, r) => s + r.count, 0),
              customers: roleMap.customer || { count: 0, active: 0 },
              admins: roleMap.admin || { count: 0, active: 0 },
              branchAdmins: roleMap.branch_admin || { count: 0, active: 0 },
              staff: roleMap.staff || { count: 0, active: 0 },
              support: roleMap.support || { count: 0, active: 0 }
            },
            orders
          },
          recentOrders
        }
      });
    } catch (error) {
      console.error('Get tenancy overview error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch tenancy overview' });
    }
  },

  // Get branches of a tenancy
  getTenancyBranches: async (req, res) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20, status, search } = req.query;

      const tenancy = await Tenancy.findById(id).lean();
      if (!tenancy) return res.status(404).json({ success: false, message: 'Tenancy not found' });

      const query = { tenancy: id };
      if (status) query.status = status;
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { code: { $regex: search, $options: 'i' } },
          { 'address.city': { $regex: search, $options: 'i' } }
        ];
      }

      const [branches, total] = await Promise.all([
        Branch.find(query)
          .populate('manager', 'name email phone')
          .select('name code status address contact manager metrics.totalOrders metrics.totalRevenue metrics.customerCount createdAt')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .lean(),
        Branch.countDocuments(query)
      ]);

      res.json({
        success: true,
        data: {
          branches,
          pagination: { current: parseInt(page), pages: Math.ceil(total / limit), total, limit: parseInt(limit) }
        }
      });
    } catch (error) {
      console.error('Get tenancy branches error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch branches' });
    }
  },

  // Get orders of a tenancy
  getTenancyOrders: async (req, res) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20, status, search } = req.query;

      const tenancy = await Tenancy.findById(id).lean();
      if (!tenancy) return res.status(404).json({ success: false, message: 'Tenancy not found' });

      const query = { tenancy: id };
      if (status && status !== 'all') query.status = status;
      if (search) {
        query.$or = [
          { orderNumber: { $regex: search, $options: 'i' } }
        ];
      }

      const [orders, total] = await Promise.all([
        Order.find(query)
          .populate('customer', 'name phone email')
          .populate('branch', 'name code')
          .select('orderNumber status isCancelled pricing.total paymentStatus serviceType createdAt customer branch')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .lean(),
        Order.countDocuments(query)
      ]);

      res.json({
        success: true,
        data: {
          orders,
          pagination: { current: parseInt(page), pages: Math.ceil(total / limit), total, limit: parseInt(limit) }
        }
      });
    } catch (error) {
      console.error('Get tenancy orders error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch orders' });
    }
  },

  // Get users belonging to a specific tenancy
  getTenancyUsers: async (req, res) => {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20, role, status, search } = req.query;

      const tenancy = await Tenancy.findById(id).lean();
      if (!tenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }

      const query = { tenancy: id };
      if (role) query.role = role;
      if (status === 'active') query.isActive = true;
      if (status === 'inactive') query.isActive = false;
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ];
      }

      const [users, total, roleCounts] = await Promise.all([
        User.find(query)
          .select('name email phone role isActive isVIP totalOrders createdAt')
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .lean(),
        User.countDocuments(query),
        User.aggregate([
          { $match: { tenancy: tenancy._id } },
          { $group: { _id: '$role', count: { $sum: 1 } } }
        ])
      ]);

      const roleCountMap = roleCounts.reduce((acc, r) => {
        acc[r._id] = r.count;
        return acc;
      }, {});

      res.json({
        success: true,
        data: {
          tenancyName: tenancy.name,
          users,
          roleSummary: roleCountMap,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / limit),
            total,
            limit: parseInt(limit)
          }
        }
      });
    } catch (error) {
      console.error('Get tenancy users error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch tenancy users' });
    }
  },

  // Create user within a tenancy
  createTenancyUser: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, email, phone, password, role } = req.body;

      // Validate required fields
      if (!name || !email || !phone || !password || !role) {
        return res.status(400).json({ success: false, message: 'Name, email, phone, password and role are required' });
      }

      // Validate role
      const allowedRoles = ['admin', 'branch_admin', 'staff', 'customer', 'support'];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role. Allowed: ' + allowedRoles.join(', ') });
      }

      // Check tenancy exists
      const tenancy = await Tenancy.findById(id);
      if (!tenancy) {
        return res.status(404).json({ success: false, message: 'Tenancy not found' });
      }

      // Check if email already exists in this tenancy
      const existingUser = await User.findOne({ email, tenancy: id });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'A user with this email already exists in this tenancy' });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create user
      const user = await User.create({
        name,
        email,
        phone,
        password: hashedPassword,
        role,
        tenancy: id,
        isActive: true,
        isEmailVerified: true
      });

      res.status(201).json({
        success: true,
        message: `${role.replace('_', ' ')} created successfully`,
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      console.error('Create tenancy user error:', error);
      if (error.code === 11000) {
        return res.status(400).json({ success: false, message: 'A user with this email or phone already exists' });
      }
      res.status(500).json({ success: false, message: 'Failed to create user' });
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

/**
 * Utility function to detect permission changes between old and new permissions
 */
function detectPermissionChanges(oldPermissions, newPermissions) {
  const changes = {};

  // Get all unique modules from both old and new permissions, filtering out internal Mongoose properties
  const allModules = new Set([
    ...Object.keys(oldPermissions || {}).filter(k => !k.startsWith('$') && !k.startsWith('_')),
    ...Object.keys(newPermissions || {}).filter(k => !k.startsWith('$') && !k.startsWith('_'))
  ]);

  for (const module of allModules) {
    const oldModulePerms = oldPermissions[module] || {};
    const newModulePerms = newPermissions[module] || {};

    // Get all unique actions for this module, filtering out internal Mongoose properties
    const allActions = new Set([
      ...Object.keys(oldModulePerms).filter(k => !k.startsWith('$') && !k.startsWith('_')),
      ...Object.keys(newModulePerms).filter(k => !k.startsWith('$') && !k.startsWith('_'))
    ]);

    const moduleChanges = {};
    let hasChanges = false;

    for (const action of allActions) {
      const oldValue = oldModulePerms[action] || false;
      const newValue = newModulePerms[action] || false;

      if (oldValue !== newValue) {
        moduleChanges[action] = newValue;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      changes[module] = moduleChanges;
    }
  }

  return changes;
}

/**
 * Utility function to create a human-readable permission summary message
 */
function createPermissionSummaryMessage(permissionChanges, updatedBy = 'SuperAdmin') {
  const changedModules = Object.keys(permissionChanges);

  if (changedModules.length === 0) {
    return `${updatedBy} updated your permissions`;
  }

  const totalChanges = changedModules.reduce((count, module) => {
    return count + Object.keys(permissionChanges[module]).length;
  }, 0);

  if (changedModules.length === 1) {
    const module = changedModules[0];
    const actions = Object.keys(permissionChanges[module]);
    const moduleName = module.charAt(0).toUpperCase() + module.slice(1);

    if (actions.length === 1) {
      const action = actions[0];
      const enabled = permissionChanges[module][action];
      return `${updatedBy} ${enabled ? 'granted' : 'revoked'} ${moduleName} ${action} permission`;
    } else {
      return `${updatedBy} updated ${moduleName} permissions (${actions.join(', ')})`;
    }
  } else if (changedModules.length <= 3) {
    const moduleNames = changedModules.map(m => m.charAt(0).toUpperCase() + m.slice(1));
    return `${updatedBy} updated permissions for ${moduleNames.join(', ')}`;
  } else {
    return `${updatedBy} updated ${changedModules.length} modules with ${totalChanges} permission changes`;
  }
}

/**
 * Utility function to detect feature changes between old and new features
 */
function detectFeatureChanges(oldFeatures, newFeatures) {
  const changes = {};

  // Get all unique features from both old and new, filtering out internal Mongoose properties
  const allFeatures = new Set([
    ...Object.keys(oldFeatures || {}).filter(k => !k.startsWith('$') && !k.startsWith('_')),
    ...Object.keys(newFeatures || {}).filter(k => !k.startsWith('$') && !k.startsWith('_'))
  ]);

  for (const feature of allFeatures) {
    const oldValue = oldFeatures[feature];
    const newValue = newFeatures[feature];

    // Only record if the value actually changed
    if (oldValue !== newValue) {
      changes[feature] = newValue;
    }
  }

  return changes;
}

module.exports = tenancyController;
