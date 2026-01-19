const app = require('../src/app');
const connectDB = require('../src/config/database');

// Check if running on Vercel
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;

// Only import cron and socket services if not on Vercel
let cron, bannerLifecycleJob, socketService;
if (!isVercel) {
  cron = require('node-cron');
  bannerLifecycleJob = require('../src/jobs/bannerLifecycleJob');
  socketService = require('../src/services/socketService');
}

const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB().catch(err => {
  console.warn('⚠️  MongoDB connection failed, running without database');
  console.warn('💡 Some features will be limited without database connection');
});

// ============================================
// CRON JOBS: Banner Lifecycle Management (Only for non-Vercel environments)
// ============================================
const setupCronJobs = () => {
  if (isVercel) {
    console.log('⏰ Cron jobs disabled on Vercel (use Vercel Cron or external service)');
    return;
  }

  // Auto-activate scheduled banners (every 5 minutes)
  cron.schedule('*/5 * * * *', async () => {
    await bannerLifecycleJob.autoActivateBanners();
  });
  
  // Auto-complete expired banners (every hour)
  cron.schedule('0 * * * *', async () => {
    await bannerLifecycleJob.autoCompleteBanners();
  });
  
  // Sync banners with campaigns (every 15 minutes)
  cron.schedule('*/15 * * * *', async () => {
    await bannerLifecycleJob.syncWithCampaigns();
  });
  
  console.log('⏰ Banner lifecycle cron jobs scheduled:');
  console.log('   - Auto-activate: Every 5 minutes');
  console.log('   - Auto-complete: Every hour');
  console.log('   - Campaign sync: Every 15 minutes');
};

// For Vercel serverless functions, export the app
if (isVercel) {
  // Initialize database connection for serverless
  connectDB();
  module.exports = app;
} else {
  // Traditional server setup for local development and other platforms
  const server = app.listen(PORT, () => {
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
    
    // Initialize Socket.IO (only for traditional server)
    if (socketService) {
      socketService.initialize(server);
    }
    
    // Setup cron jobs
    setupCronJobs();
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
}