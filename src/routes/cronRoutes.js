/**
 * Cron Routes - External endpoints for scheduled tasks
 * These can be called by external cron services like Vercel Cron or GitHub Actions
 */

const express = require('express');
const router = express.Router();
const bannerLifecycleJob = require('../jobs/bannerLifecycleJob');

// Middleware to verify cron requests (basic security)
const verifyCronRequest = (req, res, next) => {
  const cronSecret = process.env.CRON_SECRET || 'default-cron-secret';
  const providedSecret = req.headers['x-cron-secret'] || req.query.secret;
  
  if (providedSecret !== cronSecret) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized cron request'
    });
  }
  
  next();
};

// Auto-activate scheduled banners
router.post('/banners/auto-activate', verifyCronRequest, async (req, res) => {
  try {
    const result = await bannerLifecycleJob.autoActivateBanners();
    res.json({
      success: true,
      message: 'Banner auto-activation completed',
      result
    });
  } catch (error) {
    console.error('Banner auto-activation error:', error);
    res.status(500).json({
      success: false,
      error: 'Banner auto-activation failed',
      message: error.message
    });
  }
});

// Auto-complete expired banners
router.post('/banners/auto-complete', verifyCronRequest, async (req, res) => {
  try {
    const result = await bannerLifecycleJob.autoCompleteBanners();
    res.json({
      success: true,
      message: 'Banner auto-completion completed',
      result
    });
  } catch (error) {
    console.error('Banner auto-completion error:', error);
    res.status(500).json({
      success: false,
      error: 'Banner auto-completion failed',
      message: error.message
    });
  }
});

// Sync banners with campaigns
router.post('/banners/sync-campaigns', verifyCronRequest, async (req, res) => {
  try {
    const result = await bannerLifecycleJob.syncWithCampaigns();
    res.json({
      success: true,
      message: 'Banner-campaign sync completed',
      result
    });
  } catch (error) {
    console.error('Banner-campaign sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Banner-campaign sync failed',
      message: error.message
    });
  }
});

// Run all banner lifecycle jobs
router.post('/banners/lifecycle', verifyCronRequest, async (req, res) => {
  try {
    const results = {
      autoActivate: await bannerLifecycleJob.autoActivateBanners(),
      autoComplete: await bannerLifecycleJob.autoCompleteBanners(),
      syncCampaigns: await bannerLifecycleJob.syncWithCampaigns()
    };
    
    res.json({
      success: true,
      message: 'All banner lifecycle jobs completed',
      results
    });
  } catch (error) {
    console.error('Banner lifecycle jobs error:', error);
    res.status(500).json({
      success: false,
      error: 'Banner lifecycle jobs failed',
      message: error.message
    });
  }
});

// Health check for cron service
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Cron service is healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

module.exports = router;