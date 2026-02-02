const express = require('express');
const router = express.Router();
const publicAddOnController = require('../controllers/publicAddOnController');

// Public add-on routes (no authentication required)
router.get('/marketplace', publicAddOnController.getMarketplaceAddOns);
router.get('/categories', publicAddOnController.getAddOnCategories);
router.get('/:slug', publicAddOnController.getAddOnDetails);

module.exports = router;