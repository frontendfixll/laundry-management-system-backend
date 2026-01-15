const express = require('express');
const router = express.Router();
const { BillingPlan } = require('../models/TenancyBilling');
const FeatureDefinition = require('../models/FeatureDefinition');

/**
 * @route   GET /api/public/billing/plans
 * @desc    Get all active billing plans (public)
 * @access  Public
 */
router.get('/plans', async (req, res) => {
  try {
    // Only show plans that are active AND marked to show on marketing
    const plans = await BillingPlan.find({ 
      isActive: true,
      showOnMarketing: true 
    })
      .select('name displayName description price features isPopular badge trialDays sortOrder')
      .sort({ sortOrder: 1, 'price.monthly': 1 });

    // Get feature definitions for display
    const featureDefinitions = await FeatureDefinition.find({ isActive: true })
      .select('key name description category valueType icon sortOrder')
      .sort({ category: 1, sortOrder: 1 });

    res.json({
      success: true,
      data: { 
        plans,
        featureDefinitions
      }
    });
  } catch (error) {
    console.error('Error fetching public billing plans:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch billing plans'
    });
  }
});

/**
 * @route   GET /api/public/billing/plans/:id
 * @desc    Get a single billing plan by ID (public)
 * @access  Public
 */
router.get('/plans/:id', async (req, res) => {
  try {
    const plan = await BillingPlan.findOne({ 
      _id: req.params.id,
      isActive: true,
      showOnMarketing: true 
    }).select('name displayName description price features isPopular badge trialDays');

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    res.json({
      success: true,
      data: { plan }
    });
  } catch (error) {
    console.error('Error fetching billing plan:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch billing plan'
    });
  }
});

module.exports = router;
