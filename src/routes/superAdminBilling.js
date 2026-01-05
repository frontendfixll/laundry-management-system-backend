const express = require('express');
const router = express.Router();
const billingController = require('../controllers/superAdmin/billingController');
const { authenticateSuperAdmin } = require('../middlewares/superAdminAuthSimple');

// All routes require superadmin authentication
router.use(authenticateSuperAdmin);

// Billing Plans
router.get('/plans', billingController.getPlans);
router.post('/plans', billingController.upsertPlan);

// Invoices
router.get('/invoices', billingController.getInvoices);
router.post('/invoices', billingController.generateInvoice);
router.patch('/invoices/:invoiceId/paid', billingController.markInvoicePaid);

// Payments
router.get('/payments', billingController.getPayments);

// Stats
router.get('/stats', billingController.getBillingStats);

// Tenancy subscription
router.patch('/tenancies/:tenancyId/plan', billingController.updateTenancyPlan);

module.exports = router;
