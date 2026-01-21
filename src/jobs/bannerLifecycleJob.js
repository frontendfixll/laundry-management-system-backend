const bannerLifecycleService = require('../services/bannerLifecycleService');
const mongoose = require('mongoose');

/**
 * Check if database is connected before running jobs
 */
function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * Auto-activate scheduled banners
 * Runs every 5 minutes
 */
async function autoActivateBanners() {
  try {
    // Check database connection first
    if (!isDatabaseConnected()) {
      console.log('⚠️ Skipping auto-activate banners job - database not connected');
      return { success: false, error: 'Database not connected' };
    }

    console.log('🔄 Running auto-activate banners job...');
    const result = await bannerLifecycleService.autoActivateBanners();
    
    if (result.success && result.activatedCount > 0) {
      console.log(`✅ Auto-activated ${result.activatedCount} banner(s)`);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error in auto-activate banners job:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Auto-complete expired banners
 * Runs every hour
 */
async function autoCompleteBanners() {
  try {
    // Check database connection first
    if (!isDatabaseConnected()) {
      console.log('⚠️ Skipping auto-complete banners job - database not connected');
      return { success: false, error: 'Database not connected' };
    }

    console.log('🔄 Running auto-complete banners job...');
    const result = await bannerLifecycleService.autoCompleteBanners();
    
    if (result.success && result.completedCount > 0) {
      console.log(`✅ Auto-completed ${result.completedCount} banner(s)`);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error in auto-complete banners job:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Sync banners with campaigns
 * Runs every 15 minutes
 */
async function syncWithCampaigns() {
  try {
    // Check database connection first
    if (!isDatabaseConnected()) {
      console.log('⚠️ Skipping sync banners job - database not connected');
      return { success: false, error: 'Database not connected' };
    }

    console.log('🔄 Running sync banners with campaigns job...');
    const result = await bannerLifecycleService.syncWithCampaigns();
    
    if (result.success && result.syncedCount > 0) {
      console.log(`✅ Synced ${result.syncedCount} banner(s) with campaigns`);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Error in sync banners job:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Run all lifecycle jobs
 */
async function runAllJobs() {
  if (!isDatabaseConnected()) {
    console.log('⚠️ Skipping all banner lifecycle jobs - database not connected');
    return { success: false, error: 'Database not connected' };
  }

  console.log('🚀 Running all banner lifecycle jobs...');
  
  const results = {
    activated: await autoActivateBanners(),
    completed: await autoCompleteBanners(),
    synced: await syncWithCampaigns()
  };
  
  console.log('✅ All banner lifecycle jobs completed');
  return results;
}

module.exports = {
  autoActivateBanners,
  autoCompleteBanners,
  syncWithCampaigns,
  runAllJobs
};
