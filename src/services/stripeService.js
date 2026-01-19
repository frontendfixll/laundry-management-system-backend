const Stripe = require('stripe');

class StripeService {
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_...', {
      apiVersion: '2023-10-16'
    });
  }

  /**
   * Create payment intent for upgrade request
   */
  async createPaymentIntent(upgradeRequest) {
    try {
      const { tenancy, pricing, toPlan } = upgradeRequest;
      
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(pricing.customPrice * 100), // Convert to paise/cents
        currency: 'inr',
        metadata: {
          upgradeRequestId: upgradeRequest._id.toString(),
          tenancyId: tenancy._id.toString(),
          tenancyName: tenancy.name,
          fromPlan: upgradeRequest.fromPlan.displayName,
          toPlan: toPlan.displayName,
          type: 'plan_upgrade'
        },
        description: `Plan upgrade for ${tenancy.name} from ${upgradeRequest.fromPlan.displayName} to ${toPlan.displayName}`,
        receipt_email: tenancy.contactPerson?.email,
        automatic_payment_methods: {
          enabled: true,
        },
      });

      return {
        success: true,
        paymentIntent,
        clientSecret: paymentIntent.client_secret
      };
    } catch (error) {
      console.error('Stripe payment intent creation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create Stripe Checkout Session for upgrade
   */
  async createCheckoutSession(upgradeRequest, successUrl, cancelUrl) {
    try {
      const { tenancy, pricing, toPlan } = upgradeRequest;
      
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'inr',
              product_data: {
                name: `Upgrade to ${toPlan.displayName}`,
                description: `Plan upgrade for ${tenancy.name}`,
                images: [], // Add your product images here
              },
              unit_amount: Math.round(pricing.customPrice * 100), // Convert to paise
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: tenancy.contactPerson?.email,
        metadata: {
          upgradeRequestId: upgradeRequest._id.toString(),
          tenancyId: tenancy._id.toString(),
          tenancyName: tenancy.name,
          type: 'plan_upgrade'
        },
        billing_address_collection: 'required',
        shipping_address_collection: {
          allowed_countries: ['IN'],
        },
      });

      return {
        success: true,
        session,
        sessionId: session.id,
        url: session.url
      };
    } catch (error) {
      console.error('Stripe checkout session creation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature) {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      return { success: true, event };
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle successful payment
   */
  async handleSuccessfulPayment(paymentIntent) {
    try {
      const upgradeRequestId = paymentIntent.metadata.upgradeRequestId;
      const amount = paymentIntent.amount / 100; // Convert from paise to rupees
      
      return {
        success: true,
        upgradeRequestId,
        amount,
        paymentIntentId: paymentIntent.id,
        paymentMethod: paymentIntent.payment_method,
        receiptUrl: paymentIntent.charges?.data[0]?.receipt_url
      };
    } catch (error) {
      console.error('Payment handling failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Retrieve payment intent
   */
  async retrievePaymentIntent(paymentIntentId) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      return { success: true, paymentIntent };
    } catch (error) {
      console.error('Payment intent retrieval failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create refund for failed upgrade
   */
  async createRefund(paymentIntentId, amount = null, reason = 'requested_by_customer') {
    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: amount ? Math.round(amount * 100) : undefined, // Convert to paise if specified
        reason: reason
      });

      return {
        success: true,
        refund,
        refundId: refund.id,
        status: refund.status
      };
    } catch (error) {
      console.error('Refund creation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get payment methods for customer
   */
  async getPaymentMethods(customerId) {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });

      return {
        success: true,
        paymentMethods: paymentMethods.data
      };
    } catch (error) {
      console.error('Payment methods retrieval failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create or retrieve Stripe customer
   */
  async createOrRetrieveCustomer(tenancy) {
    try {
      // Try to find existing customer by email
      const existingCustomers = await this.stripe.customers.list({
        email: tenancy.contactPerson?.email,
        limit: 1
      });

      if (existingCustomers.data.length > 0) {
        return {
          success: true,
          customer: existingCustomers.data[0],
          isNew: false
        };
      }

      // Create new customer
      const customer = await this.stripe.customers.create({
        email: tenancy.contactPerson?.email,
        name: tenancy.contactPerson?.name || tenancy.name,
        phone: tenancy.contactPerson?.phone,
        metadata: {
          tenancyId: tenancy._id.toString(),
          tenancyName: tenancy.name
        }
      });

      return {
        success: true,
        customer,
        isNew: true
      };
    } catch (error) {
      console.error('Customer creation/retrieval failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new StripeService();