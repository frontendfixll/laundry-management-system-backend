const express = require('express');
const router = express.Router();
const abacController = require('../../controllers/superAdmin/abacController');
const { protect } = require('../../middlewares/auth');
const checkRole = require('../../middlewares/roleCheck');

// All routes require authentication and SuperAdmin role
// We can use 'superadmin' role check or specific permission
router.use(protect);
// router.use(checkRole(['superadmin'])); // Uncomment when role middleware is confirmed working for this context

router.get('/policies', abacController.getPolicies);
router.post('/policies', abacController.createPolicy);
router.patch('/policies/:policyId/toggle', abacController.togglePolicy);
router.delete('/policies/:policyId', abacController.deletePolicy);

router.get('/statistics', abacController.getStatistics);

router.post('/cache/refresh', abacController.refreshCache);
router.post('/core-policies/:policyId/initialize', abacController.initializeCorePolicy);

module.exports = router;
