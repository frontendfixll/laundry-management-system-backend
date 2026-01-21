const Banner = require('../models/Banner');
const Campaign = require('../models/Campaign');
const mongoose = require('mongoose');

class BannerLifecycleService {
  /**
   * Check if database is connected
   */
  isDatabaseConnected() {
    return mongoose.connection.readyState === 1;
  }

  /**
   * Auto-activate scheduled banners whose start date has been reached
   */
  async autoActivateBanners() {
    try {
      // Check database connection first
      if (!this.isDatabaseConnected()) {
        console.log('⚠️ Skipping auto-activate banners - database not connected');
        return { success: false, error: 'Database not connected', activatedCount: 0 };
      }

      const now = new Date();
      
      const bannersToActivate = await Banner.find({
        state: 'SCHEDULED',
        'schedule.startDate': { $lte: now },
        'schedule.endDate': { $gte: now },
        'schedule.autoActivate': true,
        isActive: true
      });
      
      let activatedCount = 0;
      
      for (const banner of bannersToActivate) {
        try {
          await banner.transitionState('ACTIVE');
          activatedCount++;
        } catch (error) {
          console.error(`Failed to activate banner ${banner._id}:`, error.message);
        }
      }
      
      if (activatedCount > 0) {
        console.log(`✅ Auto-activated ${activatedCount} banners`);
      }
      
      return { success: true, activatedCount };
    } catch (error) {
      console.error('Error in autoActivateBanners:', error);
      return { success: false, error: error.message, activatedCount: 0 };
    }
  }
  
  /**
   * Auto-complete active banners whose end date has passed
   */
  async autoCompleteBanners() {
    try {
      // Check database connection first
      if (!this.isDatabaseConnected()) {
        console.log('⚠️ Skipping auto-complete banners - database not connected');
        return { success: false, error: 'Database not connected', completedCount: 0 };
      }

      const now = new Date();
      
      const bannersToComplete = await Banner.find({
        state: 'ACTIVE',
        'schedule.endDate': { $lt: now },
        'schedule.autoComplete': true
      });
      
      let completedCount = 0;
      
      for (const banner of bannersToComplete) {
        try {
          await banner.transitionState('COMPLETED');
          completedCount++;
        } catch (error) {
          console.error(`Failed to complete banner ${banner._id}:`, error.message);
        }
      }
      
      if (completedCount > 0) {
        console.log(`✅ Auto-completed ${completedCount} banners`);
      }
      
      return { success: true, completedCount };
    } catch (error) {
      console.error('Error in autoCompleteBanners:', error);
      return { success: false, error: error.message, completedCount: 0 };
    }
  }
  
  /**
   * Sync banners with their linked campaigns
   * Complete banners if their campaign has ended
   */
  async syncWithCampaigns() {
    try {
      // Check database connection first
      if (!this.isDatabaseConnected()) {
        console.log('⚠️ Skipping sync banners with campaigns - database not connected');
        return { success: false, error: 'Database not connected', syncedCount: 0 };
      }

      const activeBanners = await Banner.find({
        state: { $in: ['ACTIVE', 'SCHEDULED'] }
      }).populate('linkedCampaign');
      
      let syncedCount = 0;
      
      for (const banner of activeBanners) {
        if (!banner.linkedCampaign) {
          console.warn(`Banner ${banner._id} has no linked campaign`);
          continue;
        }
        
        const campaign = banner.linkedCampaign;
        
        // Check if campaign has ended or is inactive
        const now = new Date();
        const campaignEnded = campaign.endDate < now || 
                             campaign.status !== 'ACTIVE' ||
                             !campaign.isActive;
        
        if (campaignEnded && banner.state === 'ACTIVE') {
          try {
            await banner.transitionState('COMPLETED');
            syncedCount++;
          } catch (error) {
            console.error(`Failed to complete banner ${banner._id}:`, error.message);
          }
        }
      }
      
      if (syncedCount > 0) {
        console.log(`✅ Synced ${syncedCount} banners with campaigns`);
      }
      
      return { success: true, syncedCount };
    } catch (error) {
      console.error('Error in syncWithCampaigns:', error);
      return { success: false, error: error.message, syncedCount: 0 };
    }
  }
  
  /**
   * Validate state transition
   */
  validateStateTransition(currentState, newState) {
    const validTransitions = {
      DRAFT: ['PENDING_APPROVAL'],
      PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
      APPROVED: ['SCHEDULED', 'ACTIVE'],
      REJECTED: ['DRAFT'],
      SCHEDULED: ['ACTIVE', 'PAUSED'],
      ACTIVE: ['PAUSED', 'COMPLETED'],
      PAUSED: ['ACTIVE', 'COMPLETED'],
      COMPLETED: []
    };
    
    if (!validTransitions[currentState]) {
      return { valid: false, message: `Invalid current state: ${currentState}` };
    }
    
    if (!validTransitions[currentState].includes(newState)) {
      return { 
        valid: false, 
        message: `Cannot transition from ${currentState} to ${newState}. Valid transitions: ${validTransitions[currentState].join(', ')}` 
      };
    }
    
    return { valid: true };
  }
  
  /**
   * Get banner lifecycle statistics
   */
  async getLifecycleStats(tenancyId = null) {
    try {
      const query = tenancyId ? { tenancy: tenancyId } : {};
      
      const stats = await Banner.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$state',
            count: { $sum: 1 }
          }
        }
      ]);
      
      const stateCount = {
        DRAFT: 0,
        PENDING_APPROVAL: 0,
        APPROVED: 0,
        REJECTED: 0,
        SCHEDULED: 0,
        ACTIVE: 0,
        PAUSED: 0,
        COMPLETED: 0
      };
      
      stats.forEach(stat => {
        stateCount[stat._id] = stat.count;
      });
      
      return {
        success: true,
        data: {
          byState: stateCount,
          total: Object.values(stateCount).reduce((sum, count) => sum + count, 0)
        }
      };
    } catch (error) {
      console.error('Error in getLifecycleStats:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Run all lifecycle jobs
   */
  async runAllJobs() {
    console.log('🔄 Running banner lifecycle jobs...');
    
    const results = {
      activated: await this.autoActivateBanners(),
      completed: await this.autoCompleteBanners(),
      synced: await this.syncWithCampaigns()
    };
    
    console.log('✅ Banner lifecycle jobs completed');
    return results;
  }
}

module.exports = new BannerLifecycleService();
