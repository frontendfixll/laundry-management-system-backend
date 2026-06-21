// Stripe payment flow for customer-app orders.
//
// We use Stripe Checkout (hosted page) instead of the React Native SDK so the
// mobile app works in Expo Go without a native dev build. The flow:
//
//   1. Mobile creates an order with paymentMethod='online' (status: placed,
//      paymentStatus: pending)
//   2. Mobile POSTs /orders/:id/checkout-session → backend creates a Stripe
//      Checkout Session with the order id in metadata, returns the session URL
//   3. Mobile opens the URL in expo-web-browser (Safari View Controller /
//      Chrome Custom Tabs — secure embedded webview)
//   4. User pays. Stripe redirects to the success URL with the session id in
//      the query string
//   5. Mobile catches the redirect via deep link and POSTs
//      /orders/:id/confirm-payment with the session id
//   6. Backend re-fetches the session from Stripe to confirm payment_status
//      is 'paid' (never trust client claims) and marks the order paid

const mongoose = require('mongoose');
const Order = require('../../models/Order');

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.warn('[marketplace/payment] STRIPE_SECRET_KEY not set — online payments will fail');
}
const stripe = require('stripe')(stripeSecretKey || 'sk_test_placeholder');

const APP_SCHEME = 'laundrylobby';
const DEFAULT_SUCCESS_URL = `${APP_SCHEME}://payment-success?orderId={ORDER_ID}&session={CHECKOUT_SESSION_ID}`;
const DEFAULT_CANCEL_URL = `${APP_SCHEME}://payment-cancel?orderId={ORDER_ID}`;

function ensureStripeConfigured(res) {
  if (!stripeSecretKey) {
    res.status(500).json({
      success: false,
      error: 'Payment gateway not configured. Please contact support.'
    });
    return false;
  }
  return true;
}

// POST /api/customer-app/orders/:id/checkout-session
// Body (optional): { successUrl, cancelUrl }
//   - If client provides custom URLs they must contain {ORDER_ID} and
//     {CHECKOUT_SESSION_ID} placeholders; Stripe substitutes the latter.
//
// Returns: { url, sessionId }
exports.createCheckoutSession = async (req, res) => {
  try {
    if (!ensureStripeConfigured(res)) return;

    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid order id' });
    }

    const order = await Order.findOne({ _id: req.params.id, customer: userId })
      .populate({ path: 'branch', select: 'name' })
      .populate({ path: 'tenancy', select: 'name branding.businessName' });

    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, error: 'Order already paid' });
    }
    if (order.paymentMethod !== 'online') {
      return res.status(400).json({
        success: false,
        error: 'Order is not flagged for online payment'
      });
    }
    const amount = Number(order.pricing?.total);
    if (!(amount > 0)) {
      return res.status(400).json({ success: false, error: 'Order total must be > 0' });
    }

    const successUrlTemplate = typeof req.body?.successUrl === 'string'
      ? req.body.successUrl
      : DEFAULT_SUCCESS_URL;
    const cancelUrlTemplate = typeof req.body?.cancelUrl === 'string'
      ? req.body.cancelUrl
      : DEFAULT_CANCEL_URL;

    // Resolve {ORDER_ID} ourselves; Stripe handles {CHECKOUT_SESSION_ID}
    const orderIdStr = order._id.toString();
    const successUrl = successUrlTemplate.replace('{ORDER_ID}', orderIdStr);
    const cancelUrl = cancelUrlTemplate.replace('{ORDER_ID}', orderIdStr);

    const tenantName = order.tenancy?.branding?.businessName || order.tenancy?.name || 'LaundryLobby';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'inr',
            product_data: {
              name: `Order ${order.orderNumber}`,
              description: `${tenantName} · ${order.branch?.name ?? 'Branch'}`
            },
            unit_amount: Math.round(amount * 100) // INR → paise
          },
          quantity: 1
        }
      ],
      metadata: {
        type: 'customer_app_order',
        orderId: orderIdStr,
        orderNumber: order.orderNumber,
        tenancyId: order.tenancy?._id?.toString() ?? '',
        branchId: order.branch?._id?.toString() ?? '',
        customerId: userId.toString()
      },
      success_url: successUrl,
      cancel_url: cancelUrl
    });

    return res.json({ success: true, url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[marketplace/payment] createCheckoutSession error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create checkout session' });
  }
};

// POST /api/customer-app/orders/:id/confirm-payment
// Body: { sessionId }
//
// Verifies with Stripe (never trust the client) and marks the order paid.
// Idempotent — re-running on an already-paid order is a no-op success.
exports.confirmPayment = async (req, res) => {
  try {
    if (!ensureStripeConfigured(res)) return;

    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ success: false, error: 'Not authenticated' });
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid order id' });
    }
    const sessionId = req.body?.sessionId;
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ success: false, error: 'sessionId required' });
    }

    const order = await Order.findOne({ _id: req.params.id, customer: userId });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    if (order.paymentStatus === 'paid') {
      // Already confirmed — idempotent success
      return res.json({ success: true, alreadyPaid: true, order: { _id: order._id, paymentStatus: 'paid' } });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Sanity: the session must reference this order in its metadata
    if (session.metadata?.orderId !== order._id.toString()) {
      return res.status(400).json({
        success: false,
        error: 'Session does not belong to this order'
      });
    }

    if (session.payment_status !== 'paid') {
      return res.status(402).json({
        success: false,
        error: `Payment not completed (status: ${session.payment_status})`
      });
    }

    order.paymentStatus = 'paid';
    order.paymentDetails = {
      transactionId: session.payment_intent || session.id,
      paidAt: new Date()
    };
    order.statusHistory.push({
      status: order.status,
      updatedBy: userId,
      updatedAt: new Date(),
      notes: `Payment confirmed via Stripe (session ${session.id})`
    });
    await order.save();

    return res.json({
      success: true,
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
        paymentDetails: order.paymentDetails
      }
    });
  } catch (err) {
    console.error('[marketplace/payment] confirmPayment error:', err);
    return res.status(500).json({ success: false, error: 'Failed to confirm payment' });
  }
};
