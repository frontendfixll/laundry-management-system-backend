const express = require('express');
const router = express.Router();
const {
  getStats,
  getRules,
  createRule,
  updateRule,
  deleteRule,
  toggleRule,
  testRule,
  getRuleHistory,
  triggerEvent
} = require('../controllers/automationController');

// Middleware
const { protectAny } = require('../middlewares/auth');
const { protectSuperAdmin } = require('../middlewares/superAdminAuth');

// @desc    Get automation engine statistics
// @route   GET /api/automation/stats
// @access  Private (SuperAdmin/Admin)
router.get('/stats', protectAny, getStats);

// @desc    Get automation rules
// @route   GET /api/automation/rules
// @access  Private (SuperAdmin/Admin)
router.get('/rules', protectAny, getRules);

// @desc    Create new automation rule
// @route   POST /api/automation/rules
// @access  Private (SuperAdmin/Admin)
router.post('/rules', protectAny, createRule);

// @desc    Update automation rule
// @route   PUT /api/automation/rules/:ruleId
// @access  Private (SuperAdmin/Admin)
router.put('/rules/:ruleId', protectAny, updateRule);

// @desc    Delete automation rule
// @route   DELETE /api/automation/rules/:ruleId
// @access  Private (SuperAdmin/Admin)
router.delete('/rules/:ruleId', protectAny, deleteRule);

// @desc    Toggle automation rule active status
// @route   PATCH /api/automation/rules/:ruleId/toggle
// @access  Private (SuperAdmin/Admin)
router.patch('/rules/:ruleId/toggle', protectAny, toggleRule);

// @desc    Test automation rule
// @route   POST /api/automation/rules/:ruleId/test
// @access  Private (SuperAdmin/Admin)
router.post('/rules/:ruleId/test', protectAny, testRule);

// @desc    Get rule execution history
// @route   GET /api/automation/rules/:ruleId/history
// @access  Private (SuperAdmin/Admin)
router.get('/rules/:ruleId/history', protectAny, getRuleHistory);

// @desc    Manually trigger automation event (SuperAdmin only)
// @route   POST /api/automation/trigger
// @access  Private (SuperAdmin only)
router.post('/trigger', protectSuperAdmin, triggerEvent);

module.exports = router;