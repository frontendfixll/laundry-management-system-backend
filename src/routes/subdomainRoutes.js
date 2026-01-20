const express = require('express');
const router = express.Router();
const subdomainService = require('../services/subdomainService');
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple');

// All routes require SuperAdmin authentication
router.use(authenticateSuperAdmin);

/**
 * GET /api/superadmin/subdomains
 * Get all active subdomains
 */
router.get('/', async (req, res) => {
  try {
    const subdomains = await subdomainService.getActiveSubdomains();
    
    res.json({
      success: true,
      data: { subdomains }
    });
  } catch (error) {
    console.error('Get subdomains error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subdomains'
    });
  }
});

/**
 * POST /api/superadmin/subdomains/check-availability
 * Check if subdomain is available
 */
router.post('/check-availability', async (req, res) => {
  try {
    const { subdomain } = req.body;
    
    if (!subdomain) {
      return res.status(400).json({
        success: false,
        message: 'Subdomain is required'
      });
    }
    
    // Validate subdomain format
    if (!/^[a-z0-9-]+$/.test(subdomain)) {
      return res.status(400).json({
        success: false,
        message: 'Subdomain can only contain lowercase letters, numbers, and hyphens'
      });
    }
    
    const isAvailable = await subdomainService.isSubdomainAvailable(subdomain);
    
    res.json({
      success: true,
      data: { 
        subdomain,
        available: isAvailable,
        fullDomain: `${subdomain}.laundrylobby.com`
      }
    });
  } catch (error) {
    console.error('Check subdomain availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check subdomain availability'
    });
  }
});

/**
 * POST /api/superadmin/subdomains/:tenancyId/create
 * Manually create subdomain for existing tenancy
 */
router.post('/:tenancyId/create', async (req, res) => {
  try {
    const { tenancyId } = req.params;
    const { subdomain } = req.body;
    
    if (!subdomain) {
      return res.status(400).json({
        success: false,
        message: 'Subdomain is required'
      });
    }
    
    const result = await subdomainService.createSubdomain(subdomain, tenancyId);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Subdomain created successfully',
        data: { subdomain: result.subdomain }
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    console.error('Create subdomain error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create subdomain'
    });
  }
});

/**
 * DELETE /api/superadmin/subdomains/:subdomain
 * Remove subdomain
 */
router.delete('/:subdomain', async (req, res) => {
  try {
    const { subdomain } = req.params;
    
    const result = await subdomainService.removeSubdomain(subdomain);
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Subdomain removed successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    console.error('Remove subdomain error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove subdomain'
    });
  }
});

module.exports = router;