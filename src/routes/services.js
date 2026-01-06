const express = require('express');
const {
  calculatePricing,
  getAvailableTimeSlots,
  checkServiceAvailability,
  getServiceTypes
} = require('../controllers/servicesController');

const router = express.Router();

router.post('/calculate', calculatePricing);
router.get('/time-slots', getAvailableTimeSlots);
router.get('/availability/:pincode', checkServiceAvailability);
router.get('/types', getServiceTypes);

module.exports = router;