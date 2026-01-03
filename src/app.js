const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const errorHandler = require('./middlewares/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const addressRoutes = require('./routes/addresses');
const statsRoutes = require('./routes/stats');
const servicesRoutes = require('./routes/services');
const customerRoutes = require('./routes/customer/customerRoutes');
const adminRoutes = require('./routes/admin/adminRoutes');
const centerAdminRoutes = require('./routes/centerAdmin/centerAdminRoutes');

// SuperAdmin routes
const superAdminAuthRoutes = require('./routes/superAdminAuthRoutes');
const superAdminDashboardRoutes = require('./routes/superAdminDashboardRoutes');
const superAdminBranchRoutes = require('./routes/superAdminBranches');
const superAdminRoleRoutes = require('./routes/superAdminRoles');
const superAdminPricingRoutes = require('./routes/superAdminPricing');
const superAdminFinancialRoutes = require('./routes/superAdminFinancial');
const superAdminRiskRoutes = require('./routes/superAdminRisk');
const superAdminAnalyticsRoutes = require('./routes/superAdminAnalytics');
const superAdminSettingsRoutes = require('./routes/superAdminSettings');
const superAdminAuditRoutes = require('./routes/superAdminAudit');
const superAdminLogisticsRoutes = require('./routes/superAdminLogistics');
const superAdminOrdersRoutes = require('./routes/superAdminOrders');
const superAdminUsersRoutes = require('./routes/superAdminUsers');
const superAdminAdminsRoutes = require('./routes/superAdminAdmins');
const superAdminCustomersRoutes = require('./routes/superAdminCustomers');

const servicePricesRoutes = require('./routes/servicePrices');
const serviceItemsRoutes = require('./routes/serviceItems');
const deliveryRoutes = require('./routes/delivery');
const adminServiceRoutes = require('./routes/admin/serviceRoutes');
const branchServiceRoutes = require('./routes/admin/branchServiceRoutes');
const barcodeRoutes = require('./routes/barcode');
const publicRoutes = require('./routes/publicRoutes');

const app = express();

// Trust proxy for Render/production (needed for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS configuration with credentials support for cookies
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:3003',
  process.env.FRONTEND_URL,
  process.env.SUPERADMIN_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(null, true); // Allow all origins in production for now
    }
  },
  credentials: true  // Allow cookies to be sent
}));

// Cookie parser middleware
app.use(cookieParser());

// Rate limiting (relaxed for development)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // increased limit for development
  message: 'Too many requests from this IP, please try again later.'
});

// Only apply rate limiting in production
if (process.env.NODE_ENV === 'production') {
  app.use('/api/', limiter);
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Laundry Management API is running',
    timestamp: new Date().toISOString()
  });
});

// API Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Laundry Management API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/admin', adminRoutes);

// SuperAdmin routes
app.use('/api/superadmin/auth', superAdminAuthRoutes);
app.use('/api/superadmin/dashboard', superAdminDashboardRoutes);
app.use('/api/superadmin/branches', superAdminBranchRoutes);
app.use('/api/superadmin/roles', superAdminRoleRoutes);
app.use('/api/superadmin/pricing', superAdminPricingRoutes);
app.use('/api/superadmin/financial', superAdminFinancialRoutes);
app.use('/api/superadmin/risk', superAdminRiskRoutes);
app.use('/api/superadmin/analytics', superAdminAnalyticsRoutes);
app.use('/api/superadmin/settings', superAdminSettingsRoutes);
app.use('/api/superadmin/audit', superAdminAuditRoutes);
app.use('/api/superadmin/logistics', superAdminLogisticsRoutes);
app.use('/api/superadmin/orders', superAdminOrdersRoutes);
app.use('/api/superadmin/users', superAdminUsersRoutes);
app.use('/api/superadmin/admins', superAdminAdminsRoutes);
app.use('/api/superadmin/customers', superAdminCustomersRoutes);
app.use('/api/superadmin/services', adminServiceRoutes);
app.use('/api/superadmin/branch-services', branchServiceRoutes);

// Center Admin routes (previously branch manager)
app.use('/api/center-admin', centerAdminRoutes);

// Legacy routes for backward compatibility
app.use('/api/branch', centerAdminRoutes);

app.use('/api/service-prices', servicePricesRoutes);
app.use('/api/service-items', serviceItemsRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/admin/services', adminServiceRoutes);
app.use('/api/admin/branches', branchServiceRoutes);
app.use('/api/barcode', barcodeRoutes);

// Public routes (no auth required - for QR code scanning)
app.use('/api/orders', publicRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'ROUTE_NOT_FOUND',
    message: `Route ${req.originalUrl} not found`
  });
});

// Global error handler
app.use(errorHandler);

module.exports = app;