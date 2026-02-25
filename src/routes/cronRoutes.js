/**
 * Cron Job API Routes
 * 
 * These endpoints are called by Firebase Functions
 * Replaces direct node-cron execution
 */

const express = require('express');
const router = express.Router();
const bannerLifecycleJob = require('../jobs/bannerLifecycleJob');

// Middleware to verify requests from Firebase Functions
const verifyFirebaseFunctionRequest = (req, res, next) => {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  const expectedKey = process.env.CRON_API_KEY || 'your-secure-api-key';

  if (apiKey !== expectedKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized - Invalid API key'
    });
  }

  next();
};

// Apply middleware to all cron routes
router.use(verifyFirebaseFunctionRequest);

/**
 * POST /api/cron/banners/auto-activate
 * Auto-activate scheduled banners
 */
router.post('/banners/auto-activate', async (req, res) => {
  try {
    console.log('🔄 Cron API: Auto-activating banners...');
    
    const result = await bannerLifecycleJob.autoActivateBanners();
    
    res.json({
      success: true,
      message: 'Auto-activate banners completed',
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Cron API: Auto-activate failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/cron/banners/auto-complete
 * Auto-complete expired banners
 */
router.post('/banners/auto-complete', async (req, res) => {
  try {
    console.log('🔄 Cron API: Auto-completing banners...');
    
    const result = await bannerLifecycleJob.autoCompleteBanners();
    
    res.json({
      success: true,
      message: 'Auto-complete banners completed',
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Cron API: Auto-complete failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/cron/banners/sync-campaigns
 * Sync banners with campaigns
 */
router.post('/banners/sync-campaigns', async (req, res) => {
  try {
    console.log('🔄 Cron API: Syncing banners with campaigns...');
    
    const result = await bannerLifecycleJob.syncWithCampaigns();
    
    res.json({
      success: true,
      message: 'Sync banners with campaigns completed',
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Cron API: Sync failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/cron/notifications/cleanup
 * Cleanup expired notifications
 */
router.post('/notifications/cleanup', async (req, res) => {
  try {
    console.log('🔄 Cron API: Cleaning up expired notifications...');
    
    const firebaseNotificationService = require('../services/firebaseNotificationService');
    const result = await firebaseNotificationService.cleanupExpired();
    
    res.json({
      success: true,
      message: 'Cleanup expired notifications completed',
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Cron API: Cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/cron/subscriptions/send-reminders
 * Send subscription expiry reminders
 */
router.post('/subscriptions/send-reminders', async (req, res) => {
  try {
    console.log('🔄 Cron API: Sending subscription reminders...');
    
    // TODO: Implement subscription reminder logic
    const result = {
      remindersSent: 0,
      message: 'Subscription reminders feature pending implementation'
    };
    
    res.json({
      success: true,
      message: 'Subscription reminders completed',
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Cron API: Send reminders failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/cron/status
 * Get cron jobs status
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'Cron API operational',
    jobs: [
      { name: 'auto-activate-banners', schedule: 'every 5 minutes', status: 'active' },
      { name: 'auto-complete-banners', schedule: 'every 1 hour', status: 'active' },
      { name: 'sync-banners-campaigns', schedule: 'every 15 minutes', status: 'active' },
      { name: 'cleanup-notifications', schedule: 'daily at 2 AM', status: 'active' },
      { name: 'subscription-reminders', schedule: 'daily at 9 AM', status: 'active' }
    ],
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
