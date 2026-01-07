const express = require('express');
const {
  calculatePricing,
  getAvailableTimeSlots,
  checkServiceAvailability,
  getServiceTypes,
  getBranches,
  getPublicPricing
} = require('../controllers/servicesController');

const router = express.Router();

router.post('/calculate', calculatePricing);
router.get('/time-slots', getAvailableTimeSlots);
router.get('/availability/:pincode', checkServiceAvailability);
router.get('/types', getServiceTypes);
router.get('/branches', getBranches);
router.get('/pricing', getPublicPricing);

module.exports = router;