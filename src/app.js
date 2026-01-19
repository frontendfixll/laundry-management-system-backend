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
const superAdminRBACRoutes = require('./routes/superAdmin/rbacRoutes');
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
const superAdminTenancyRoutes = require('./routes/superAdminTenancies');
const superAdminInvitationRoutes = require('./routes/superAdminInvitations');
const superAdminBillingRoutes = require('./routes/superAdminBilling');
const superAdminTenancyAnalyticsRoutes = require('./routes/superAdminTenancyAnalytics');
const superAdminPromotionalRoutes = require('./routes/superAdminPromotional');
const superAdminCampaignRoutes = require('./routes/superAdminCampaigns');
const superAdminInventoryRequestRoutes = require('./routes/superAdmin/inventoryRequestRoutes');
const adminCampaignRoutes = require('./routes/adminCampaigns');

// Sales routes
const salesAuthRoutes = require('./routes/salesAuthRoutes');
const salesLeadRoutes = require('./routes/salesLeadRoutes');
const salesSubscriptionRoutes = require('./routes/salesSubscriptionRoutes');
const salesPaymentRoutes = require('./routes/salesPaymentRoutes');
const salesAnalyticsRoutes = require('./routes/salesAnalyticsRoutes');
const superAdminSalesRoutes = require('./routes/superAdminSalesRoutes');
const upgradeRoutes = require('./routes/upgradeRoutes');

// Test routes (development only)
const testNotificationRoutes = require('./routes/testNotificationRoutes');
const permissionSyncRoutes = require('./routes/permissionSyncRoutes');

// Banner routes
const adminBannerRoutes = require('./routes/admin/bannerRoutes');
const superAdminBannerRoutes = require('./routes/superAdmin/bannerRoutes');
const customerBannerRoutes = require('./routes/customer/bannerRoutes');

// Branch Admin routes
const branchAdminRoutes = require('./routes/admin/branchAdminRoutes');

const servicePricesRoutes = require('./routes/servicePrices');
const serviceItemsRoutes = require('./routes/serviceItems');
const deliveryRoutes = require('./routes/delivery');
const adminServiceRoutes = require('./routes/admin/serviceRoutes');
const branchServiceRoutes = require('./routes/admin/branchServiceRoutes');
const barcodeRoutes = require('./routes/barcode');
const publicRoutes = require('./routes/publicRoutes');
const tenancyPublicRoutes = require('./routes/tenancyPublicRoutes');
const invitationPublicRoutes = require('./routes/invitationPublicRoutes');
const leadPublicRoutes = require('./routes/leadPublicRoutes');
const leadSuperadminRoutes = require('./routes/leadSuperadminRoutes');

// Subdomain routing middleware
const { subdomainRouter } = require('./middlewares/subdomainMiddleware');

const app = express();

// Trust proxy for Render/production (needed for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware - Configure helmet to allow images
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration with credentials support for cookies
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004', // Marketing frontend
  'http://localhost:3005', // Sales frontend
  'http://localhost:3006', // Marketing frontend (alternative port)
  'http://localhost:3007', // Marketing frontend (alternative port 2)
  process.env.FRONTEND_URL,
  process.env.SUPERADMIN_URL,
  process.env.MARKETING_URL,
  process.env.SALES_FRONTEND_URL,
  // Allow all Vercel preview deployments
  /^https:\/\/.*\.vercel\.app$/,
  // Allow all subdomains of your domain
  /^https:\/\/[\w-]+\.laundry$/,
  /^http:\/\/[\w-]+\.laundry$/,
  // Allow laundrypro.com and laundrylobby.com domains with all subdomains
  /^https:\/\/[\w-]+\.laundrypro\.com$/,
  /^https:\/\/[\w-]+\.laundrylobby\.com$/,
  // Explicitly allow main domains
  'https://laundrypro.com',
  'https://laundrylobby.com',
  'https://laundrylobby.vercel.app',
  // Allow specific tenant subdomains (for testing)
  'https://tenacy.laundrylobby.com',
  'https://quickwash.laundrylobby.com',
  'https://cleanpro.laundrylobby.com'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    console.log('🌐 CORS check for origin:', origin);
    
    // Check if origin matches allowed patterns
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        const match = allowed === origin;
        if (match) console.log('✅ CORS allowed (string match):', origin);
        return match;
      }
      if (allowed instanceof RegExp) {
        const match = allowed.test(origin);
        if (match) console.log('✅ CORS allowed (regex match):', origin, 'pattern:', allowed);
        return match;
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('❌ CORS blocked origin:', origin);
      console.log('📋 Allowed origins:', allowedOrigins.filter(o => typeof o === 'string'));
      callback(null, false);
    }
  },
  credentials: true  // Allow cookies to be sent
}));

// Cookie parser middleware
app.use(cookieParser());

// Stripe webhook route (must be before JSON parsing)
app.use('/api/sales/upgrades/stripe-webhook', express.raw({ type: 'application/json' }));

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

// Serve static files (for uploaded images)
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
}, express.static('public/uploads'));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Subdomain routing - extract tenancy from subdomain
app.use(subdomainRouter);

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

// Version endpoint
app.get('/version', (req, res) => {
  res.status(200).json({
    version: process.env.APP_VERSION || 'unknown',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/version', (req, res) => {
  res.status(200).json({
    version: process.env.APP_VERSION || 'unknown',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/admin', adminRoutes);

// Tenant verification routes (public, needed for middleware)
const tenantVerificationRoutes = require('./routes/tenantVerification');
app.use('/api/tenants', tenantVerificationRoutes);

// SuperAdmin routes
app.use('/api/superadmin/auth', superAdminAuthRoutes);
app.use('/api/superadmin/dashboard', superAdminDashboardRoutes);
app.use('/api/superadmin/branches', superAdminBranchRoutes);
app.use('/api/superadmin/roles', superAdminRoleRoutes);
app.use('/api/superadmin/rbac', superAdminRBACRoutes);
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
app.use('/api/superadmin/tenancies', superAdminTenancyRoutes);
app.use('/api/superadmin/invitations', superAdminInvitationRoutes);
app.use('/api/superadmin/billing', superAdminBillingRoutes);
app.use('/api/superadmin/tenancy-analytics', superAdminTenancyAnalyticsRoutes);
app.use('/api/superadmin/promotional', superAdminPromotionalRoutes);
app.use('/api/superadmin/campaigns', superAdminCampaignRoutes);
app.use('/api/superadmin/inventory-requests', superAdminInventoryRequestRoutes);
app.use('/api/superadmin/leads', leadSuperadminRoutes);
app.use('/api/admin/campaigns', adminCampaignRoutes);
app.use('/api/admin/banners', adminBannerRoutes);
app.use('/api/admin/branch-admins', branchAdminRoutes);
app.use('/api/superadmin/banners', superAdminBannerRoutes);
app.use('/api/customer/banners', customerBannerRoutes);
app.use('/api/superadmin/services', adminServiceRoutes);
app.use('/api/superadmin/branch-services', branchServiceRoutes);
app.use('/api/superadmin/sales-users', superAdminSalesRoutes);

// Sales routes
app.use('/api/sales/auth', salesAuthRoutes);
app.use('/api/sales/leads', salesLeadRoutes);
app.use('/api/sales/subscriptions', salesSubscriptionRoutes);
app.use('/api/sales/payments', salesPaymentRoutes);
app.use('/api/sales/analytics', salesAnalyticsRoutes);
app.use('/api/sales/upgrades', upgradeRoutes);

// Test routes (development only)
if (process.env.NODE_ENV !== 'production') {
  app.use('/api', testNotificationRoutes);
}

// Permission sync routes
app.use('/api/permissions', permissionSyncRoutes);

// Center Admin routes (previously branch manager)
app.use('/api/center-admin', centerAdminRoutes);

// Branch Admin Review routes
const branchAdminReviewRoutes = require('./routes/centerAdmin/reviews');
app.use('/api/branch-admin/reviews', branchAdminReviewRoutes);

// Legacy routes for backward compatibility
app.use('/api/branch', centerAdminRoutes);

app.use('/api/service-prices', servicePricesRoutes);
app.use('/api/service-items', serviceItemsRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/admin/services', adminServiceRoutes);
app.use('/api/admin/branches', branchServiceRoutes);
app.use('/api/branches', branchServiceRoutes); // Public access for customer endpoints
app.use('/api/barcode', barcodeRoutes);

// Public routes (no auth required - for QR code scanning)
app.use('/api/orders', publicRoutes);

// Tenancy public routes (no auth required - for branding/theming)
app.use('/api/public/tenancy', tenancyPublicRoutes);

// Invitation public routes (no auth required - for accepting invitations)
app.use('/api/invitations', invitationPublicRoutes);

// Lead public routes (no auth required - for marketing site lead capture)
app.use('/api/public/leads', leadPublicRoutes);

// Customer upgrade routes (no auth required - for customer self-service)
// const customerUpgradeRoutes = require('./routes/customerUpgradeRoutes');
// app.use('/api/public', customerUpgradeRoutes);

// Billing public routes (no auth required - for pricing page)
const billingPublicRoutes = require('./routes/billingPublicRoutes');
app.use('/api/public/billing', billingPublicRoutes);

// Payment link routes
const paymentLinkSuperadminRoutes = require('./routes/paymentLinkSuperadminRoutes');
const paymentLinkPublicRoutes = require('./routes/paymentLinkPublicRoutes');
app.use('/api/superadmin/payment-links', paymentLinkSuperadminRoutes);
app.use('/api/public/pay', paymentLinkPublicRoutes);

// Feature definition routes
const featureRoutes = require('./routes/featureRoutes');
app.use('/api/superadmin/features', featureRoutes);

// Public features route (for pricing page)
const featureController = require('./controllers/featureController');
app.get('/api/public/features', featureController.getPublicFeatures);

// Self-service signup routes
const signupPublicRoutes = require('./routes/signupPublicRoutes');
app.use('/api/public/signup', signupPublicRoutes);

// Cron routes (for external cron services like Vercel Cron)
const cronRoutes = require('./routes/cronRoutes');
app.use('/api/cron', cronRoutes);

// Notification routes (with SSE for real-time)
const notificationRoutes = require('./routes/notificationRoutes');
const superAdminNotificationRoutes = require('./routes/superAdminNotificationRoutes');
app.use('/api/notifications', notificationRoutes);
app.use('/api/superadmin/notifications', superAdminNotificationRoutes);

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