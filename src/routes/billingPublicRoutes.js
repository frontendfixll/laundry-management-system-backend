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
    // Check if MongoDB is connected and attempt to connect if not
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      console.log('🔄 MongoDB not connected, attempting to connect...');
      try {
        const connectDB = require('../config/database');
        await connectDB();
      } catch (dbError) {
        console.error('❌ Failed to connect to database:', dbError.message);
        return res.status(500).json({
          success: false,
          message: 'Database connection unavailable. Please try again later.'
        });
      }
    }

    // Use timeout for serverless environment
    const isVercel = process.env.VERCEL || process.env.VERCEL_ENV || process.env.NODE_ENV === 'production';
    const queryTimeout = isVercel ? 3000 : 10000;

    // Only show plans that are active AND marked to show on marketing
    const plans = await BillingPlan.find({ 
      isActive: true,
      showOnMarketing: true 
    })
      .select('name displayName description price features isPopular badge trialDays sortOrder')
      .sort({ sortOrder: 1, 'price.monthly': 1 })
      .maxTimeMS(queryTimeout);

    // Get feature definitions for display
    const featureDefinitions = await FeatureDefinition.find({ isActive: true })
      .select('key name description category valueType icon sortOrder')
      .sort({ category: 1, sortOrder: 1 })
      .maxTimeMS(queryTimeout);

    res.json({
      success: true,
      data: { 
        plans,
        featureDefinitions
      }
    });
  } catch (error) {
    console.error('Error fetching public billing plans:', error);
    
    // Return fallback response for better UX
    if (error.name === 'MongooseError' || error.message.includes('buffering timed out')) {
      console.log('🔄 Returning fallback plans due to connection timeout');
      return res.json({
        success: true,
        data: {
          plans: [
            {
              name: 'basic',
              displayName: 'Basic Plan',
              description: 'Perfect for small laundry businesses',
              price: { monthly: 29, yearly: 290 },
              features: { orders: 100, staff: 2, analytics: true },
              isPopular: false,
              trialDays: 14
            },
            {
              name: 'professional',
              displayName: 'Professional Plan',
              description: 'Ideal for growing laundry businesses',
              price: { monthly: 79, yearly: 790 },
              features: { orders: 500, staff: 10, analytics: true },
              isPopular: true,
              trialDays: 14
            }
          ],
          featureDefinitions: [],
          fallback: true
        }
      });
    }
    
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
