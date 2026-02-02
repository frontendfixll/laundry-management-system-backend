const AddOn = require('../../models/AddOn');
const TenantAddOn = require('../../models/TenantAddOn');
const AddOnTransaction = require('../../models/AddOnTransaction');
const Tenancy = require('../../models/Tenancy');
const { validationResult } = require('express-validator');
const socketService = require('../../services/socketService');
const permissionSyncService = require('../../services/permissionSyncService');

/**
 * Get all add-ons (Super Admin)
 */
const getAllAddOns = async (req, res) => {
  try {
    const {
      status,
      category,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      limit = 20,
      page = 1
    } = req.query;

    // Build filter query
    const filters = { isDeleted: false };
    if (status) filters.status = status;
    if (category) filters.category = category;
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { displayName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort query
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get add-ons with pagination
    const skip = (page - 1) * limit;
    const [addOns, totalCount] = await Promise.all([
      AddOn.find(filters)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AddOn.countDocuments(filters)
    ]);

    // Get usage statistics for each add-on
    const enrichedAddOns = await Promise.all(
      addOns.map(async (addOn) => {
        const [activeSubscriptions, totalRevenue] = await Promise.all([
          TenantAddOn.countDocuments({
            addOn: addOn._id,
            status: { $in: ['active', 'trial'] },
            isDeleted: false
          }),
          AddOnTransaction.aggregate([
            {
              $match: {
                'lineItems.addOn': addOn._id,
                status: 'completed'
              }
            },
            {
              $group: {
                _id: null,
                total: { $sum: '$amount.total' }
              }
            }
          ])
        ]);

        return {
          ...addOn,
          stats: {
            activeSubscriptions,
            totalRevenue: totalRevenue[0]?.total || 0,
            conversionRate: addOn.analytics.views > 0 ?
              ((addOn.analytics.purchases / addOn.analytics.views) * 100).toFixed(2) : 0
          }
        };
      })
    );

    // Get summary statistics
    const summary = await AddOn.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const summaryStats = {
      total: totalCount,
      active: 0,
      draft: 0,
      hidden: 0,
      deprecated: 0
    };

    summary.forEach(stat => {
      summaryStats[stat._id] = stat.count;
    });

    return res.json({
      success: true,
      data: {
        addOns: enrichedAddOns,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        },
        summary: summaryStats
      }
    });
  } catch (error) {
    console.error('Get all add-ons error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch add-ons'
    });
  }
};

/**
 * Get single add-on by ID (Super Admin)
 */
const getAddOn = async (req, res) => {
  try {
    const { addOnId } = req.params;

    // Find the add-on
    const addOn = await AddOn.findOne({
      _id: addOnId,
      isDeleted: false
    })
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .lean();

    if (!addOn) {
      return res.status(404).json({
        success: false,
        message: 'Add-on not found'
      });
    }

    // Get usage statistics
    const [activeSubscriptions, totalRevenue] = await Promise.all([
      TenantAddOn.countDocuments({
        addOn: addOn._id,
        status: { $in: ['active', 'trial'] },
        isDeleted: false
      }),
      AddOnTransaction.aggregate([
        {
          $match: {
            'lineItems.addOn': addOn._id,
            status: 'completed'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount.total' }
          }
        }
      ])
    ]);

    // Enrich with stats
    const enrichedAddOn = {
      ...addOn,
      stats: {
        activeSubscriptions,
        totalRevenue: totalRevenue[0]?.total || 0,
        conversionRate: addOn.analytics.views > 0 ?
          ((addOn.analytics.purchases / addOn.analytics.views) * 100).toFixed(2) : '0.00'
      }
    };

    return res.status(200).json({
      success: true,
      data: {
        addOn: enrichedAddOn
      }
    });
  } catch (error) {
    console.error('Get add-on error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch add-on'
    });
  }
};

/**
 * Create new add-on
 */
const createAddOn = async (req, res) => {
  try {
    console.log('🔍 Create AddOn - Request body:', JSON.stringify(req.body, null, 2));
    console.log('🔍 Create AddOn - Admin info:', req.admin ? { id: req.admin._id, email: req.admin.email } : 'NO ADMIN');

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Validation errors:', errors.array());
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    if (!req.admin || !req.admin._id) {
      console.log('❌ No admin found in request');
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    const superAdminId = req.admin._id;
    const addOnData = {
      ...req.body,
      createdBy: superAdminId
    };

    console.log('🔍 Final addOnData:', JSON.stringify(addOnData, null, 2));

    // Validate pricing based on billing cycle
    const { billingCycle, pricing } = addOnData;
    if (billingCycle === 'monthly' && (!pricing.monthly || pricing.monthly <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Monthly pricing is required for monthly billing cycle'
      });
    }

    if (billingCycle === 'yearly' && (!pricing.yearly || pricing.yearly <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'Yearly pricing is required for yearly billing cycle'
      });
    }

    if (billingCycle === 'one-time' && (!pricing.oneTime || pricing.oneTime <= 0)) {
      return res.status(400).json({
        success: false,
        message: 'One-time pricing is required for one-time billing cycle'
      });
    }

    // Create add-on
    console.log('🔍 Creating AddOn with data...');
    const addOn = new AddOn(addOnData);
    await addOn.save();
    console.log('✅ AddOn created successfully:', addOn._id);

    // Populate creator info
    await addOn.populate('createdBy', 'name email');

    return res.status(201).json({
      success: true,
      message: 'Add-on created successfully',
      data: { addOn }
    });
  } catch (error) {
    console.error('❌ Create add-on error:', error);
    console.error('❌ Error stack:', error.stack);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Add-on with this slug already exists'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create add-on',
      error: error.message
    });
  }
};

/**
 * Update add-on
 */
const updateAddOn = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { addOnId } = req.params;
    const superAdminId = req.admin._id;
    const updateData = {
      ...req.body,
      updatedBy: superAdminId
    };

    const addOn = await AddOn.findById(addOnId);
    if (!addOn) {
      return res.status(404).json({
        success: false,
        message: 'Add-on not found'
      });
    }

    // Check if add-on has active subscriptions for critical changes
    const activeSubscriptions = await TenantAddOn.countDocuments({
      addOn: addOnId,
      status: { $in: ['active', 'trial'] },
      isDeleted: false
    });

    // Prevent critical changes if there are active subscriptions
    const criticalFields = ['billingCycle', 'category', 'config'];
    const hasCriticalChanges = criticalFields.some(field =>
      updateData[field] && JSON.stringify(updateData[field]) !== JSON.stringify(addOn[field])
    );

    if (activeSubscriptions > 0 && hasCriticalChanges) {
      return res.status(400).json({
        success: false,
        message: `Cannot modify critical fields (${criticalFields.join(', ')}) for add-on with active subscriptions. Create a new version instead.`,
        activeSubscriptions
      });
    }

    // Update version if significant changes
    if (hasCriticalChanges) {
      const currentVersion = addOn.version || '1.0.0';
      const versionParts = currentVersion.split('.').map(Number);
      versionParts[1] += 1; // Increment minor version
      updateData.version = versionParts.join('.');

      // Add changelog entry
      if (!updateData.changelog) updateData.changelog = addOn.changelog || [];
      updateData.changelog.push({
        version: updateData.version,
        changes: req.body.changelogEntry ? [req.body.changelogEntry] : ['Configuration updated'],
        date: new Date()
      });
    }

    // Update add-on
    Object.assign(addOn, updateData);
    await addOn.save();

    // Populate updated info
    await addOn.populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'updatedBy', select: 'name email' }
    ]);

    // If pricing changed, notify affected tenants
    if (updateData.pricing && activeSubscriptions > 0) {
      // TODO: Implement notification to affected tenants
      console.log(`Pricing updated for add-on ${addOn.name} with ${activeSubscriptions} active subscriptions`);
    }

    return res.json({
      success: true,
      message: 'Add-on updated successfully',
      data: { addOn }
    });
  } catch (error) {
    console.error('Update add-on error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update add-on'
    });
  }
};

/**
 * Delete add-on (soft delete)
 */
const deleteAddOn = async (req, res) => {
  try {
    const { addOnId } = req.params;
    const superAdminId = req.admin._id;

    const addOn = await AddOn.findById(addOnId);
    if (!addOn) {
      return res.status(404).json({
        success: false,
        message: 'Add-on not found'
      });
    }

    // Check for active subscriptions
    const activeSubscriptions = await TenantAddOn.countDocuments({
      addOn: addOnId,
      status: { $in: ['active', 'trial'] },
      isDeleted: false
    });

    if (activeSubscriptions > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete add-on with ${activeSubscriptions} active subscriptions. Set status to 'deprecated' instead.`,
        activeSubscriptions
      });
    }

    // Soft delete
    addOn.isDeleted = true;
    addOn.deletedAt = new Date();
    addOn.deletedBy = superAdminId;
    addOn.status = 'deprecated';
    await addOn.save();

    return res.json({
      success: true,
      message: 'Add-on deleted successfully'
    });
  } catch (error) {
    console.error('Delete add-on error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete add-on'
    });
  }
};

/**
 * Get add-on analytics
 */
const getAddOnAnalytics = async (req, res) => {
  try {
    const { addOnId } = req.params;
    const { period = '30d' } = req.query;

    const addOn = await AddOn.findById(addOnId);
    if (!addOn) {
      return res.status(404).json({
        success: false,
        message: 'Add-on not found'
      });
    }

    // Calculate date range
    const endDate = new Date();
    let startDate = new Date();

    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    // Get subscription analytics
    const [
      totalSubscriptions,
      activeSubscriptions,
      trialSubscriptions,
      cancelledSubscriptions,
      revenueStats,
      subscriptionTrend
    ] = await Promise.all([
      TenantAddOn.countDocuments({ addOn: addOnId, isDeleted: false }),
      TenantAddOn.countDocuments({
        addOn: addOnId,
        status: 'active',
        isDeleted: false
      }),
      TenantAddOn.countDocuments({
        addOn: addOnId,
        status: 'trial',
        isDeleted: false
      }),
      TenantAddOn.countDocuments({
        addOn: addOnId,
        status: 'cancelled',
        isDeleted: false
      }),

      // Revenue statistics
      AddOnTransaction.aggregate([
        {
          $match: {
            'lineItems.addOn': addOn._id,
            status: 'completed',
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$amount.total' },
            totalTransactions: { $sum: 1 },
            averageTransaction: { $avg: '$amount.total' }
          }
        }
      ]),

      // Subscription trend (daily)
      TenantAddOn.aggregate([
        {
          $match: {
            addOn: addOn._id,
            createdAt: { $gte: startDate, $lte: endDate },
            isDeleted: false
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            newSubscriptions: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } }
      ])
    ]);

    // Get top tenants by usage/revenue
    const topTenants = await AddOnTransaction.aggregate([
      {
        $match: {
          'lineItems.addOn': addOn._id,
          status: 'completed'
        }
      },
      {
        $group: {
          _id: '$tenant',
          totalSpent: { $sum: '$amount.total' },
          transactionCount: { $sum: 1 }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'tenancies',
          localField: '_id',
          foreignField: '_id',
          as: 'tenant'
        }
      },
      { $unwind: '$tenant' },
      {
        $project: {
          tenantName: '$tenant.name',
          totalSpent: 1,
          transactionCount: 1
        }
      }
    ]);

    return res.json({
      success: true,
      data: {
        addOn: {
          id: addOn._id,
          name: addOn.name,
          displayName: addOn.displayName,
          category: addOn.category,
          status: addOn.status
        },
        period,
        dateRange: { startDate, endDate },
        subscriptions: {
          total: totalSubscriptions,
          active: activeSubscriptions,
          trial: trialSubscriptions,
          cancelled: cancelledSubscriptions,
          churnRate: totalSubscriptions > 0 ?
            ((cancelledSubscriptions / totalSubscriptions) * 100).toFixed(2) : 0
        },
        revenue: revenueStats[0] || {
          totalRevenue: 0,
          totalTransactions: 0,
          averageTransaction: 0
        },
        trends: {
          subscriptions: subscriptionTrend
        },
        topTenants,
        performance: {
          views: addOn.analytics.views,
          purchases: addOn.analytics.purchases,
          conversionRate: addOn.analytics.conversionRate,
          totalRevenue: addOn.analytics.revenue
        }
      }
    });
  } catch (error) {
    console.error('Get add-on analytics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch add-on analytics'
    });
  }
};

/**
 * Assign add-on to tenant (Super Admin)
 */
const assignAddOnToTenant = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { addOnId } = req.params;
    const {
      tenantId,
      billingCycle = 'monthly',
      quantity = 1,
      customPricing,
      discount,
      notes,
      trialDays = 0
    } = req.body;

    const superAdminId = req.admin._id;

    // Validate add-on and tenant
    const [addOn, tenant] = await Promise.all([
      AddOn.findById(addOnId),
      Tenancy.findById(tenantId)
    ]);

    if (!addOn) {
      return res.status(404).json({
        success: false,
        message: 'Add-on not found'
      });
    }

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Check if tenant already has this add-on
    const existingAddOn = await TenantAddOn.findByTenantAndAddOn(tenantId, addOnId);
    if (existingAddOn && addOn.maxQuantity === 1) {
      return res.status(400).json({
        success: false,
        message: 'Tenant already has this add-on'
      });
    }

    // Create tenant add-on
    const tenantAddOn = new TenantAddOn({
      tenant: tenantId,
      addOn: addOnId,
      status: trialDays > 0 ? 'trial' : 'active',
      billingCycle,
      quantity,
      pricingSnapshot: {
        monthly: addOn.pricing.monthly,
        yearly: addOn.pricing.yearly,
        oneTime: addOn.pricing.oneTime,
        currency: 'INR'
      },
      assignedBy: superAdminId,
      assignedByModel: 'SuperAdmin',
      assignmentMethod: 'admin_assign',
      analytics: {
        activationSource: 'admin_assignment'
      }
    });

    // Set trial period
    if (trialDays > 0) {
      tenantAddOn.trialInfo = {
        isTrialUsed: true,
        trialStartedAt: new Date(),
        trialDays
      };
      tenantAddOn.trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    }

    // Apply custom pricing if provided
    if (customPricing) {
      tenantAddOn.configOverride.customPricing = customPricing;
    }

    // Apply discount if provided
    if (discount) {
      tenantAddOn.configOverride.discount = {
        ...discount,
        appliedBy: superAdminId,
        appliedByModel: 'SuperAdmin'
      };
    }

    // Initialize usage tracking for usage-based add-ons
    if (billingCycle === 'usage-based' && addOn.config?.usage) {
      tenantAddOn.usageTracking = {
        remainingCredits: addOn.config.usage.amount * quantity,
        autoRenew: addOn.config.usage.autoRenew || false,
        renewalThreshold: addOn.config.usage.lowBalanceThreshold || 10
      };
    }

    // Add notes if provided
    if (notes) {
      tenantAddOn.notes.push({
        content: notes,
        addedBy: superAdminId,
        addedByModel: 'SuperAdmin',
        isInternal: true
      });
    }

    await tenantAddOn.save();

    // Emit real-time update to tenant
    socketService.emitToTenant(tenantId, 'addOnAssigned', {
      addOn: {
        id: addOn._id,
        name: addOn.name,
        displayName: addOn.displayName,
        category: addOn.category
      },
      tenantAddOn: {
        id: tenantAddOn._id,
        status: tenantAddOn.status,
        quantity: tenantAddOn.quantity,
        activatedAt: tenantAddOn.activatedAt,
        trialEndsAt: tenantAddOn.trialEndsAt
      },
      assignedBy: 'admin'
    });

    // Trigger feature update event
    socketService.emitToTenant(tenantId, 'featuresUpdated', {
      source: 'addon_assigned',
      addOn: addOn.name,
      features: addOn.config?.features || []
    });

    // Sync permissions
    await permissionSyncService.syncTenancyPermissions(tenantId);

    return res.status(201).json({
      success: true,
      message: 'Add-on assigned to tenant successfully',
      data: {
        tenantAddOn: {
          id: tenantAddOn._id,
          status: tenantAddOn.status,
          quantity: tenantAddOn.quantity,
          activatedAt: tenantAddOn.activatedAt,
          trialEndsAt: tenantAddOn.trialEndsAt
        },
        addOn: {
          id: addOn._id,
          name: addOn.name,
          displayName: addOn.displayName
        },
        tenant: {
          id: tenant._id,
          name: tenant.name
        }
      }
    });
  } catch (error) {
    console.error('Assign add-on to tenant error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to assign add-on to tenant'
    });
  }
};

/**
 * Get add-on subscribers
 */
const getAddOnSubscribers = async (req, res) => {
  try {
    const { addOnId } = req.params;
    const {
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      limit = 20,
      page = 1
    } = req.query;

    const addOn = await AddOn.findById(addOnId);
    if (!addOn) {
      return res.status(404).json({
        success: false,
        message: 'Add-on not found'
      });
    }

    // Build query
    const query = { addOn: addOnId, isDeleted: false };
    if (status) query.status = status;

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get subscribers with pagination
    const skip = (page - 1) * limit;
    const [subscribers, totalCount] = await Promise.all([
      TenantAddOn.find(query)
        .populate('tenant', 'name slug contact.email subscription.plan')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      TenantAddOn.countDocuments(query)
    ]);

    // Enrich with revenue data
    const enrichedSubscribers = await Promise.all(
      subscribers.map(async (subscriber) => {
        const revenue = await AddOnTransaction.aggregate([
          {
            $match: {
              tenant: subscriber.tenant._id,
              'lineItems.addOn': addOn._id,
              status: 'completed'
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount.total' }
            }
          }
        ]);

        return {
          ...subscriber,
          totalRevenue: revenue[0]?.total || 0
        };
      })
    );

    return res.json({
      success: true,
      data: {
        addOn: {
          id: addOn._id,
          name: addOn.name,
          displayName: addOn.displayName
        },
        subscribers: enrichedSubscribers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get add-on subscribers error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch add-on subscribers'
    });
  }
};

/**
 * Get add-on categories and statistics
 */
const getAddOnCategories = async (req, res) => {
  try {
    const categories = await AddOn.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          activeCount: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          totalViews: { $sum: '$analytics.views' },
          totalPurchases: { $sum: '$analytics.purchases' },
          totalRevenue: { $sum: '$analytics.revenue' }
        }
      },
      {
        $project: {
          category: '$_id',
          count: 1,
          activeCount: 1,
          totalViews: 1,
          totalPurchases: 1,
          totalRevenue: 1,
          conversionRate: {
            $cond: [
              { $gt: ['$totalViews', 0] },
              { $multiply: [{ $divide: ['$totalPurchases', '$totalViews'] }, 100] },
              0
            ]
          }
        }
      },
      { $sort: { totalRevenue: -1 } }
    ]);

    return res.json({
      success: true,
      data: { categories }
    });
  } catch (error) {
    console.error('Get add-on categories error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch add-on categories'
    });
  }
};

module.exports = {
  getAllAddOns,
  getAddOn,
  createAddOn,
  updateAddOn,
  deleteAddOn,
  getAddOnAnalytics,
  assignAddOnToTenant,
  getAddOnSubscribers,
  getAddOnCategories
};