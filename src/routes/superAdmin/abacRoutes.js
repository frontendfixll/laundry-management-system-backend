const express = require('express');
const router = express.Router();
const abacController = require('../../controllers/superAdmin/abacController');
const { authenticateSuperAdmin } = require('../../middlewares/superAdminAuthSimple');

// All routes require SuperAdmin authentication
router.use(authenticateSuperAdmin);

router.get('/policies', abacController.getPolicies);
router.post('/policies', abacController.createPolicy);
router.patch('/policies/:policyId/toggle', abacController.togglePolicy);
router.delete('/policies/:policyId', abacController.deletePolicy);

router.get('/statistics', abacController.getStatistics);
router.get('/audit-logs', abacController.getAuditLogs);

router.post('/cache/refresh', abacController.refreshCache);
router.post('/core-policies/:policyId/initialize', abacController.initializeCorePolicy);

module.exports = router;
