const express = require('express');
const router = express.Router();

// Import controllers
const {
  getAddresses,
  getAddress,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress
} = require('../controllers/addressController');

// Import middleware
const { protect, requireEmailVerification } = require('../middlewares/auth');

// Import validation
const { addressValidation, validate } = require('../utils/validation');

// All routes require authentication and email verification
router.use(protect);
router.use(requireEmailVerification);

// Address routes
router.route('/')
  .get(getAddresses)
  .post(validate(addressValidation), addAddress);

router.route('/:id')
  .get(getAddress)
  .put(validate(addressValidation), updateAddress)
  .delete(deleteAddress);

router.put('/:id/set-default', setDefaultAddress);

module.exports = router;