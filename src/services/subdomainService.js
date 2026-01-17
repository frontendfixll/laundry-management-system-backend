const axios = require('axios');
const dns = require('dns').promises;

/**
 * Subdomain Management Service
 * Handles automatic subdomain creation for new tenants
 */
class SubdomainService {
  constructor() {
    this.provider = process.env.DNS_PROVIDER || 'cloudflare'; // cloudflare, route53, etc.
    this.mainDomain = process.env.MAIN_DOMAIN || 'yourdomain.com';
    this.targetIP = process.env.TARGET_IP || '127.0.0.1'; // Your server IP
    
    // Cloudflare configuration
    this.cloudflareConfig = {
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
      zoneId: process.env.CLOUDFLARE_ZONE_ID,
      baseURL: 'https://api.cloudflare.com/client/v4'
    };
  }

  /**
   * Create subdomain for a new tenant (Vercel-optimized)
   * @param {string} subdomain - The subdomain name (e.g., 'abc-laundry')
   * @param {string} tenantId - The tenant ID for tracking
   * @returns {Promise<Object>} - Result of subdomain creation
   */
  async createSubdomain(subdomain, tenantId) {
    try {
      console.log(`🌐 Creating subdomain: ${subdomain}.${this.mainDomain} for tenant: ${tenantId}`);
      
      // Validate subdomain format
      if (!this.isValidSubdomain(subdomain)) {
        throw new Error('Invalid subdomain format');
      }

      // Check if subdomain already exists in database
      const Tenancy = require('../models/Tenancy');
      const exists = await Tenancy.findOne({ subdomain });
      if (exists) {
        throw new Error(`Subdomain ${subdomain} already exists`);
      }

      let result;
      
      // For Vercel deployment, we don't need to create DNS records
      // Vercel handles wildcard subdomains automatically
      if (process.env.VERCEL || process.env.DEPLOYMENT_PLATFORM === 'vercel') {
        result = {
          recordId: `vercel-${subdomain}-${Date.now()}`, // Tracking ID
          provider: 'vercel',
          name: `${subdomain}.${this.mainDomain}`,
          content: 'vercel-managed'
        };
        console.log(`✅ Subdomain configured for Vercel: ${subdomain}.${this.mainDomain}`);
      } else {
        // For custom server deployment, use DNS providers
        switch (this.provider) {
          case 'cloudflare':
            result = await this.createCloudflareRecord(subdomain);
            break;
          case 'route53':
            result = await this.createRoute53Record(subdomain);
            break;
          default:
            throw new Error(`DNS provider ${this.provider} not supported`);
        }
      }

      // Log the creation
      await this.logSubdomainCreation(subdomain, tenantId, result);
      
      console.log(`✅ Subdomain created successfully: ${subdomain}.${this.mainDomain}`);
      return {
        success: true,
        subdomain: `${subdomain}.${this.mainDomain}`,
        url: `https://${subdomain}.${this.mainDomain}`,
        recordId: result.recordId,
        provider: result.provider || this.provider
      };

    } catch (error) {
      console.error(`❌ Failed to create subdomain ${subdomain}:`, error.message);
      throw error;
    }
  }

  /**
   * Create Cloudflare DNS record
   * @param {string} subdomain - The subdomain name
   * @returns {Promise<Object>} - Cloudflare API response
   */
  async createCloudflareRecord(subdomain) {
    try {
      const response = await axios.post(
        `${this.cloudflareConfig.baseURL}/zones/${this.cloudflareConfig.zoneId}/dns_records`,
        {
          type: 'A',
          name: subdomain,
          content: this.targetIP,
          ttl: 300, // 5 minutes
          proxied: true // Enable Cloudflare proxy for SSL and performance
        },
        {
          headers: {
            'Authorization': `Bearer ${this.cloudflareConfig.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        return {
          recordId: response.data.result.id,
          name: response.data.result.name,
          content: response.data.result.content
        };
      } else {
        throw new Error(`Cloudflare API error: ${JSON.stringify(response.data.errors)}`);
      }
    } catch (error) {
      if (error.response) {
        throw new Error(`Cloudflare API error: ${error.response.data.errors?.[0]?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Create Route53 DNS record (placeholder for AWS Route53)
   * @param {string} subdomain - The subdomain name
   * @returns {Promise<Object>} - Route53 response
   */
  async createRoute53Record(subdomain) {
    // TODO: Implement Route53 integration
    throw new Error('Route53 integration not implemented yet');
  }

  /**
   * Delete subdomain when tenant is deleted
   * @param {string} subdomain - The subdomain to delete
   * @param {string} recordId - The DNS record ID
   * @returns {Promise<boolean>} - Success status
   */
  async deleteSubdomain(subdomain, recordId) {
    try {
      console.log(`🗑️ Deleting subdomain: ${subdomain}.${this.mainDomain}`);
      
      switch (this.provider) {
        case 'cloudflare':
          await this.deleteCloudflareRecord(recordId);
          break;
        case 'route53':
          await this.deleteRoute53Record(recordId);
          break;
        default:
          throw new Error(`DNS provider ${this.provider} not supported`);
      }

      console.log(`✅ Subdomain deleted successfully: ${subdomain}.${this.mainDomain}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to delete subdomain ${subdomain}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete Cloudflare DNS record
   * @param {string} recordId - The record ID to delete
   */
  async deleteCloudflareRecord(recordId) {
    try {
      const response = await axios.delete(
        `${this.cloudflareConfig.baseURL}/zones/${this.cloudflareConfig.zoneId}/dns_records/${recordId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.cloudflareConfig.apiToken}`
          }
        }
      );

      if (!response.data.success) {
        throw new Error(`Cloudflare API error: ${JSON.stringify(response.data.errors)}`);
      }
    } catch (error) {
      if (error.response) {
        throw new Error(`Cloudflare API error: ${error.response.data.errors?.[0]?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Check if subdomain already exists (Vercel-optimized)
   * @param {string} subdomain - The subdomain to check
   * @returns {Promise<boolean>} - Whether subdomain exists
   */
  async checkSubdomainExists(subdomain) {
    try {
      // For Vercel, check database instead of DNS lookup
      if (process.env.VERCEL || process.env.DEPLOYMENT_PLATFORM === 'vercel') {
        const Tenancy = require('../models/Tenancy');
        const exists = await Tenancy.findOne({ subdomain });
        return !!exists;
      }
      
      // For custom servers, use DNS lookup
      const fullDomain = `${subdomain}.${this.mainDomain}`;
      await dns.lookup(fullDomain);
      return true; // If lookup succeeds, domain exists
    } catch (error) {
      if (error.code === 'ENOTFOUND') {
        return false; // Domain doesn't exist
      }
      throw error; // Other DNS errors
    }
  }

  /**
   * Validate subdomain format
   * @param {string} subdomain - The subdomain to validate
   * @returns {boolean} - Whether subdomain is valid
   */
  isValidSubdomain(subdomain) {
    // RFC compliant subdomain validation
    const subdomainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
    return subdomainRegex.test(subdomain) && subdomain.length <= 63;
  }

  /**
   * Generate unique subdomain from business name
   * @param {string} businessName - The business name
   * @returns {Promise<string>} - Unique subdomain
   */
  async generateUniqueSubdomain(businessName) {
    // Convert business name to subdomain format
    let baseSubdomain = businessName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens

    // Ensure it's not empty
    if (!baseSubdomain) {
      baseSubdomain = 'laundry';
    }

    // Truncate if too long
    if (baseSubdomain.length > 50) {
      baseSubdomain = baseSubdomain.substring(0, 50);
    }

    let subdomain = baseSubdomain;
    let counter = 1;

    // Check for uniqueness and add counter if needed
    while (await this.checkSubdomainExists(subdomain)) {
      subdomain = `${baseSubdomain}-${counter}`;
      counter++;
      
      // Prevent infinite loop
      if (counter > 999) {
        subdomain = `${baseSubdomain}-${Date.now()}`;
        break;
      }
    }

    return subdomain;
  }

  /**
   * Log subdomain creation for tracking
   * @param {string} subdomain - The created subdomain
   * @param {string} tenantId - The tenant ID
   * @param {Object} result - The creation result
   */
  async logSubdomainCreation(subdomain, tenantId, result) {
    try {
      // You can implement logging to database or file here
      console.log(`📝 Subdomain Log: ${subdomain}.${this.mainDomain} -> Tenant: ${tenantId}, Record ID: ${result.recordId}`);
      
      // Optional: Store in database for tracking
      // const SubdomainLog = require('../models/SubdomainLog');
      // await SubdomainLog.create({
      //   subdomain,
      //   tenantId,
      //   recordId: result.recordId,
      //   provider: this.provider,
      //   createdAt: new Date()
      // });
    } catch (error) {
      console.error('Failed to log subdomain creation:', error);
      // Don't throw error as this is not critical
    }
  }

  /**
   * Verify subdomain is working
   * @param {string} subdomain - The subdomain to verify
   * @returns {Promise<boolean>} - Whether subdomain is accessible
   */
  async verifySubdomain(subdomain) {
    try {
      const url = `https://${subdomain}.${this.mainDomain}`;
      const response = await axios.get(url, { 
        timeout: 10000,
        validateStatus: () => true // Accept any status code
      });
      
      return response.status < 500; // Consider 4xx as working (might be auth issues)
    } catch (error) {
      console.error(`Subdomain verification failed for ${subdomain}:`, error.message);
      return false;
    }
  }
}

module.exports = new SubdomainService();