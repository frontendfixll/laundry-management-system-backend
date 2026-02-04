const express = require('express');
const router = express.Router();
const { MongoClient } = require('mongodb');

// Initialize Stripe
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? require('stripe')(stripeSecretKey) : null;

/**
 * Get webhook system status
 * GET /api/admin/webhook-status
 */
const getWebhookStatus = async (req, res) => {
  try {
    const status = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      configuration: {},
      stripeWebhooks: [],
      recentEvents: [],
      stats: {},
      health: 'unknown'
    };

    // Check configuration
    status.configuration = {
      stripeSecretKey: !!process.env.STRIPE_SECRET_KEY,
      webhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      mongoUri: !!process.env.MONGODB_URI,
      webhookSecretPreview: process.env.STRIPE_WEBHOOK_SECRET ? 
        process.env.STRIPE_WEBHOOK_SECRET.substring(0, 15) + '...' : null
    };

    // Check Stripe webhook configuration
    if (stripe) {
      try {
        const webhooks = await stripe.webhookEndpoints.list();
        status.stripeWebhooks = webhooks.data.map(webhook => ({
          id: webhook.id,
          url: webhook.url,
          status: webhook.status,
          events: webhook.enabled_events,
          created: new Date(webhook.created * 1000).toISOString(),
          isProduction: webhook.url.includes('laundry-management-system-backend-1.onrender.com'),
          isLocalhost: webhook.url.includes('localhost')
        }));
      } catch (stripeError) {
        status.stripeError = stripeError.message;
      }
    }

    // Check recent webhook events from database
    if (process.env.MONGODB_URI) {
      try {
        const client = new MongoClient(process.env.MONGODB_URI);
        await client.connect();
        const db = client.db();

        // Get recent webhook logs
        const recentLogs = await db.collection('webhook_logs')
          .find({})
          .sort({ createdAt: -1 })
          .limit(20)
          .toArray();

        status.recentEvents = recentLogs.map(log => ({
          eventId: log.eventId,
          eventType: log.eventType,
          status: log.status,
          errorMessage: log.errorMessage,
          amount: log.eventData?.amount,
          customerEmail: log.eventData?.customerEmail,
          createdAt: log.createdAt,
          processedAt: log.processedAt
        }));

        // Calculate statistics
        const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const stats24h = await db.collection('webhook_logs').aggregate([
          { $match: { createdAt: { $gte: last24Hours } } },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]).toArray();

        const stats7d = await db.collection('webhook_logs').aggregate([
          { $match: { createdAt: { $gte: last7Days } } },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ]).toArray();

        status.stats = {
          last24Hours: {
            success: stats24h.find(s => s._id === 'success')?.count || 0,
            failed: stats24h.find(s => s._id === 'failed')?.count || 0
          },
          last7Days: {
            success: stats7d.find(s => s._id === 'success')?.count || 0,
            failed: stats7d.find(s => s._id === 'failed')?.count || 0
          }
        };

        // Calculate success rates
        const total24h = status.stats.last24Hours.success + status.stats.last24Hours.failed;
        const total7d = status.stats.last7Days.success + status.stats.last7Days.failed;

        status.stats.last24Hours.successRate = total24h > 0 ? 
          ((status.stats.last24Hours.success / total24h) * 100).toFixed(2) + '%' : 'N/A';
        
        status.stats.last7Days.successRate = total7d > 0 ? 
          ((status.stats.last7Days.success / total7d) * 100).toFixed(2) + '%' : 'N/A';

        await client.close();
      } catch (dbError) {
        status.databaseError = dbError.message;
      }
    }

    // Determine overall health
    const hasConfig = status.configuration.stripeSecretKey && 
                     status.configuration.webhookSecret && 
                     status.configuration.mongoUri;
    
    const hasProductionWebhook = status.stripeWebhooks.some(w => w.isProduction && w.status === 'enabled');
    const recentFailures = status.stats.last24Hours?.failed || 0;

    if (!hasConfig) {
      status.health = 'critical';
      status.healthMessage = 'Missing required configuration';
    } else if (!hasProductionWebhook) {
      status.health = 'warning';
      status.healthMessage = 'No production webhook configured';
    } else if (recentFailures > 0) {
      status.health = 'warning';
      status.healthMessage = `${recentFailures} webhook failures in last 24 hours`;
    } else {
      status.health = 'healthy';
      status.healthMessage = 'All systems operational';
    }

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    console.error('Webhook status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get webhook status',
      error: error.message
    });
  }
};

/**
 * Test webhook endpoint connectivity
 * POST /api/admin/webhook-test
 */
const testWebhookEndpoint = async (req, res) => {
  try {
    const webhookUrl = 'https://laundry-management-system-backend-1.onrender.com/api/public/stripe-webhook';
    
    const https = require('https');
    const { URL } = require('url');
    
    const testEndpoint = () => {
      return new Promise((resolve, reject) => {
        const url = new URL(webhookUrl);
        
        const options = {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'LaundryLobby-Admin-Test/1.0'
          },
          timeout: 10000
        };
        
        const req = https.request(options, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              statusMessage: res.statusMessage,
              headers: res.headers,
              body: data
            });
          });
        });
        
        req.on('error', (error) => {
          reject(error);
        });
        
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
        
        req.write(JSON.stringify({ test: 'admin-connectivity-test' }));
        req.end();
      });
    };
    
    const response = await testEndpoint();
    
    const isAccessible = response.statusCode === 400 && response.body.includes('Webhook Error');
    
    res.json({
      success: true,
      data: {
        webhookUrl,
        accessible: isAccessible,
        statusCode: response.statusCode,
        statusMessage: response.statusMessage,
        responseTime: Date.now(), // Could be enhanced with actual timing
        message: isAccessible ? 
          'Webhook endpoint is accessible and working correctly' :
          'Webhook endpoint may not be working properly'
      }
    });

  } catch (error) {
    res.json({
      success: false,
      data: {
        webhookUrl: 'https://laundry-management-system-backend-1.onrender.com/api/public/stripe-webhook',
        accessible: false,
        error: error.message,
        message: 'Webhook endpoint is not accessible'
      }
    });
  }
};

/**
 * Get recent Stripe sessions for comparison
 * GET /api/admin/stripe-sessions
 */
const getRecentStripeSessions = async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).json({
        success: false,
        message: 'Stripe not configured'
      });
    }

    const daysBack = parseInt(req.query.days) || 7;
    const limit = parseInt(req.query.limit) || 20;
    
    const startTime = Math.floor(Date.now() / 1000) - (daysBack * 24 * 60 * 60);
    
    const sessions = await stripe.checkout.sessions.list({
      created: { gte: startTime },
      limit
    });

    const processedSessions = sessions.data.map(session => ({
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      amount: session.amount_total,
      currency: session.currency,
      customerEmail: session.customer_details?.email || session.customer_email,
      planName: session.metadata?.planName,
      billingCycle: session.metadata?.billingCycle,
      created: new Date(session.created * 1000).toISOString(),
      paymentIntent: session.payment_intent
    }));

    // Check which sessions were processed in database
    if (process.env.MONGODB_URI) {
      const client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();
      const db = client.db();

      for (const session of processedSessions) {
        const tenancy = await db.collection('tenancies').findOne({
          'paymentDetails.stripeSessionId': session.id
        });
        
        session.processedInDatabase = !!tenancy;
        if (tenancy) {
          session.businessName = tenancy.name;
          session.subdomain = tenancy.slug;
        }
      }

      await client.close();
    }

    res.json({
      success: true,
      data: {
        sessions: processedSessions,
        total: sessions.data.length,
        hasMore: sessions.has_more,
        paidSessions: processedSessions.filter(s => s.paymentStatus === 'paid').length,
        processedSessions: processedSessions.filter(s => s.processedInDatabase).length
      }
    });

  } catch (error) {
    console.error('Stripe sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Stripe sessions',
      error: error.message
    });
  }
};

// Routes
router.get('/webhook-status', getWebhookStatus);
router.post('/webhook-test', testWebhookEndpoint);
router.get('/stripe-sessions', getRecentStripeSessions);

module.exports = router;