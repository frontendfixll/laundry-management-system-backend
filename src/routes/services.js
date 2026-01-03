const express = require('express');
const {
  calculatePricing,
  getAvailableTimeSlots,
  checkServiceAvailability,
  getServiceTypes,
  getActiveBranches,
  getBranchServices
} = require('../controllers/servicesController');

const router = express.Router();

router.post('/calculate', calculatePricing);
router.get('/time-slots', getAvailableTimeSlots);
router.get('/availability/:pincode', checkServiceAvailability);
router.get('/types', getServiceTypes);
router.get('/branches', getActiveBranches);
router.get('/branch/:branchId', getBranchServices);

module.exports = router;