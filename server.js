const app = require('./src/app');
const connectDB = require('./src/config/database');

// Force deployment update - timestamp: 2025-01-20
console.log('🚀 Starting Laundry Management System Backend v2.0.1');

// Check if running on Vercel
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;

// Only import cron and socket services if not on Vercel
let cron, bannerLifecycleJob, socketService;
if (!isVercel) {
  cron = require('node-cron');
  bannerLifecycleJob = require('./src/jobs/bannerLifecycleJob');
  socketService = require('./src/services/socketService');
}

const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB().catch(err => {
  console.warn('⚠️  MongoDB connection failed, running without database');
  console.warn('💡 Some features will be limited without database connection');
  console.warn('🔧 Error:', err.message);
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
  
  // Add a simple test route to verify the app is working
  app.get('/test', (req, res) => {
    res.json({
      success: true,
      message: 'Test route working in Vercel',
      timestamp: new Date().toISOString(),
      environment: 'vercel-serverless'
    });
  });
  
  // Add CORS headers for all responses in serverless environment
  app.use((req, res, next) => {
    const origin = req.get('origin');
    
    // Allow specific origins
    const allowedOrigins = [
      'https://laundrylobby.vercel.app',
      'https://laundrylobby-superadmin.vercel.app',
      'https://laundrylobby.com',
      // Add your actual frontend URL
      'https://laundry-management-system-git-828182-deepakfixl2-5120s-projects.vercel.app',
      // Allow all Vercel preview deployments
      process.env.FRONTEND_URL,
      process.env.SUPERADMIN_URL,
      process.env.MARKETING_URL
    ].filter(Boolean);
    
    // Check if origin matches allowed patterns or Vercel deployments
    const isVercelDeployment = origin && /^https:\/\/.*\.vercel\.app$/.test(origin);
    const isTenantSubdomain = origin && /^https:\/\/[\w-]+\.laundrylobby\.com$/.test(origin);
    const isAllowedOrigin = allowedOrigins.includes(origin);
    
    console.log('🌐 Vercel CORS check:', {
      origin,
      isVercelDeployment,
      isTenantSubdomain,
      isAllowedOrigin
    });
    
    if (isVercelDeployment || isTenantSubdomain || isAllowedOrigin || !origin) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Tenancy-ID, X-Tenancy-Slug');
      res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      console.log('🔧 Vercel OPTIONS preflight for origin:', origin);
      return res.status(200).end();
    }
    
    next();
  });
  
  console.log('🌐 Vercel serverless mode: CORS headers configured for tenant subdomains');
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