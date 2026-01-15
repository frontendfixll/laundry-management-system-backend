const express = require('express');
const router = express.Router();
const featureController = require('../controllers/featureController');
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple');

// All routes require superadmin authentication
router.use(authenticateSuperAdmin);

// Get all features (with grouping)
router.get('/', featureController.getAllFeatures);

// Get default features map
router.get('/defaults', featureController.getDefaultsMap);

// Create new feature
router.post('/', featureController.createFeature);

// Reorder features
router.post('/reorder', featureController.reorderFeatures);

// Update feature
router.put('/:id', featureController.updateFeature);

// Toggle feature active status
router.patch('/:id/toggle', featureController.toggleFeature);

// Delete feature
router.delete('/:id', featureController.deleteFeature);

module.exports = router;
