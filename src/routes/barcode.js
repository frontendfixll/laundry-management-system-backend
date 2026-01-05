const express = require('express');
const router = express.Router();
const { protect, restrictTo } = require('../middlewares/auth');
const {
  scanBarcode,
  scanItemTag,
  getOrderBarcode,
  getOrderLabels,
  updateItemStatusViaScan,
  updateStatusViaScan,
  bulkScan,
  reportItemIssue
} = require('../controllers/barcodeController');

// All routes require authentication
router.use(protect);

// Scan barcode (order or item) - accessible by staff and admins
router.get('/scan/:barcode', restrictTo('admin', 'superadmin', 'staff'), scanBarcode);

// Scan item tag specifically - accessible by staff and admins
router.get('/scan-item/:tagCode', restrictTo('admin', 'superadmin', 'staff'), scanItemTag);

// Get barcode for order - accessible by all authenticated users
router.get('/order/:orderId', getOrderBarcode);

// Get print labels for order items - staff and admin only
router.get('/order/:orderId/labels', restrictTo('admin', 'superadmin', 'staff'), getOrderLabels);

// Update order status via scan - staff and admin only
router.put('/scan/:barcode/status', restrictTo('admin', 'superadmin', 'staff'), updateStatusViaScan);

// Update item processing status via tag scan - staff and admin only
router.put('/scan-item/:tagCode/status', restrictTo('admin', 'superadmin', 'staff'), updateItemStatusViaScan);

// Report issue on item via tag scan - staff and admin only
router.post('/scan-item/:tagCode/issue', restrictTo('admin', 'superadmin', 'staff'), reportItemIssue);

// Bulk scan - staff and admin only
router.post('/bulk-scan', restrictTo('admin', 'superadmin', 'staff'), bulkScan);

module.exports = router;
