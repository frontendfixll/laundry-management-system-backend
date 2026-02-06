const ABACPolicy = require('../models/ABACPolicy');
const ABACLog = require('../models/ABACLog');
const abacEngine = require('../services/abacEngine');

/**
 * Get all ABAC policies
 */
const getPolicies = async (req, res) => {
  try {
    const { scope, category, isActive, page = 1, limit = 20 } = req.query;
    
    // Build filter
    const filter = {};
    if (scope) filter.scope = scope;
    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    
    // Get policies with pagination
    const skip = (page - 1) * limit;
    const policies = await ABACPolicy.find(filter)
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email')
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await ABACPolicy.countDocuments(filter);
    
    res.json({
      success: true,
      data: {
        policies,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching ABAC policies:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ABAC policies',
      error: error.message
    });
  }
};

/**
 * Get single ABAC policy
 */
const getPolicy = async (req, res) => {
  try {
    const { id } = req.params;
    
    const policy = await ABACPolicy.findById(id)
      .populate('createdBy', 'name email')
      .populate('lastModifiedBy', 'name email');
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'ABAC policy not found'
      });
    }
    
    res.json({
      success: true,
      data: policy
    });
  } catch (error) {
    console.error('Error fetching ABAC policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ABAC policy',
      error: error.message
    });
  }
};

/**
 * Create new ABAC policy
 */
const createPolicy = async (req, res) => {
  try {
    const {
      name,
      description,
      policyId,
      scope,
      category,
      effect,
      priority,
      subjectAttributes,
      actionAttributes,
      resourceAttributes,
      environmentAttributes
    } = req.body;
    
    // Validate required fields
    if (!name || !description || !policyId || !scope || !category || !effect) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, description, policyId, scope, category, effect'
      });
    }
    
    // Check if policy ID already exists
    const existingPolicy = await ABACPolicy.findOne({ policyId });
    if (existingPolicy) {
      return res.status(400).json({
        success: false,
        message: 'Policy ID already exists'
      });
    }
    
    // Create policy
    const policy = new ABACPolicy({
      name,
      description,
      policyId: policyId.toUpperCase(),
      scope,
      category,
      effect,
      priority: priority || 100,
      subjectAttributes: subjectAttributes || [],
      actionAttributes: actionAttributes || [],
      resourceAttributes: resourceAttributes || [],
      environmentAttributes: environmentAttributes || [],
      createdBy: req.user._id
    });
    
    await policy.save();
    
    // Refresh policy cache
    await abacEngine.refreshPolicyCache();
    
    res.status(201).json({
      success: true,
      message: 'ABAC policy created successfully',
      data: policy
    });
  } catch (error) {
    console.error('Error creating ABAC policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ABAC policy',
      error: error.message
    });
  }
};

/**
 * Update ABAC policy
 */
const updatePolicy = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Remove fields that shouldn't be updated
    delete updateData.policyId;
    delete updateData.createdBy;
    delete updateData.evaluationCount;
    delete updateData.allowCount;
    delete updateData.denyCount;
    
    // Add modification tracking
    updateData.lastModifiedBy = req.user._id;
    updateData.version = { $inc: 1 };
    
    const policy = await ABACPolicy.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email')
     .populate('lastModifiedBy', 'name email');
    
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'ABAC policy not found'
      });
    }
    
    // Refresh policy cache
    await abacEngine.refreshPolicyCache();
    
    res.json({
      success: true,
      message: 'ABAC policy updated successfully',
      data: policy
    });
  } catch (error) {
    console.error('Error updating ABAC policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ABAC policy',
      error: error.message
    });
  }
};

/**
 * Delete ABAC policy
 */
const deletePolicy = async (req, res) => {
  try {
    const { id } = req.params;
    
    const policy = await ABACPolicy.findById(id);
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'ABAC policy not found'
      });
    }
    
    // Check if it's a core policy (prevent deletion)
    const corePolicyIds = [
      'TENANT_ISOLATION',
      'READ_ONLY_ENFORCEMENT',
      'FINANCIAL_APPROVAL_LIMITS',
      'BUSINESS_HOURS_PAYOUTS',
      'AUTOMATION_SCOPE_PROTECTION',
      'NOTIFICATION_TENANT_SAFETY'
    ];
    
    if (corePolicyIds.includes(policy.policyId)) {
      return res.status(400).json({
        success: false,
        message: 'Core policies cannot be deleted. You can deactivate them instead.'
      });
    }
    
    await ABACPolicy.findByIdAndDelete(id);
    
    // Refresh policy cache
    await abacEngine.refreshPolicyCache();
    
    res.json({
      success: true,
      message: 'ABAC policy deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting ABAC policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete ABAC policy',
      error: error.message
    });
  }
};

/**
 * Toggle policy active status
 */
const togglePolicy = async (req, res) => {
  try {
    const { id } = req.params;
    
    const policy = await ABACPolicy.findById(id);
    if (!policy) {
      return res.status(404).json({
        success: false,
        message: 'ABAC policy not found'
      });
    }
    
    policy.isActive = !policy.isActive;
    policy.lastModifiedBy = req.user._id;
    await policy.save();
    
    // Refresh policy cache
    await abacEngine.refreshPolicyCache();
    
    res.json({
      success: true,
      message: `ABAC policy ${policy.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { isActive: policy.isActive }
    });
  } catch (error) {
    console.error('Error toggling ABAC policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle ABAC policy',
      error: error.message
    });
  }
};

/**
 * Test ABAC policy evaluation
 */
const testPolicy = async (req, res) => {
  try {
    const { context } = req.body;
    
    if (!context || !context.subject || !context.action || !context.resource || !context.environment) {
      return res.status(400).json({
        success: false,
        message: 'Invalid context. Required: subject, action, resource, environment'
      });
    }
    
    // Evaluate ABAC policies
    const decision = await abacEngine.evaluate(context);
    
    res.json({
      success: true,
      message: 'ABAC policy evaluation completed',
      data: decision
    });
  } catch (error) {
    console.error('Error testing ABAC policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test ABAC policy',
      error: error.message
    });
  }
};

/**
 * Get ABAC audit logs
 */
const getAuditLogs = async (req, res) => {
  try {
    const { 
      userId, 
      decision, 
      resourceType, 
      action, 
      policyId,
      startDate,
      endDate,
      page = 1, 
      limit = 50 
    } = req.query;
    
    // Build filter
    const filter = {};
    if (userId) filter.userId = userId;
    if (decision) filter.decision = decision;
    if (resourceType) filter.resourceType = resourceType;
    if (action) filter.action = action;
    if (policyId) filter['appliedPolicies.policyId'] = policyId;
    
    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    
    // Get logs with pagination
    const skip = (page - 1) * limit;
    const logs = await ABACLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('-subjectAttributes -actionAttributes -resourceAttributes -environmentAttributes'); // Exclude detailed attributes for list view
    
    const total = await ABACLog.countDocuments(filter);
    
    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching ABAC audit logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ABAC audit logs',
      error: error.message
    });
  }
};

/**
 * Get ABAC statistics
 */
const getStatistics = async (req, res) => {
  try {
    const { timeRange = 24 } = req.query; // hours
    
    // Get basic statistics
    const stats = await ABACLog.getStatistics(parseInt(timeRange));
    
    // Get policy usage statistics
    const policyStats = await ABACPolicy.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $project: {
          policyId: 1,
          name: 1,
          category: 1,
          evaluationCount: 1,
          allowCount: 1,
          denyCount: 1,
          successRate: {
            $cond: {
              if: { $eq: ['$evaluationCount', 0] },
              then: 0,
              else: { $multiply: [{ $divide: ['$allowCount', '$evaluationCount'] }, 100] }
            }
          }
        }
      },
      {
        $sort: { evaluationCount: -1 }
      },
      {
        $limit: 10
      }
    ]);
    
    // Get recent denial reasons
    const recentDenials = await ABACLog.find({ 
      decision: 'DENY',
      createdAt: { $gte: new Date(Date.now() - parseInt(timeRange) * 60 * 60 * 1000) }
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('appliedPolicies.reason appliedPolicies.policyName resourceType action createdAt');
    
    res.json({
      success: true,
      data: {
        overview: stats,
        topPolicies: policyStats,
        recentDenials,
        timeRange: parseInt(timeRange)
      }
    });
  } catch (error) {
    console.error('Error fetching ABAC statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ABAC statistics',
      error: error.message
    });
  }
};

/**
 * Initialize core ABAC policies
 */
const initializeCorePolicy = async (req, res) => {
  try {
    const { policyId } = req.params;
    
    const policy = await abacEngine.initializeCorePolicy(policyId, req.user._id);
    
    res.json({
      success: true,
      message: `Core ABAC policy ${policyId} initialized successfully`,
      data: policy
    });
  } catch (error) {
    console.error('Error initializing core ABAC policy:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize core ABAC policy',
      error: error.message
    });
  }
};

/**
 * Refresh policy cache
 */
const refreshCache = async (req, res) => {
  try {
    await abacEngine.refreshPolicyCache();
    
    res.json({
      success: true,
      message: 'ABAC policy cache refreshed successfully'
    });
  } catch (error) {
    console.error('Error refreshing ABAC cache:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh ABAC cache',
      error: error.message
    });
  }
};

module.exports = {
  getPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
  togglePolicy,
  testPolicy,
  getAuditLogs,
  getStatistics,
  initializeCorePolicy,
  refreshCache
};