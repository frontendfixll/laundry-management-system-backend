const automationEngine = require('../services/automationEngine');
const AutomationRule = require('../models/AutomationRule');
const asyncHandler = require('express-async-handler');

// @desc    Get automation engine stats
// @route   GET /api/automation/stats
// @access  Private (SuperAdmin/Admin)
const getStats = asyncHandler(async (req, res) => {
  const stats = automationEngine.getStats();

  res.json({
    success: true,
    data: stats
  });
});

// @desc    Get automation rules
// @route   GET /api/automation/rules
// @access  Private (SuperAdmin/Admin)
const getRules = asyncHandler(async (req, res) => {
  const { scope, tenantId, page = 1, limit = 10 } = req.query;
  const user = req.user;

  // Build query based on user permissions
  let query = { isActive: true };

  // SuperAdmin can see all rules
  if (user.role === 'superadmin') {
    if (scope) query.scope = scope;
    if (tenantId) query.tenantId = tenantId;
  }
  // Tenant admin can only see their tenant rules
  else {
    query.scope = 'TENANT';
    query.tenantId = user.tenantId;
  }

  const skip = (page - 1) * limit;

  const rules = await AutomationRule.find(query)
    .populate('createdBy', 'name email')
    .populate('tenantId', 'name slug')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await AutomationRule.countDocuments(query);

  res.json({
    success: true,
    data: {
      rules,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// @desc    Create automation rule
// @route   POST /api/automation/rules
// @access  Private (SuperAdmin/Admin)
const createRule = asyncHandler(async (req, res) => {
  const user = req.user;
  const ruleData = req.body;

  // Generate unique rule ID
  ruleData.ruleId = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  ruleData.createdBy = user._id;

  // Validate scope permissions
  if (ruleData.scope === 'PLATFORM' && user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Only SuperAdmin can create platform-level rules'
    });
  }

  if (ruleData.scope === 'TENANT') {
    // If SuperAdmin is creating a tenant rule, they MUST specify which tenant
    if (user.role === 'superadmin' && !ruleData.tenantId) {
      return res.status(400).json({
        success: false,
        message: 'tenantId is required for rules with TENANT scope'
      });
    }

    // Ensure tenant admin can only create rules for their own tenant
    if (user.role !== 'superadmin') {
      ruleData.tenantId = user.tenantId;
    }
  } else if (ruleData.scope === 'PLATFORM') {
    // Platform rules should NOT have a tenantId
    delete ruleData.tenantId;
  }

  try {
    const rule = await automationEngine.registerRule(ruleData);

    // Send real-time notification about new rule
    // Send real-time notification about new rule
    if (global.notificationEngine) {
      await global.notificationEngine.processNotification({
        userId: user._id,
        tenantId: rule.tenantId,
        eventType: 'AUTOMATION_RULE_CREATED',
        title: 'New Automation Rule Created',
        message: `Rule "${rule.name}" has been created and is now active`,
        category: 'success',
        metadata: {
          type: 'success',
          source: 'automation',
          ruleId: rule.ruleId,
          action: 'rule_created'
        }
      });
    }

    res.status(201).json({
      success: true,
      data: rule,
      message: 'Automation rule created successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Update automation rule
// @route   PUT /api/automation/rules/:ruleId
// @access  Private (SuperAdmin/Admin)
const updateRule = asyncHandler(async (req, res) => {
  const { ruleId } = req.params;
  const user = req.user;
  const updates = req.body;

  // Find existing rule
  const existingRule = await AutomationRule.findOne({ ruleId });
  if (!existingRule) {
    return res.status(404).json({
      success: false,
      message: 'Automation rule not found'
    });
  }

  // Check permissions
  if (user.role !== 'superadmin') {
    // Tenant admin can only update their own tenant rules
    if (existingRule.scope === 'PLATFORM' ||
      existingRule.tenantId.toString() !== user.tenantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied'
      });
    }
  }

  try {
    const updatedRule = await automationEngine.updateRule(ruleId, updates);

    // Send real-time notification about rule update
    // Send real-time notification about rule update
    if (global.notificationEngine) {
      await global.notificationEngine.processNotification({
        userId: user._id,
        tenantId: updatedRule.tenantId,
        eventType: 'AUTOMATION_RULE_UPDATED',
        title: 'Automation Rule Updated',
        message: `Rule "${updatedRule.name}" has been updated`,
        category: 'info',
        metadata: {
          type: 'info',
          source: 'automation',
          ruleId: updatedRule.ruleId,
          action: 'rule_updated'
        }
      });
    }

    res.json({
      success: true,
      data: updatedRule,
      message: 'Automation rule updated successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Delete automation rule
// @route   DELETE /api/automation/rules/:ruleId
// @access  Private (SuperAdmin/Admin)
const deleteRule = asyncHandler(async (req, res) => {
  const { ruleId } = req.params;
  const user = req.user;

  // Find existing rule
  const existingRule = await AutomationRule.findOne({ ruleId });
  if (!existingRule) {
    return res.status(404).json({
      success: false,
      message: 'Automation rule not found'
    });
  }

  // Check permissions
  if (user.role !== 'superadmin') {
    // Tenant admin can only delete their own tenant rules
    if (existingRule.scope === 'PLATFORM' ||
      existingRule.tenantId.toString() !== user.tenantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied'
      });
    }
  }

  try {
    await automationEngine.deleteRule(ruleId);

    // Send real-time notification about rule deletion
    // Send real-time notification about rule deletion
    if (global.notificationEngine) {
      await global.notificationEngine.processNotification({
        userId: user._id,
        tenantId: existingRule.tenantId,
        eventType: 'AUTOMATION_RULE_DELETED',
        title: 'Automation Rule Deleted',
        message: `Rule "${existingRule.name}" has been deleted`,
        category: 'warning',
        metadata: {
          type: 'warning',
          source: 'automation',
          ruleId: existingRule.ruleId,
          action: 'rule_deleted'
        }
      });
    }

    res.json({
      success: true,
      message: 'Automation rule deleted successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Toggle automation rule status
// @route   PATCH /api/automation/rules/:ruleId/toggle
// @access  Private (SuperAdmin/Admin)
const toggleRule = asyncHandler(async (req, res) => {
  const { ruleId } = req.params;
  const user = req.user;

  // Find existing rule
  const existingRule = await AutomationRule.findOne({ ruleId });
  if (!existingRule) {
    return res.status(404).json({
      success: false,
      message: 'Automation rule not found'
    });
  }

  // Check permissions
  if (user.role !== 'superadmin') {
    if (existingRule.scope === 'PLATFORM' ||
      existingRule.tenantId.toString() !== user.tenantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied'
      });
    }
  }

  try {
    const updatedRule = await automationEngine.updateRule(ruleId, {
      isActive: !existingRule.isActive
    });

    // Send real-time notification about rule toggle
    // Send real-time notification about rule toggle
    if (global.notificationEngine) {
      await global.notificationEngine.processNotification({
        userId: user._id,
        tenantId: updatedRule.tenantId,
        eventType: updatedRule.isActive ? 'AUTOMATION_RULE_ACTIVATED' : 'AUTOMATION_RULE_DEACTIVATED',
        title: `Automation Rule ${updatedRule.isActive ? 'Activated' : 'Deactivated'}`,
        message: `Rule "${updatedRule.name}" is now ${updatedRule.isActive ? 'active' : 'inactive'}`,
        category: updatedRule.isActive ? 'success' : 'warning',
        metadata: {
          type: updatedRule.isActive ? 'success' : 'warning',
          source: 'automation',
          ruleId: updatedRule.ruleId,
          action: updatedRule.isActive ? 'rule_activated' : 'rule_deactivated'
        }
      });
    }

    res.json({
      success: true,
      data: updatedRule,
      message: `Automation rule ${updatedRule.isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Test automation rule
// @route   POST /api/automation/rules/:ruleId/test
// @access  Private (SuperAdmin/Admin)
const testRule = asyncHandler(async (req, res) => {
  const { ruleId } = req.params;
  const { testData } = req.body;
  const user = req.user;

  // Find existing rule
  const existingRule = await AutomationRule.findOne({ ruleId });
  if (!existingRule) {
    return res.status(404).json({
      success: false,
      message: 'Automation rule not found'
    });
  }

  // Check permissions
  if (user.role !== 'superadmin') {
    if (existingRule.scope === 'PLATFORM' ||
      existingRule.tenantId.toString() !== user.tenantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied'
      });
    }
  }

  try {
    // Create test context
    const testContext = {
      tenantId: existingRule.tenantId,
      userId: user._id,
      isTest: true
    };

    // Process test event
    await automationEngine.processEvent(
      existingRule.trigger.eventType,
      testData || {},
      testContext
    );

    res.json({
      success: true,
      message: 'Automation rule test completed successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Get rule execution history
// @route   GET /api/automation/rules/:ruleId/history
// @access  Private (SuperAdmin/Admin)
const getRuleHistory = asyncHandler(async (req, res) => {
  const { ruleId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const user = req.user;

  // Find existing rule
  const existingRule = await AutomationRule.findOne({ ruleId });
  if (!existingRule) {
    return res.status(404).json({
      success: false,
      message: 'Automation rule not found'
    });
  }

  // Check permissions
  if (user.role !== 'superadmin') {
    if (existingRule.scope === 'PLATFORM' ||
      existingRule.tenantId.toString() !== user.tenantId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied'
      });
    }
  }

  // For now, return basic execution info
  // In production, you'd query a separate execution log collection
  res.json({
    success: true,
    data: {
      ruleId: existingRule.ruleId,
      ruleName: existingRule.name,
      executionCount: existingRule.executionCount || 0,
      lastExecuted: existingRule.lastExecuted,
      history: [] // TODO: Implement detailed execution history
    }
  });
});

// @desc    Trigger automation event manually
// @route   POST /api/automation/trigger
// @access  Private (SuperAdmin only)
const triggerEvent = asyncHandler(async (req, res) => {
  const { eventType, eventData, context } = req.body;
  const user = req.user;

  // Only SuperAdmin can manually trigger events
  if (user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'Only SuperAdmin can manually trigger automation events'
    });
  }

  try {
    await automationEngine.processEvent(eventType, eventData, context);

    res.json({
      success: true,
      message: 'Automation event triggered successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = {
  getStats,
  getRules,
  createRule,
  updateRule,
  deleteRule,
  toggleRule,
  testRule,
  getRuleHistory,
  triggerEvent
};