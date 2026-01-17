const express = require('express');
const router = express.Router();
const Tenancy = require('../models/Tenancy');
const { sendSuccess, sendError } = require('../utils/helpers');

/**
 * @desc    Verify tenant by subdomain
 * @route   GET /api/tenants/verify/:subdomain
 * @access  Public (needed for middleware)
 */
router.get('/verify/:subdomain', async (req, res) => {
  try {
    const { subdomain } = req.params;
    
    console.log('🔍 Verifying tenant subdomain:', subdomain);
    
    // Validate subdomain format
    if (!subdomain || typeof subdomain !== 'string') {
      return sendError(res, 'INVALID_SUBDOMAIN', 'Invalid subdomain format', 400);
    }
    
    // Find tenant by subdomain
    const tenant = await Tenancy.findOne({
      subdomain: subdomain.toLowerCase(),
      status: 'active',
      isDeleted: false
    })
    .select('_id name subdomain branding settings contact businessHours')
    .populate('owner', 'name email phone')
    .lean();
    
    if (!tenant) {
      console.log('❌ Tenant not found for subdomain:', subdomain);
      return sendError(res, 'TENANT_NOT_FOUND', 'Tenant not found', 404);
    }
    
    console.log('✅ Tenant found:', tenant.name, 'ID:', tenant._id);
    
    // Return tenant data for frontend use
    const tenantData = {
      id: tenant._id,
      name: tenant.name,
      subdomain: tenant.subdomain,
      branding: {
        businessName: tenant.branding?.businessName || tenant.name,
        tagline: tenant.branding?.tagline || '',
        logo: tenant.branding?.logo || {},
        theme: {
          primaryColor: tenant.branding?.theme?.primaryColor || '#3B82F6',
          secondaryColor: tenant.branding?.theme?.secondaryColor || '#10B981',
          accentColor: tenant.branding?.theme?.accentColor || '#F59E0B'
        },
        socialMedia: tenant.branding?.socialMedia || {}
      },
      settings: {
        currency: tenant.settings?.currency || 'INR',
        timezone: tenant.settings?.timezone || 'Asia/Kolkata',
        language: tenant.settings?.language || 'en',
        minOrderAmount: tenant.settings?.minOrderAmount || 0,
        allowCOD: tenant.settings?.allowCOD !== false,
        allowOnlinePayment: tenant.settings?.allowOnlinePayment !== false
      },
      contact: {
        phone: tenant.contact?.phone || tenant.owner?.phone || '',
        email: tenant.contact?.email || tenant.owner?.email || '',
        address: tenant.contact?.address || {}
      },
      businessHours: tenant.businessHours || {},
      owner: {
        name: tenant.owner?.name || '',
        email: tenant.owner?.email || ''
      }
    };
    
    sendSuccess(res, tenantData, 'Tenant verified successfully');
  } catch (error) {
    console.error('❌ Tenant verification error:', error);
    sendError(res, 'VERIFICATION_ERROR', 'Internal server error during tenant verification', 500);
  }
});

/**
 * @desc    Get tenant configuration by subdomain (for app initialization)
 * @route   GET /api/tenants/config/:subdomain
 * @access  Public
 */
router.get('/config/:subdomain', async (req, res) => {
  try {
    const { subdomain } = req.params;
    
    console.log('⚙️ Getting tenant config for:', subdomain);
    
    const tenant = await Tenancy.findOne({
      subdomain: subdomain.toLowerCase(),
      status: 'active',
      isDeleted: false
    })
    .select('name branding settings subscription')
    .lean();
    
    if (!tenant) {
      return sendError(res, 'TENANT_NOT_FOUND', 'Tenant not found', 404);
    }
    
    // Return configuration for app theming and setup
    const config = {
      name: tenant.name,
      branding: tenant.branding,
      theme: tenant.branding?.theme || {},
      features: tenant.subscription?.features || {},
      settings: {
        currency: tenant.settings?.currency || 'INR',
        timezone: tenant.settings?.timezone || 'Asia/Kolkata',
        language: tenant.settings?.language || 'en'
      }
    };
    
    sendSuccess(res, config, 'Tenant configuration retrieved');
  } catch (error) {
    console.error('❌ Tenant config error:', error);
    sendError(res, 'CONFIG_ERROR', 'Failed to get tenant configuration', 500);
  }
});

/**
 * @desc    Check if subdomain is available
 * @route   GET /api/tenants/check-subdomain/:subdomain
 * @access  Private (SuperAdmin)
 */
router.get('/check-subdomain/:subdomain', async (req, res) => {
  try {
    const { subdomain } = req.params;
    
    // Check if subdomain exists
    const exists = await Tenancy.findOne({
      subdomain: subdomain.toLowerCase()
    });
    
    sendSuccess(res, {
      subdomain,
      available: !exists,
      exists: !!exists
    }, exists ? 'Subdomain already taken' : 'Subdomain available');
  } catch (error) {
    console.error('❌ Subdomain check error:', error);
    sendError(res, 'CHECK_ERROR', 'Failed to check subdomain availability', 500);
  }
});

module.exports = router;