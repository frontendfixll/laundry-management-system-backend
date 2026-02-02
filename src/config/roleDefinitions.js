/**
 * LaundryLobby - Comprehensive Role Definitions
 * Based on droles.md specification
 */

// Platform-Level Role Definitions
const PLATFORM_ROLES = {
  SUPER_ADMIN: {
    name: 'Super Admin',
    slug: 'super-admin',
    description: 'Full platform access - highest privilege level',
    color: '#dc2626', // red
    isDefault: true,
    permissions: {
      platform_settings: 'rcude',
      tenant_crud: 'rcude',
      tenant_suspend: 'rcue', // no delete
      subscription_plans: 'rcude',
      payments_revenue: 'rcue', // no delete
      refunds: 'rcue', // no delete
      marketplace_control: 'rcude',
      platform_coupons: 'rcude',
      view_all_orders: 're', // read+export
      audit_logs: 're', // read+export
      leads: 'rcude',
      user_impersonation: '' // none
    }
  },

  PLATFORM_SUPPORT: {
    name: 'Platform Support',
    slug: 'platform-support',
    description: 'Support operations with limited tenant access',
    color: '#2563eb', // blue
    isDefault: true,
    permissions: {
      platform_settings: '',
      tenant_crud: 'r',
      tenant_suspend: 'r',
      subscription_plans: '',
      payments_revenue: '',
      refunds: '',
      marketplace_control: 'r',
      platform_coupons: '',
      view_all_orders: 'r',
      audit_logs: 'r',
      leads: 're',
      user_impersonation: 'r'
    }
  },

  PLATFORM_FINANCE: {
    name: 'Platform Finance Admin',
    slug: 'platform-finance-admin',
    description: 'Financial operations and revenue management',
    color: '#059669', // green
    isDefault: true,
    permissions: {
      platform_settings: '',
      tenant_crud: '',
      tenant_suspend: '',
      subscription_plans: 're',
      payments_revenue: 'rcue',
      refunds: 'rcue',
      marketplace_control: '',
      platform_coupons: '',
      view_all_orders: 're',
      audit_logs: 're',
      leads: 'r',
      user_impersonation: ''
    }
  },

  PLATFORM_AUDITOR: {
    name: 'Platform Auditor',
    slug: 'platform-auditor',
    description: 'Read-only access for compliance and auditing',
    color: '#7c3aed', // purple
    isDefault: true,
    permissions: {
      platform_settings: '',
      tenant_crud: '',
      tenant_suspend: '',
      subscription_plans: '',
      payments_revenue: 're',
      refunds: '',
      marketplace_control: '',
      platform_coupons: '',
      view_all_orders: 're',
      audit_logs: 're',
      leads: 'r',
      user_impersonation: ''
    }
  },

  PLATFORM_SALES: {
    name: 'Platform Sales',
    slug: 'platform-sales',
    description: 'Sales and lead management',
    color: '#ec4899',
    isDefault: true,
    permissions: {
      // Only permissions actually used in sales dashboard
      leads: 'rcude',              // Full access to leads
      subscription_plans: 're',    // Read + Export subscriptions
      payments_revenue: 'r'        // Read-only payments
    }
  },

  PLATFORM_SALES_JUNIOR: {
    name: 'Platform Sales Junior',
    slug: 'platform-sales-junior',
    description: 'Junior sales role with basic permissions',
    color: '#f97316', // orange
    isDefault: true,
    permissions: {
      leads: 'rcude',              // Full access to leads
      subscription_plans: 're'     // Read + Export subscriptions only
    }
  },

  PLATFORM_SALES_SENIOR: {
    name: 'Platform Sales Senior',
    slug: 'platform-sales-senior',
    description: 'Senior sales role with advanced permissions',
    color: '#8b5cf6', // violet
    isDefault: true,
    permissions: {
      leads: 'rcude',              // Full access to leads
      subscription_plans: 're',    // Read + Export subscriptions
      payments_revenue: 'r',       // Read-only payments
      audit_logs: 're',           // Read + Export audit logs
      tenant_crud: 'r'            // Read-only tenant management
    }
  }
};

// Tenant-Level Role Definitions
const TENANT_ROLES = {
  TENANT_OWNER: {
    name: 'Tenant Owner',
    slug: 'tenant_owner',
    description: 'Primary admin with full tenant access',
    color: '#dc2626', // red
    isDefault: true,
    permissions: {
      // Business Profile
      business_profile: { view: true, create: true, update: true, delete: false, export: true },

      // Services & Pricing
      services: { view: true, create: true, update: true, delete: true, export: true }, // Map to 'services' in User model

      // Orders
      orders: { view: true, create: true, update: true, delete: true, export: true, assign: true, process: true }, // Standardized

      // Staff Management
      staff: { view: true, create: true, update: true, delete: true, export: true, assignShift: true, manageAttendance: true },

      // Customer Management
      customers: { view: true, create: true, update: true, delete: true },

      // Coupons & Marketing
      coupons: { view: true, create: true, update: true, delete: true },
      campaigns: { view: true, create: true, update: true, delete: true },
      banners: { view: true, create: true, update: true, delete: true },

      // Loyalty & Referrals
      loyalty: { view: true, create: true, update: true, delete: true },
      referrals: { view: true, create: true, update: true, delete: true },
      wallet: { view: true, create: true, update: true, delete: true },

      // Logistics
      logistics: { view: true, create: true, update: true, delete: true, assign: true, track: true },

      // Inventory
      inventory: { view: true, create: true, update: true, delete: true, restock: true, writeOff: true },

      // Support & Tickets
      tickets: { view: true, create: true, update: true, delete: true, assign: true, resolve: true, escalate: true },
      support: { view: true, create: true, update: true, delete: true, assign: true, manage: true },

      // Payments & Earnings
      payments_earnings: { view: true, create: false, update: false, delete: false, export: true },
      refund_requests: { view: true, create: true, update: true, delete: false, export: true },

      // Reports & Analytics
      analytics: { view: true },

      // Branding
      branding: { view: true, create: true, update: true, delete: true },

      // Tenant Settings
      settings: { view: true, create: true, update: true, delete: true }
    }
  },

  TENANT_ADMIN: {
    name: 'Tenant Admin',
    slug: 'tenant_admin',
    description: 'Manager with limited operational access',
    color: '#2563eb', // blue
    isDefault: true,
    permissions: {
      // Business Profile (Limited)
      business_profile: { view: true, create: false, update: true, delete: false, export: false },

      // Services & Pricing (Limited)
      services: { view: true, create: false, update: true, delete: false },

      // Orders
      orders: { view: true, create: true, update: true, delete: false, assign: true, process: true },

      // Staff Management (Limited)
      staff: { view: true, create: false, update: true, delete: false, assignShift: true, manageAttendance: true },

      // Customer Management (Limited)
      customers: { view: true, create: false, update: true, delete: false },

      // Tenant Coupons (Limited)
      coupons: { view: true, create: false, update: true, delete: false },

      // Payments & Earnings
      payments_earnings: { view: false, create: false, update: false, delete: false, export: false },
      refund_requests: { view: false, create: false, update: false, delete: false, export: false },

      // Reports & Analytics (Limited)
      analytics: { view: true },

      // Tenant Settings
      tenant_settings: { view: false, create: false, update: false, delete: false, export: false }
    }
  },

  TENANT_OPS_MANAGER: {
    name: 'Operations Manager',
    slug: 'tenant_ops_manager',
    description: 'Order flow and operations focused role',
    color: '#059669', // green
    isDefault: true,
    permissions: {
      // Business Profile
      business_profile: { view: false, create: false, update: false, delete: false, export: false },

      // Services & Pricing (Limited)
      services: { view: true, create: false, update: true, delete: false },

      // Orders (Full operational access)
      orders: { view: true, create: true, update: true, delete: false, assign: true, process: true },

      // Staff Management (Assignment only)
      staff: { view: true, create: false, update: true, delete: false, assignShift: true },

      // Customer Management (Limited)
      customers: { view: true, create: false, update: true, delete: false },

      // Tenant Coupons
      tenant_coupons: { view: false, create: false, update: false, delete: false, export: false },

      // Payments & Earnings
      payments_earnings: { view: false, create: false, update: false, delete: false, export: false },
      refund_requests: { view: false, create: false, update: false, delete: false, export: false },

      // Reports & Analytics (Limited)
      analytics: { view: true },

      // Tenant Settings
      tenant_settings: { view: false, create: false, update: false, delete: false, export: false }
    }
  },

  TENANT_FINANCE_MANAGER: {
    name: 'Finance Manager',
    slug: 'tenant_finance_manager',
    description: 'Financial operations and reporting focused role',
    color: '#7c3aed', // purple
    isDefault: true,
    permissions: {
      // Business Profile
      business_profile: { view: false, create: false, update: false, delete: false, export: false },

      // Services & Pricing
      services_pricing: { view: false, create: false, update: false, delete: false, export: false },

      // Orders (Limited view)
      orders: { view: true, create: false, update: false, delete: false },

      // Staff Management
      assign_staff: { view: false, create: false, update: false, delete: false, export: false },
      staff_management: { view: false, create: false, update: false, delete: false, export: false },

      // Customer Management
      customer_management: { view: false, create: false, update: false, delete: false, export: false },

      // Tenant Coupons
      tenant_coupons: { view: false, create: false, update: false, delete: false, export: false },

      // Payments & Earnings (Full access)
      payments_earnings: { view: true, create: false, update: false, delete: false, export: true },
      refund_requests: { view: true, create: true, update: true, delete: false, export: true },

      // Reports & Analytics (Full access)
      analytics: { view: true },

      // Tenant Settings
      tenant_settings: { view: false, create: false, update: false, delete: false, export: false }
    }
  },

  TENANT_STAFF: {
    name: 'Staff',
    slug: 'tenant_staff',
    description: 'Basic staff with limited operational access',
    color: '#6b7280', // gray
    isDefault: true,
    permissions: {
      // Business Profile
      business_profile: { view: false, create: false, update: false, delete: false, export: false },

      // Services & Pricing
      services_pricing: { view: false, create: false, update: false, delete: false, export: false },

      // Orders (Limited)
      orders_view: { view: true, create: false, update: false, delete: false, export: false },
      orders_update_status: { view: false, create: false, update: true, delete: false, export: false },

      // Staff Management
      assign_staff: { view: false, create: false, update: false, delete: false, export: false },
      staff_management: { view: false, create: false, update: false, delete: false, export: false },

      // Customer Management
      customer_management: { view: false, create: false, update: false, delete: false, export: false },

      // Tenant Coupons
      tenant_coupons: { view: false, create: false, update: false, delete: false, export: false },

      // Payments & Earnings
      payments_earnings: { view: false, create: false, update: false, delete: false, export: false },
      refund_requests: { view: false, create: false, update: false, delete: false, export: false },

      // Reports & Analytics
      reports_analytics: { view: false, create: false, update: false, delete: false, export: false },

      // Tenant Settings
      tenant_settings: { view: false, create: false, update: false, delete: false, export: false }
    }
  }
};

// Customer & Guest Permissions
const CUSTOMER_PERMISSIONS = {
  GUEST: {
    name: 'Guest User',
    slug: 'guest',
    description: 'Anonymous user with browse-only access',
    permissions: {
      browse_marketplace: { view: true, create: false, update: false, delete: false, export: false },
      view_laundry_store: { view: true, create: false, update: false, delete: false, export: false },
      place_order: { view: false, create: false, update: false, delete: false, export: false },
      apply_coupon: { view: false, create: false, update: false, delete: false, export: false },
      payments: { view: false, create: false, update: false, delete: false, export: false },
      order_tracking: { view: false, create: false, update: false, delete: false, export: false },
      cancel_order: { view: false, create: false, update: false, delete: false, export: false },
      reviews: { view: false, create: false, update: false, delete: false, export: false },
      profile_addresses: { view: false, create: false, update: false, delete: false, export: false }
    }
  },

  CUSTOMER: {
    name: 'Customer',
    slug: 'customer',
    description: 'Registered customer with full ordering access',
    permissions: {
      browse_marketplace: { view: true, create: false, update: false, delete: false, export: false },
      view_laundry_store: { view: true, create: false, update: false, delete: false, export: false },
      place_order: { view: true, create: true, update: false, delete: false, export: false },
      apply_coupon: { view: true, create: true, update: false, delete: false, export: false },
      payments: { view: true, create: true, update: false, delete: false, export: false },
      order_tracking: { view: true, create: false, update: false, delete: false, export: false },
      cancel_order: { view: true, create: true, update: false, delete: false, export: false }, // Limited
      reviews: { view: true, create: true, update: true, delete: false, export: false }, // Limited
      profile_addresses: { view: true, create: true, update: true, delete: true, export: false }
    }
  }
};

// Security Rules
const SECURITY_RULES = {
  // Rule 1: No Shared Admin Powers
  ROLE_SEPARATION: {
    'super_admin': ['platform_support', 'platform_finance'],
    'tenant_owner': ['tenant_finance_manager', 'tenant_ops_manager']
  },

  // Rule 2: Financial Separation
  FINANCE_ONLY_ACTIONS: [
    'payments_earnings',
    'refund_requests',
    'view_bank_data',
    'process_payouts'
  ],

  // Rule 3: Lockdown
  ADMIN_ONLY_ACCESS: ['super_admin', 'tenant_owner'],

  // Rule 4: Read vs Write Separation
  READ_ONLY_ROLES: ['platform_auditor'],

  // Impersonation Rules
  IMPERSONATION_RULES: {
    allowed_roles: ['platform_support'],
    restrictions: {
      read_only: true,
      time_limited: true, // 30 minutes max
      logged: true,
      tenant_notified: true
    }
  }
};

module.exports = {
  PLATFORM_ROLES,
  TENANT_ROLES,
  CUSTOMER_PERMISSIONS,
  SECURITY_RULES
};