const asyncHandler = require('express-async-handler');
const Tenancy = require('../../models/Tenancy');
const User = require('../../models/User');
const Order = require('../../models/Order');
const AuditLog = require('../../models/AuditLog');

/**
 * Tenant Enablement Controller
 * Helps tenants get set up and succeed on the platform
 */

// @desc    Get tenant overview for support
// @route   GET /api/support/tenants
// @access  Private (Platform Support)
const getTenantOverview = asyncHandler(async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;

    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
        { 'contactInfo.email': { $regex: search, $options: 'i' } }
      ];
    }

    if (status) {
      query.status = status;
    }

    const tenants = await Tenancy.find(query)
      .populate('ownerId', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Tenancy.countDocuments(query);

    // Get additional metrics for each tenant
    const tenantsWithMetrics = await Promise.all(
      tenants.map(async (tenant) => {
        const [orderCount, userCount, lastOrder] = await Promise.all([
          Order.countDocuments({ tenantId: tenant._id }),
          User.countDocuments({ tenantId: tenant._id }),
          Order.findOne({ tenantId: tenant._id }).sort({ createdAt: -1 })
        ]);

        return {
          ...tenant.toObject(),
          metrics: {
            totalOrders: orderCount,
            totalUsers: userCount,
            lastOrderDate: lastOrder?.createdAt,
            daysSinceLastOrder: lastOrder ? 
              Math.floor((Date.now() - new Date(lastOrder.createdAt)) / (1000 * 60 * 60 * 24)) : null
          }
        };
      })
    );

    res.json({
      success: true,
      data: {
        tenants: tenantsWithMetrics,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Tenant overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get tenant overview'
    });
  }
});

// @desc    Get tenant onboarding status
// @route   GET /api/support/tenants/:tenantId/onboarding
// @access  Private (Platform Support)
const getTenantOnboardingStatus = asyncHandler(async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await Tenancy.findById(tenantId)
      .populate('ownerId', 'name email phone isEmailVerified phoneVerified');

    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Check onboarding completion status
    const [
      hasUsers,
      hasOrders,
      hasServices,
      hasBranches,
      hasPaymentSetup
    ] = await Promise.all([
      User.countDocuments({ tenantId }) > 0,
      Order.countDocuments({ tenantId }) > 0,
      // TODO: Check if tenant has configured services
      Promise.resolve(false),
      // TODO: Check if tenant has set up branches
      Promise.resolve(false),
      // TODO: Check if tenant has payment gateway configured
      Promise.resolve(false)
    ]);

    const onboardingSteps = [
      {
        step: 'account_verification',
        title: 'Account Verification',
        completed: tenant.ownerId.isEmailVerified && tenant.ownerId.phoneVerified,
        description: 'Email and phone verification'
      },
      {
        step: 'business_info',
        title: 'Business Information',
        completed: !!(tenant.businessInfo?.businessType && tenant.businessInfo?.address),
        description: 'Complete business profile'
      },
      {
        step: 'team_setup',
        title: 'Team Setup',
        completed: hasUsers,
        description: 'Add team members'
      },
      {
        step: 'service_configuration',
        title: 'Service Configuration',
        completed: hasServices,
        description: 'Configure laundry services'
      },
      {
        step: 'branch_setup',
        title: 'Branch Setup',
        completed: hasBranches,
        description: 'Set up service locations'
      },
      {
        step: 'payment_setup',
        title: 'Payment Gateway',
        completed: hasPaymentSetup,
        description: 'Configure payment methods'
      },
      {
        step: 'first_order',
        title: 'First Order',
        completed: hasOrders,
        description: 'Process first customer order'
      }
    ];

    const completedSteps = onboardingSteps.filter(step => step.completed).length;
    const completionPercentage = Math.round((completedSteps / onboardingSteps.length) * 100);

    res.json({
      success: true,
      data: {
        tenant,
        onboarding: {
          steps: onboardingSteps,
          completedSteps,
          totalSteps: onboardingSteps.length,
          completionPercentage,
          isComplete: completedSteps === onboardingSteps.length
        }
      }
    });
  } catch (error) {
    console.error('Tenant onboarding status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get onboarding status'
    });
  }
});

// @desc    Get tenant setup assistance recommendations
// @route   GET /api/support/tenants/:tenantId/setup-assistance
// @access  Private (Platform Support)
const getTenantSetupAssistance = asyncHandler(async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await Tenancy.findById(tenantId);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }

    // Analyze tenant's current state and provide recommendations
    const [orderCount, userCount, recentOrders] = await Promise.all([
      Order.countDocuments({ tenantId }),
      User.countDocuments({ tenantId }),
      Order.find({ tenantId }).sort({ createdAt: -1 }).limit(5)
    ]);

    const recommendations = [];

    // No orders in 30 days
    const lastOrder = recentOrders[0];
    if (!lastOrder || (Date.now() - new Date(lastOrder.createdAt)) > 30 * 24 * 60 * 60 * 1000) {
      recommendations.push({
        type: 'critical',
        title: 'No Recent Orders',
        description: 'Tenant hasn\'t received orders in 30+ days',
        actions: [
          'Check service availability',
          'Review pricing strategy',
          'Verify location settings',
          'Marketing assistance needed'
        ]
      });
    }

    // Low user count
    if (userCount < 2) {
      recommendations.push({
        type: 'warning',
        title: 'Limited Team Size',
        description: 'Only one team member - consider adding staff',
        actions: [
          'Add branch managers',
          'Set up staff accounts',
          'Configure role permissions'
        ]
      });
    }

    // No orders but active
    if (orderCount === 0 && tenant.status === 'active') {
      recommendations.push({
        type: 'info',
        title: 'Ready for First Order',
        description: 'Setup complete, waiting for first customer',
        actions: [
          'Test order flow',
          'Verify service areas',
          'Check payment gateway',
          'Marketing launch support'
        ]
      });
    }

    res.json({
      success: true,
      data: {
        tenant,
        metrics: {
          orderCount,
          userCount,
          lastOrderDate: lastOrder?.createdAt
        },
        recommendations,
        setupScore: Math.min(100, (orderCount * 10) + (userCount * 20) + 30)
      }
    });
  } catch (error) {
    console.error('Setup assistance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get setup assistance'
    });
  }
});

// @desc    Get training materials for tenant
// @route   GET /api/support/tenants/training
// @access  Private (Platform Support)
const getTrainingMaterials = asyncHandler(async (req, res) => {
  try {
    const { category, search } = req.query;

    // Static training materials (in real app, this would come from database)
    let materials = [
      {
        id: 'getting-started',
        title: 'Getting Started Guide',
        category: 'onboarding',
        description: 'Complete guide to setting up your laundry business',
        type: 'guide',
        duration: '15 min read',
        topics: ['Account setup', 'Service configuration', 'Team management']
      },
      {
        id: 'order-management',
        title: 'Order Management Best Practices',
        category: 'operations',
        description: 'How to efficiently manage customer orders',
        type: 'video',
        duration: '12 min watch',
        topics: ['Order workflow', 'Status updates', 'Customer communication']
      },
      {
        id: 'pricing-strategy',
        title: 'Pricing Strategy Workshop',
        category: 'business',
        description: 'Set competitive and profitable pricing',
        type: 'workshop',
        duration: '30 min',
        topics: ['Market analysis', 'Cost calculation', 'Dynamic pricing']
      },
      {
        id: 'customer-service',
        title: 'Customer Service Excellence',
        category: 'operations',
        description: 'Deliver exceptional customer experience',
        type: 'guide',
        duration: '20 min read',
        topics: ['Communication', 'Problem resolution', 'Feedback handling']
      },
      {
        id: 'payment-gateway',
        title: 'Payment Gateway Setup',
        category: 'technical',
        description: 'Configure payment methods and troubleshoot issues',
        type: 'tutorial',
        duration: '10 min',
        topics: ['Gateway configuration', 'Testing payments', 'Troubleshooting']
      }
    ];

    // Filter by category
    if (category) {
      materials = materials.filter(material => material.category === category);
    }

    // Filter by search
    if (search) {
      materials = materials.filter(material => 
        material.title.toLowerCase().includes(search.toLowerCase()) ||
        material.description.toLowerCase().includes(search.toLowerCase()) ||
        material.topics.some(topic => topic.toLowerCase().includes(search.toLowerCase()))
      );
    }

    const categories = [
      { id: 'onboarding', name: 'Getting Started', count: 1 },
      { id: 'operations', name: 'Operations', count: 2 },
      { id: 'business', name: 'Business Growth', count: 1 },
      { id: 'technical', name: 'Technical Setup', count: 1 }
    ];

    res.json({
      success: true,
      data: {
        materials,
        categories,
        total: materials.length
      }
    });
  } catch (error) {
    console.error('Training materials error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get training materials'
    });
  }
});

module.exports = {
  getTenantOverview,
  getTenantOnboardingStatus,
  getTenantSetupAssistance,
  getTrainingMaterials
};