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
    
    const Notification = require('../models/Notification');
    const result = await Notification.deleteMany({ expiresAt: { $lt: new Date() } });
    
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

    const Tenancy = require('../models/Tenancy');
    const User = require('../models/User');
    const NotificationService = require('../services/notificationService');

    const now = new Date();
    let remindersSent = 0;
    let expiredCount = 0;

    // Find tenancies expiring in 1, 3, 7 days
    const reminderDays = [1, 3, 7];
    for (const days of reminderDays) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + days);
      const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

      const expiringTenancies = await Tenancy.find({
        'subscription.endDate': { $gte: startOfDay, $lte: endOfDay },
        'subscription.status': 'active',
        isActive: true
      });

      for (const tenancy of expiringTenancies) {
        const admins = await User.find({ tenancy: tenancy._id, role: 'admin', isActive: true }).select('_id');
        for (const admin of admins) {
          await NotificationService.notifySubscriptionExpiring(admin._id, tenancy, days);
        }
        // Also notify SuperAdmins
        await NotificationService.notifySuperAdminSubscriptionExpiring(null, tenancy, days);
        remindersSent++;
      }
    }

    // Find already expired tenancies (expired today)
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const endOfToday = new Date(now.setHours(23, 59, 59, 999));
    const expiredTenancies = await Tenancy.find({
      'subscription.endDate': { $gte: startOfToday, $lte: endOfToday },
      'subscription.status': 'active',
      isActive: true
    });

    for (const tenancy of expiredTenancies) {
      const admins = await User.find({ tenancy: tenancy._id, role: 'admin', isActive: true }).select('_id');
      for (const admin of admins) {
        await NotificationService.notifySubscriptionExpired(admin._id, tenancy);
      }
      expiredCount++;
    }

    const result = {
      remindersSent,
      expiredCount,
      message: `Sent ${remindersSent} reminders, ${expiredCount} expiry notices`
    };

    console.log('✅ Subscription reminders completed:', result);

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
 * POST /api/cron/coupons/expiry-reminders
 * Send coupon expiry reminders to customers (coupons expiring in 1-3 days)
 */
router.post('/coupons/expiry-reminders', async (req, res) => {
  try {
    console.log('🔄 Cron API: Sending coupon expiry reminders...');

    const Coupon = require('../models/Coupon');
    const User = require('../models/User');
    const NotificationService = require('../services/notificationService');

    const now = new Date();
    const threeDaysLater = new Date(now);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);

    // Find coupons expiring within 3 days
    const expiringCoupons = await Coupon.find({
      endDate: { $gte: now, $lte: threeDaysLater },
      isActive: true
    });

    let remindersSent = 0;

    for (const coupon of expiringCoupons) {
      // Find customers in the coupon's tenancy
      const customers = await User.find({
        tenancy: coupon.tenancy,
        role: 'customer',
        isActive: true
      }).select('_id').limit(200);

      for (const customer of customers) {
        await NotificationService.notifyCouponExpiring(customer._id, {
          _id: coupon._id,
          code: coupon.code,
          discount: coupon.discountValue || coupon.discount,
          expiryDate: coupon.endDate
        }, coupon.tenancy);
        remindersSent++;
      }
    }

    console.log(`✅ Coupon expiry reminders sent: ${remindersSent}`);

    res.json({
      success: true,
      message: 'Coupon expiry reminders completed',
      result: { remindersSent, couponsExpiring: expiringCoupons.length },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Cron API: Coupon reminders failed:', error);
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
