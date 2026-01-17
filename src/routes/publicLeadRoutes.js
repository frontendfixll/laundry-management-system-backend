const express = require('express');
const router = express.Router();
const { createPublicLead } = require('../controllers/publicLeadController');

/**
 * @route   POST /api/public/leads
 * @desc    Create a new lead from marketing website
 * @access  Public (no authentication required)
 */
router.post('/leads', createPublicLead);

module.exports = router;
