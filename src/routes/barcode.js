const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middlewares/auth');
const {
  scanBarcode,
  getOrderBarcode,
  updateStatusViaScan,
  bulkScan
} = require('../controllers/barcodeController');

// All routes require authentication
router.use(protect);

// Scan barcode - accessible by staff and admins
router.get('/scan/:barcode', restrictTo('admin', 'superadmin', 'staff'), scanBarcode);

// Get barcode for order - accessible by all authenticated users
router.get('/order/:orderId', getOrderBarcode);

// Update status via scan - staff and admin only
router.put('/scan/:barcode/status', restrictTo('admin', 'superadmin', 'staff'), updateStatusViaScan);

// Bulk scan - staff and admin only
router.post('/bulk-scan', restrictTo('admin', 'superadmin', 'staff'), bulkScan);

module.exports = router;
