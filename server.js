const app = require('./src/app');
const connectDB = require('./src/config/database');
const cron = require('node-cron');
const bannerLifecycleJob = require('./src/jobs/bannerLifecycleJob');
const socketService = require('./src/services/socketService');

const PORT = process.env.PORT || 5000;

// ============================================
// KEEP-ALIVE: Prevent Render Free Tier Sleep
// ============================================
const keepAlive = () => {
  const INTERVAL = 13 * 60 * 1000; // 13 minutes (Render sleeps at 15 min)
  
  setInterval(async () => {
    try {
      const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        console.log(`🏓 Keep-alive ping at ${new Date().toLocaleTimeString()}`);
      }
    } catch (err) {
      console.log('🏓 Keep-alive ping failed (server may be starting)');
    }
  }, INTERVAL);
  
  console.log('⏰ Keep-alive enabled - pings every 13 min');
};

// Connect to MongoDB
connectDB().catch(err => {
  console.warn('⚠️  MongoDB connection failed, running without database');
  console.warn('💡 Some features will be limited without database connection');
});

// ============================================
// CRON JOBS: Banner Lifecycle Management
// ============================================
const setupCronJobs = () => {
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

// Start server
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
  
  // Initialize Socket.IO
  socketService.initialize(server);
  
  // Setup cron jobs
  setupCronJobs();
  
  // Start keep-alive in production
  if (process.env.NODE_ENV === 'production') {
    keepAlive();
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});