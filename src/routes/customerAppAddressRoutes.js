// Customer-app address management.
//
// Reuses the existing Address model + addressController so addresses managed
// here are the same ones the tenant-side flows already know about. The only
// reason we don't reuse src/routes/addresses.js directly is that it applies
// `requireEmailVerification`, which would block phone-OTP customers who have
// a synthetic email and isEmailVerified=false.

const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const {
  getAddresses,
  getAddress,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress
} = require('../controllers/addressController');
const { addressValidation, validate } = require('../utils/validation');

router.use(protect);

router.route('/')
  .get(getAddresses)
  .post(validate(addressValidation), addAddress);

router.route('/:id')
  .get(getAddress)
  .put(validate(addressValidation), updateAddress)
  .delete(deleteAddress);

router.put('/:id/set-default', setDefaultAddress);

module.exports = router;
