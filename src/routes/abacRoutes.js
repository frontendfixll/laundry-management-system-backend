const express = require('express');
const router = express.Router();
const abacController = require('../controllers/abacController');
const { requireSuperAdminPermission } = require('../middlewares/rbacMiddleware');
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuth');

// Apply SuperAdmin authentication to all routes
router.use(authenticateSuperAdmin);

// ABAC Policy Management Routes
router.get('/policies', 
  requireSuperAdminPermission('abac_policies', 'view'),
  abacController.getPolicies
);

router.get('/policies/:id', 
  requireSuperAdminPermission('abac_policies', 'view'),
  abacController.getPolicy
);

router.post('/policies', 
  requireSuperAdminPermission('abac_policies', 'create'),
  abacController.createPolicy
);

router.put('/policies/:id', 
  requireSuperAdminPermission('abac_policies', 'update'),
  abacController.updatePolicy
);

router.delete('/policies/:id', 
  requireSuperAdminPermission('abac_policies', 'delete'),
  abacController.deletePolicy
);

router.patch('/policies/:id/toggle', 
  requireSuperAdminPermission('abac_policies', 'update'),
  abacController.togglePolicy
);

// ABAC Testing and Evaluation
router.post('/test', 
  requireSuperAdminPermission('abac_policies', 'view'),
  abacController.testPolicy
);

// ABAC Audit and Monitoring
router.get('/audit-logs', 
  requireSuperAdminPermission('audit_logs', 'view'),
  abacController.getAuditLogs
);

router.get('/statistics', 
  requireSuperAdminPermission('analytics', 'view'),
  abacController.getStatistics
);

// ABAC System Management
router.post('/core-policies/:policyId/initialize', 
  requireSuperAdminPermission('abac_policies', 'create'),
  abacController.initializeCorePolicy
);

router.post('/cache/refresh', 
  requireSuperAdminPermission('platform_settings', 'update'),
  abacController.refreshCache
);

module.exports = router;