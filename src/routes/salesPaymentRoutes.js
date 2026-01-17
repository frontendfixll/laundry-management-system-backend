const express = require('express');
const router = express.Router();
const salesPaymentController = require('../controllers/salesPaymentController');
const { authenticateSales, requireSalesPermission, logSalesAction } = require('../middlewares/salesAuth');
const { body, param } = require('express-validator');

// Validation rules
const validateGenerateLink = [
  body('tenancyId').isMongoId().withMessage('Valid tenancy ID required'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
  body('description').optional().trim(),
  body('invoiceId').optional().isMongoId().withMessage('Valid invoice ID required')
];

const validateOfflinePayment = [
  body('tenancyId').isMongoId().withMessage('Valid tenancy ID required'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
  body('paymentMethod').isIn(['cash', 'bank_transfer', 'cheque', 'upi', 'other']).withMessage('Valid payment method required'),
  body('transactionId').optional().trim(),
  body('paymentDate').optional().isISO8601().withMessage('Valid payment date required'),
  body('invoiceId').optional().isMongoId().withMessage('Valid invoice ID required'),
  body('notes').optional().trim()
];

const validateMarkPaid = [
  body('paymentMethod').optional().isIn(['cash', 'bank_transfer', 'cheque', 'upi', 'online', 'other']),
  body('transactionId').optional().trim(),
  body('notes').optional().trim()
];

const validateCreateInvoice = [
  body('tenancyId').isMongoId().withMessage('Valid tenancy ID required'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
  body('billingPeriod').optional().isObject(),
  body('dueDate').optional().isISO8601().withMessage('Valid due date required'),
  body('items').optional().isArray(),
  body('notes').optional().trim()
];

// Webhook route (no authentication - verified by Stripe signature)
router.post('/webhook',
  express.raw({ type: 'application/json' }),
  salesPaymentController.handleStripeWebhook
);

// All other routes require sales authentication
router.use(authenticateSales);

// Payment statistics
router.get('/stats',
  requireSalesPermission('payments', 'view'),
  logSalesAction('view_payment_stats', 'payments'),
  salesPaymentController.getPaymentStats
);

// Get all payments
router.get('/',
  requireSalesPermission('payments', 'view'),
  logSalesAction('view_payments', 'payments'),
  salesPaymentController.getPayments
);

// Get single payment
router.get('/:id',
  requireSalesPermission('payments', 'view'),
  logSalesAction('view_payment', 'payments'),
  salesPaymentController.getPayment
);

// Generate payment link
router.post('/generate-link',
  requireSalesPermission('payments', 'generateLink'),
  validateGenerateLink,
  logSalesAction('generate_payment_link', 'payments'),
  salesPaymentController.generatePaymentLink
);

// Record offline payment
router.post('/record-offline',
  requireSalesPermission('payments', 'recordOffline'),
  validateOfflinePayment,
  logSalesAction('record_offline_payment', 'payments'),
  salesPaymentController.recordOfflinePayment
);

// Mark invoice as paid
router.post('/:invoiceId/mark-paid',
  requireSalesPermission('payments', 'markPaid'),
  validateMarkPaid,
  logSalesAction('mark_invoice_paid', 'payments'),
  salesPaymentController.markInvoiceAsPaid
);

// Invoice routes
router.get('/invoices/all',
  requireSalesPermission('payments', 'view'),
  logSalesAction('view_invoices', 'invoices'),
  salesPaymentController.getInvoices
);

router.get('/invoices/:id',
  requireSalesPermission('payments', 'view'),
  logSalesAction('view_invoice', 'invoices'),
  salesPaymentController.getInvoice
);

router.post('/invoices',
  requireSalesPermission('payments', 'generateLink'),
  validateCreateInvoice,
  logSalesAction('create_invoice', 'invoices'),
  salesPaymentController.createInvoice
);

module.exports = router;
