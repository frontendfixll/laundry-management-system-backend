const Tenancy = require('../models/Tenancy');
const { BillingPlan, TenancyInvoice, TenancyPayment } = require('../models/TenancyBilling');
const { sendSuccess, sendError, asyncHandler } = require('../utils/helpers');
const { validationResult } = require('express-validator');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Get all payments with filters
 * GET /api/sales/payments
 */
exports.getPayments = asyncHandler(async (req, res) => {
  const {
    status,
    tenancyId,
    search,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Build filter
  const filter = {};
  
  if (status) filter.status = status;
  if (tenancyId) filter.tenancy = tenancyId;

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  // Get payments
  const payments = await TenancyPayment.find(filter)
    .populate('tenancy', 'name slug')
    .populate('invoice', 'invoiceNumber amount')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  // Get total count
  const total = await TenancyPayment.countDocuments(filter);

  sendSuccess(res, {
    payments,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  }, 'Payments retrieved successfully');
});

/**
 * Get single payment
 * GET /api/sales/payments/:id
 */
exports.getPayment = asyncHandler(async (req, res) => {
  const payment = await TenancyPayment.findById(req.params.id)
    .populate('tenancy', 'name slug owner')
    .populate('invoice', 'invoiceNumber amount billingPeriod');

  if (!payment) {
    return sendError(res, 'Payment not found', 404);
  }

  sendSuccess(res, 'Payment retrieved', payment);
});

/**
 * Generate payment link (Stripe)
 * POST /api/sales/payments/generate-link
 */
exports.generatePaymentLink = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation failed', 400, errors.array());
  }

  const { tenancyId, amount, description, invoiceId } = req.body;

  // Verify tenancy exists
  const tenancy = await Tenancy.findById(tenancyId).populate('owner');
  if (!tenancy) {
    return sendError(res, 'Tenancy not found', 404);
  }

  try {
    // Create Stripe payment link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: 'inr',
            product_data: {
              name: description || `Subscription Payment - ${tenancy.name}`,
              description: `Payment for ${tenancy.name}`
            },
            unit_amount: Math.round(amount * 100) // Convert to paise
          },
          quantity: 1
        }
      ],
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${process.env.FRONTEND_URL}/payment/success`
        }
      },
      metadata: {
        tenancyId: tenancy._id.toString(),
        invoiceId: invoiceId || '',
        salesUserId: req.salesUser._id.toString()
      }
    });

    // Create payment record
    const payment = await TenancyPayment.create({
      tenancy: tenancy._id,
      invoice: invoiceId || null,
      amount,
      currency: 'INR',
      status: 'pending',
      paymentMethod: 'online',
      gateway: 'stripe',
      gatewayPaymentId: paymentLink.id,
      metadata: {
        paymentLink: paymentLink.url,
        createdBy: req.salesUser._id,
        createdByModel: 'SalesUser'
      }
    });

    sendSuccess(res, 'Payment link generated successfully', {
      payment,
      paymentLink: paymentLink.url
    });
  } catch (error) {
    console.error('Stripe payment link error:', error);
    return sendError(res, 'Failed to generate payment link: ' + error.message, 500);
  }
});

/**
 * Record offline payment
 * POST /api/sales/payments/record-offline
 */
exports.recordOfflinePayment = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation failed', 400, errors.array());
  }

  const {
    tenancyId,
    invoiceId,
    amount,
    paymentMethod,
    transactionId,
    paymentDate,
    notes
  } = req.body;

  // Verify tenancy exists
  const tenancy = await Tenancy.findById(tenancyId);
  if (!tenancy) {
    return sendError(res, 'Tenancy not found', 404);
  }

  // Create payment record
  const payment = await TenancyPayment.create({
    tenancy: tenancy._id,
    invoice: invoiceId || null,
    amount,
    currency: 'INR',
    status: 'completed',
    paymentMethod,
    transactionId,
    paidAt: paymentDate || new Date(),
    metadata: {
      notes,
      recordedBy: req.salesUser._id,
      recordedByModel: 'SalesUser',
      isOffline: true
    }
  });

  // Update invoice if provided
  if (invoiceId) {
    const invoice = await TenancyInvoice.findById(invoiceId);
    if (invoice) {
      invoice.status = 'paid';
      invoice.paidAt = payment.paidAt;
      invoice.paymentMethod = paymentMethod;
      invoice.transactionId = transactionId;
      await invoice.save();
    }
  }

  // Update sales user performance
  await req.salesUser.updatePerformance({
    totalRevenue: req.salesUser.performance.totalRevenue + amount,
    currentMonthRevenue: req.salesUser.performance.currentMonthRevenue + amount
  });

  sendSuccess(res, 'Offline payment recorded successfully', payment, 201);
});

/**
 * Mark invoice as paid
 * POST /api/sales/payments/:invoiceId/mark-paid
 */
exports.markInvoiceAsPaid = asyncHandler(async (req, res) => {
  const { paymentMethod, transactionId, notes } = req.body;
  
  const invoice = await TenancyInvoice.findById(req.params.invoiceId);
  if (!invoice) {
    return sendError(res, 'Invoice not found', 404);
  }

  if (invoice.status === 'paid') {
    return sendError(res, 'Invoice is already marked as paid', 400);
  }

  // Update invoice
  invoice.status = 'paid';
  invoice.paidAt = new Date();
  invoice.paymentMethod = paymentMethod || 'manual';
  invoice.transactionId = transactionId || '';
  await invoice.save();

  // Create payment record
  const payment = await TenancyPayment.create({
    tenancy: invoice.tenancy,
    invoice: invoice._id,
    amount: invoice.amount,
    currency: invoice.currency,
    status: 'completed',
    paymentMethod: paymentMethod || 'manual',
    transactionId: transactionId || '',
    paidAt: new Date(),
    metadata: {
      notes,
      markedBy: req.salesUser._id,
      markedByModel: 'SalesUser'
    }
  });

  sendSuccess(res, 'Invoice marked as paid', { invoice, payment });
});

/**
 * Get all invoices with filters
 * GET /api/sales/invoices
 */
exports.getInvoices = asyncHandler(async (req, res) => {
  const {
    status,
    tenancyId,
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  // Build filter
  const filter = {};
  
  if (status) filter.status = status;
  if (tenancyId) filter.tenancy = tenancyId;

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  // Get invoices
  const invoices = await TenancyInvoice.find(filter)
    .populate('tenancy', 'name slug')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  // Get total count
  const total = await TenancyInvoice.countDocuments(filter);

  sendSuccess(res, 'Invoices retrieved', {
    invoices,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});

/**
 * Get single invoice
 * GET /api/sales/invoices/:id
 */
exports.getInvoice = asyncHandler(async (req, res) => {
  const invoice = await TenancyInvoice.findById(req.params.id)
    .populate('tenancy', 'name slug owner contact');

  if (!invoice) {
    return sendError(res, 'Invoice not found', 404);
  }

  // Get related payments
  const payments = await TenancyPayment.find({ invoice: invoice._id });

  sendSuccess(res, 'Invoice retrieved', { invoice, payments });
});

/**
 * Create invoice
 * POST /api/sales/invoices
 */
exports.createInvoice = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, 'Validation failed', 400, errors.array());
  }

  const {
    tenancyId,
    amount,
    billingPeriod,
    dueDate,
    items,
    notes
  } = req.body;

  // Verify tenancy exists
  const tenancy = await Tenancy.findById(tenancyId);
  if (!tenancy) {
    return sendError(res, 'Tenancy not found', 404);
  }

  // Generate invoice number
  const count = await TenancyInvoice.countDocuments();
  const invoiceNumber = `INV-${Date.now()}-${count + 1}`;

  // Create invoice
  const invoice = await TenancyInvoice.create({
    tenancy: tenancy._id,
    invoiceNumber,
    amount,
    currency: 'INR',
    status: 'pending',
    billingPeriod,
    dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days default
    items: items || [],
    notes,
    metadata: {
      createdBy: req.salesUser._id,
      createdByModel: 'SalesUser'
    }
  });

  sendSuccess(res, 'Invoice created successfully', invoice, 201);
});

/**
 * Get payment statistics
 * GET /api/sales/payments/stats
 */
exports.getPaymentStats = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const filter = {};
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const stats = await TenancyPayment.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        completedAmount: {
          $sum: {
            $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0]
          }
        }
      }
    }
  ]);

  // Get payment method distribution
  const methodDistribution = await TenancyPayment.aggregate([
    { $match: { ...filter, status: 'completed' } },
    {
      $group: {
        _id: '$paymentMethod',
        count: { $sum: 1 },
        amount: { $sum: '$amount' }
      }
    },
    { $sort: { amount: -1 } }
  ]);

  // Get overdue invoices
  const overdueInvoices = await TenancyInvoice.countDocuments({
    status: { $in: ['pending', 'overdue'] },
    dueDate: { $lt: new Date() }
  });

  const result = stats[0] || {
    total: 0,
    totalAmount: 0,
    completed: 0,
    pending: 0,
    failed: 0,
    completedAmount: 0
  };

  sendSuccess(res, stats[0] || {
    total: 0,
    totalAmount: 0,
    completed: 0,
    pending: 0,
    failed: 0,
    completedAmount: 0,
    methodDistribution,
    overdueInvoices
  }, 'Payment statistics retrieved successfully');
});

/**
 * Handle Stripe webhook
 * POST /api/sales/payments/webhook
 */
exports.handleStripeWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      
      // Update payment status
      const payment = await TenancyPayment.findOne({
        gatewayPaymentId: session.id
      });

      if (payment) {
        payment.status = 'completed';
        payment.paidAt = new Date();
        payment.transactionId = session.payment_intent;
        await payment.save();

        // Update invoice if exists
        if (payment.invoice) {
          const invoice = await TenancyInvoice.findById(payment.invoice);
          if (invoice) {
            invoice.status = 'paid';
            invoice.paidAt = new Date();
            await invoice.save();
          }
        }
      }
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      
      const failedPaymentRecord = await TenancyPayment.findOne({
        transactionId: failedPayment.id
      });

      if (failedPaymentRecord) {
        failedPaymentRecord.status = 'failed';
        await failedPaymentRecord.save();
      }
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});
