const express = require('express');
const { protect, requireSupport } = require('../../middlewares/auth');
const { injectTenancyFromUser } = require('../../middlewares/tenancyMiddleware');
const ticketRoutes = require('./ticketRoutes');

const router = express.Router();

// Apply authentication and tenancy injection
router.use(protect);
router.use(requireSupport);
router.use(injectTenancyFromUser);

// Mount ticket routes
router.use('/tickets', ticketRoutes);

module.exports = router;