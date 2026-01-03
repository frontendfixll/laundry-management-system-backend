const app = require('./src/app');
const connectDB = require('./src/config/database');

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

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 API docs: http://localhost:${PORT}/api`);
  
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