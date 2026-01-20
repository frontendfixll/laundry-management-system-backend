const axios = require('axios');

class SubdomainService {
  constructor() {
    this.vercelToken = process.env.VERCEL_TOKEN;
    this.vercelTeamId = process.env.VERCEL_TEAM_ID;
    this.frontendProjectId = process.env.VERCEL_FRONTEND_PROJECT_ID;
    this.baseDomain = 'laundrylobby.com';
  }

  /**
   * Create subdomain for new tenancy
   * @param {string} subdomain - The subdomain name (e.g., 'prakash')
   * @param {string} tenancyId - The tenancy ID
   */
  async createSubdomain(subdomain, tenancyId) {
    try {
      console.log(`🌐 Creating subdomain: ${subdomain}.${this.baseDomain}`);

      // Step 1: Add domain to Vercel project
      const domainName = `${subdomain}.${this.baseDomain}`;
      
      const vercelResponse = await this.addDomainToVercel(domainName);
      
      if (vercelResponse.success) {
        console.log(`✅ Subdomain ${domainName} added to Vercel`);
        
        // Step 2: Update tenancy record with subdomain info
        await this.updateTenancySubdomain(tenancyId, subdomain, domainName);
        
        return {
          success: true,
          subdomain: domainName,
          message: 'Subdomain created successfully'
        };
      } else {
        throw new Error(vercelResponse.error || 'Failed to add domain to Vercel');
      }

    } catch (error) {
      console.error('❌ Error creating subdomain:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add domain to Vercel project
   */
  async addDomainToVercel(domainName) {
    try {
      const url = `https://api.vercel.com/v9/projects/${this.frontendProjectId}/domains`;
      
      const response = await axios.post(url, {
        name: domainName
      }, {
        headers: {
          'Authorization': `Bearer ${this.vercelToken}`,
          'Content-Type': 'application/json',
          ...(this.vercelTeamId && { 'X-Vercel-Team-Id': this.vercelTeamId })
        }
      });

      console.log(`✅ Vercel API response for ${domainName}:`, response.status);
      
      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('❌ Vercel API error:', error.response?.data || error.message);
      
      // Check if domain already exists
      if (error.response?.status === 409) {
        console.log(`ℹ️ Domain ${domainName} already exists in Vercel`);
        return { success: true, message: 'Domain already exists' };
      }
      
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }

  /**
   * Update tenancy record with subdomain info
   */
  async updateTenancySubdomain(tenancyId, subdomain, fullDomain) {
    try {
      const Tenancy = require('../models/Tenancy');
      
      await Tenancy.findByIdAndUpdate(tenancyId, {
        subdomain: subdomain,
        customDomain: fullDomain,
        domainStatus: 'active',
        domainCreatedAt: new Date()
      });

      console.log(`✅ Updated tenancy ${tenancyId} with subdomain: ${fullDomain}`);
      
    } catch (error) {
      console.error('❌ Error updating tenancy subdomain:', error);
      throw error;
    }
  }

  /**
   * Remove subdomain (when tenancy is deleted)
   */
  async removeSubdomain(subdomain) {
    try {
      const domainName = `${subdomain}.${this.baseDomain}`;
      console.log(`🗑️ Removing subdomain: ${domainName}`);

      const url = `https://api.vercel.com/v9/projects/${this.frontendProjectId}/domains/${domainName}`;
      
      await axios.delete(url, {
        headers: {
          'Authorization': `Bearer ${this.vercelToken}`,
          ...(this.vercelTeamId && { 'X-Vercel-Team-Id': this.vercelTeamId })
        }
      });

      console.log(`✅ Subdomain ${domainName} removed from Vercel`);
      
      return { success: true };

    } catch (error) {
      console.error('❌ Error removing subdomain:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if subdomain is available
   */
  async isSubdomainAvailable(subdomain) {
    try {
      const Tenancy = require('../models/Tenancy');
      
      const existingTenancy = await Tenancy.findOne({ 
        subdomain: subdomain,
        isDeleted: false 
      });

      return !existingTenancy;
      
    } catch (error) {
      console.error('❌ Error checking subdomain availability:', error);
      return false;
    }
  }

  /**
   * Get all active subdomains
   */
  async getActiveSubdomains() {
    try {
      const Tenancy = require('../models/Tenancy');
      
      const tenancies = await Tenancy.find({ 
        isDeleted: false,
        subdomain: { $exists: true, $ne: null }
      }).select('subdomain customDomain name');

      return tenancies.map(t => ({
        subdomain: t.subdomain,
        domain: t.customDomain,
        tenancyName: t.name
      }));
      
    } catch (error) {
      console.error('❌ Error getting active subdomains:', error);
      return [];
    }
  }
}

module.exports = new SubdomainService();