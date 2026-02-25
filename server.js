const app = require('./src/app');
const connectDB = require('./src/config/database');
const firebaseServer = require('./src/services/firebaseServer');

// Force deployment update - timestamp: 2025-01-20
console.log('🚀 Starting Laundry Management System Backend v2.0.2 with Firebase Notifications');

// Check if running on Vercel
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;

// Only import cron and socket services if not on Vercel
let cron, bannerLifecycleJob, socketService;
if (!isVercel) {
  cron = require('node-cron');
  bannerLifecycleJob = require('./src/jobs/bannerLifecycleJob');
  socketService = require('./src/services/socketService');
}

const PORT = process.env.PORT || 5001;

// ============================================
// CRON JOBS: Banner Lifecycle Management (Only for non-Vercel environments)
// ============================================
const setupCronJobs = () => {
  if (isVercel) {
    console.log('⏰ Cron jobs disabled on Vercel (use Vercel Cron or external service)');
    return;
  }

  // Helper function to check MongoDB connection before running jobs
  const runJobWithConnectionCheck = async (jobName, jobFunction) => {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState !== 1) {
      console.log(`⚠️ Skipping ${jobName} - MongoDB not connected (state: ${mongoose.connection.readyState})`);
      return;
    }

    try {
      console.log(`🔄 Running ${jobName} job...`);
      await jobFunction();
      console.log(`✅ ${jobName} job completed successfully`);
    } catch (error) {
      console.error(`❌ Error in ${jobName}:`, error.message);
    }
  };

  // Auto-activate scheduled banners (every 5 minutes)
  cron.schedule('*/5 * * * *', async () => {
    await runJobWithConnectionCheck('auto-activate banners', bannerLifecycleJob.autoActivateBanners);
  });

  // Auto-complete expired banners (every hour)
  cron.schedule('0 * * * *', async () => {
    await runJobWithConnectionCheck('auto-complete banners', bannerLifecycleJob.autoCompleteBanners);
  });

  // Sync banners with campaigns (every 15 minutes)
  cron.schedule('*/15 * * * *', async () => {
    await runJobWithConnectionCheck('sync banners with campaigns', bannerLifecycleJob.syncWithCampaigns);
  });

  console.log('⏰ Banner lifecycle cron jobs scheduled:');
  console.log('   - Auto-activate: Every 5 minutes');
  console.log('   - Auto-complete: Every hour');
  console.log('   - Campaign sync: Every 15 minutes');
};

// For Vercel serverless functions, export the app immediately
if (isVercel) {
  // Don't wait for connection in serverless - connect on demand
  console.log('🌐 Vercel serverless mode: Setting up on-demand connection');

  // Add a simple test route to verify the app is working
  app.get('/test', async (req, res) => {
    const mongoose = require('mongoose');
    let connectionStatus = 'unknown';

    try {
      // Try to connect if not connected
      if (mongoose.connection.readyState !== 1) {
        console.log('🔄 Test route: Attempting MongoDB connection...');
        await connectDB();
      }
      connectionStatus = 'connected';
    } catch (error) {
      console.error('❌ Test route: Connection failed:', error.message);
      connectionStatus = 'failed';
    }

    res.json({
      success: true,
      message: 'Test route working in Vercel',
      timestamp: new Date().toISOString(),
      environment: 'vercel-serverless',
      nodeVersion: process.version,
      platform: process.platform,
      mongooseState: mongoose.connection.readyState,
      connectionStatus,
      mongooseStates: {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
      },
      currentState: mongoose.connection.readyState === 1 ? 'connected' :
        mongoose.connection.readyState === 2 ? 'connecting' :
          mongoose.connection.readyState === 3 ? 'disconnecting' : 'disconnected'
    });
  });

  console.log('🌐 Vercel serverless mode: App ready for export with DB connection wrapper');

  // Export a wrapper function that ensures DB connection before handling request
  module.exports = async (req, res) => {
    try {
      // Ensure DB is connected before handling the request
      // This uses the existing connectDB logic which handles connection reuse
      await connectDB();
      return app(req, res);
    } catch (error) {
      console.error('❌ Vercel Wrapper: DB Connection failed:', error);
      // If DB fails, we should still try to serve the request (Express might handle it or show 500)
      // or explicitly fail here. Let's try to let app handle it if possible, 
      // but usually if DB down, we want to fail fast or let error handler catch it.
      // However, app might have non-DB routes.
      return app(req, res);
    }
  };
} else {
  // Traditional server setup for local development
  // Connect to MongoDB and WAIT for connection
  const startServer = async () => {
    let dbConnected = false;

    try {
      await connectDB();
      console.log('✅ Database connected successfully');
      dbConnected = true;
    } catch (err) {
      console.warn('⚠️  MongoDB connection failed, running without database');
      console.warn('💡 Some features will be limited without database connection');
      console.warn('🔧 Error:', err.message);
      dbConnected = false;
    }

    // Start server after database connection attempt
    const server = app.listen(PORT, async () => {
      const APP_VERSION = process.env.APP_VERSION || 'unknown';

      console.log('='.repeat(60));
      console.log(`🚀 Laundry Management System v${APP_VERSION}`);
      console.log('='.repeat(60));
      console.log(`📦 Version: ${APP_VERSION}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔌 Port: ${PORT}`);
      console.log(`📍 Health: http://localhost:${PORT}/health`);
      console.log(`📊 Version: http://localhost:${PORT}/version`);
      console.log(`📚 API: http://localhost:${PORT}/api`);
      console.log('='.repeat(60));

      // Initialize Firebase Notification Engine (Primary)
      console.log('🔄 Initializing Firebase Notification Engine...');
      try {
        const notificationEngine = await firebaseServer.initialize(server);
        console.log('✅ Firebase Notification Engine initialized successfully');
        console.log('🎉 Modern notification system ready for real-time delivery');

        // Make engine available globally for other services
        global.notificationEngine = notificationEngine;

        // Initialize Automation Engine with notification system
        console.log('🤖 Initializing Automation Engine...');
        const automationEngine = require('./src/services/automationEngine');
        automationEngine.initialize(notificationEngine);
        console.log('✅ Automation Engine initialized and connected to notifications');

        // Make automation engine available globally
        global.automationEngine = automationEngine;

        // Initialize Automation Triggers
        console.log('🎯 Initializing Automation Triggers...');
        const automationTriggers = require('./src/services/automationTriggers');
        automationTriggers.initialize();
        global.automationTriggers = automationTriggers;
        console.log('✅ Automation Triggers initialized');

      } catch (firebaseError) {
        console.error('❌ Firebase Notification Engine initialization failed:', firebaseError);
        console.log('⚠️ Running without real-time notifications');
        console.log('💡 Check Firebase configuration and try restarting the server');
      }

      // Initialize legacy Socket.IO (only as additional fallback)
      // DISABLED: Using new Socket.IO Notification Engine instead
      // if (socketService) {
      //   socketService.initialize(server);
      //   console.log('🔌 Legacy WebSocket service initialized as additional fallback');
      // }

      // Setup cron jobs only after server is fully started
      if (dbConnected) {
        console.log('✅ Database connected - setting up cron jobs');
        setupCronJobs();
      } else {
        console.log('⚠️ Database not connected - cron jobs will check connection before running');
        setupCronJobs(); // Still setup jobs, but they'll check connection before running
      }
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
      console.error('❌ Unhandled Rejection:', err.message);
      if (server) {
        server.close(() => process.exit(1));
      } else {
        process.exit(1);
      }
    });
  };

  // Start the server
  startServer();
}