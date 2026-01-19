// User Roles
const USER_ROLES = {
  SUPERADMIN: 'superadmin',      // Platform owner (separate model)
  SALES_ADMIN: 'sales_admin',    // Sales department (separate model)
  ADMIN: 'admin',                // Tenancy admin - manages entire tenancy
  BRANCH_ADMIN: 'branch_admin',  // Branch admin - manages single branch only
  STAFF: 'staff',                // Workers (washer, ironer, etc.)
  CUSTOMER: 'customer'           // End users
};

// Legacy role mappings for backward compatibility
const LEGACY_ROLE_MAP = {
  'center_admin': 'admin',
  'branch_manager': 'branch_admin'
};

// Order Status
const ORDER_STATUS = {
  PLACED: 'placed',
  ASSIGNED_TO_BRANCH: 'assigned_to_branch',
  ASSIGNED_TO_LOGISTICS_PICKUP: 'assigned_to_logistics_pickup',
  PICKED: 'picked',
  IN_PROCESS: 'in_process',
  READY: 'ready',
  ASSIGNED_TO_LOGISTICS_DELIVERY: 'assigned_to_logistics_delivery',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled'
};

// Services
const SERVICES = {
  WASH_FOLD: 'wash_fold',
  WASH_IRON: 'wash_iron',
  PREMIUM_LAUNDRY: 'premium_laundry',
  DRY_CLEAN: 'dry_clean',
  STEAM_PRESS: 'steam_press',
  STARCHING: 'starching',
  PREMIUM_STEAM_PRESS: 'premium_steam_press',
  PREMIUM_DRY_CLEAN: 'premium_dry_clean',
  // Legacy services (for backward compatibility)
  WASHING: 'washing',
  DRY_CLEANING: 'dry_cleaning',
  IRONING: 'ironing'
};

// Clothing Categories
const CLOTHING_CATEGORIES = {
  NORMAL: 'normal',
  DELICATE: 'delicate',
  WOOLEN: 'woolen'
};

// Item Types
const ITEM_TYPES = {
  // Men's
  SHIRT: 'shirt',
  T_SHIRT: 't_shirt',
  TROUSER: 'trouser',
  JEANS: 'jeans',
  SUIT_2PC: 'suit_2pc',
  SUIT_3PC: 'suit_3pc',
  BLAZER: 'blazer',
  JACKET: 'jacket',
  KURTA: 'kurta',
  SHERWANI: 'sherwani',
  COAT: 'coat',
  OVERCOAT: 'overcoat',
  JACKET_HALF: 'jacket_half',
  
  // Women's
  BLOUSE: 'blouse',
  TOP: 'top',
  KURTI: 'kurti',
  SAREE: 'saree',
  SAREE_SILK: 'saree_silk',
  SAREE_COTTON: 'saree_cotton',
  SAREE_DESIGNER: 'saree_designer',
  SALWAR_SUIT: 'salwar_suit',
  LEHENGA: 'lehenga',
  GOWN: 'gown',
  DRESS: 'dress',
  SKIRT: 'skirt',
  DUPATTA: 'dupatta',
  
  // Kids
  KIDS_SHIRT: 'kids_shirt',
  KIDS_T_SHIRT: 'kids_t_shirt',
  KIDS_TROUSER: 'kids_trouser',
  KIDS_JEANS: 'kids_jeans',
  FROCK: 'frock',
  SCHOOL_UNIFORM: 'school_uniform',
  KIDS_DRESS: 'kids_dress',
  KIDS_PANT: 'kids_pant',
  
  // Household
  BEDSHEET_SINGLE: 'bedsheet_single',
  BEDSHEET_DOUBLE: 'bedsheet_double',
  BLANKET: 'blanket',
  BLANKET_SINGLE: 'blanket_single',
  BLANKET_DOUBLE: 'blanket_double',
  CURTAIN: 'curtain',
  CURTAIN_SMALL: 'curtain_small',
  CURTAIN_LARGE: 'curtain_large',
  PILLOW_COVER: 'pillow_cover',
  SOFA_COVER: 'sofa_cover',
  TABLE_CLOTH: 'table_cloth',
  TOWEL: 'towel',
  COMFORTER: 'comforter',
  BEDSHEET: 'bedsheet',
  CURTAINS: 'curtains',
  
  // Institutional
  HOTEL_BEDSHEET: 'hotel_bedsheet',
  HOTEL_TOWEL: 'hotel_towel',
  RESTAURANT_NAPKIN: 'restaurant_napkin',
  UNIFORM: 'uniform',
  APRON: 'apron',
  
  // Others
  TIE: 'tie',
  SCARF: 'scarf',
  CAP_HAT: 'cap_hat',
  BAG_FABRIC: 'bag_fabric',
  BAG_SMALL: 'bag_small',
  BAG_LARGE: 'bag_large',
  SOFT_TOY: 'soft_toy',
  SHOES: 'shoes',
  LEATHER_JACKET: 'leather_jacket',
  WOOLEN_SWEATER: 'woolen_sweater',
  
  // Premium items from frontend
  SILK_SHIRT: 'silk_shirt',
  SILK_SAREE: 'silk_saree',
  CASHMERE: 'cashmere',
  LINEN_SHIRT: 'linen_shirt',
  DESIGNER_DRESS: 'designer_dress',
  DESIGNER_SUIT: 'designer_suit',
  BRIDAL_LEHENGA: 'bridal_lehenga',
  DESIGNER_SAREE: 'designer_saree',
  LUXURY_COAT: 'luxury_coat',
  EVENING_GOWN: 'evening_gown',
  
  // Steam press items
  SHIRT_PRESS: 'shirt_press',
  TROUSERS_PRESS: 'trousers_press',
  SAREE_PRESS: 'saree_press',
  SUIT_PRESS: 'suit_press',
  DRESS_PRESS: 'dress_press',
  KURTI_PRESS: 'kurti_press',
  SILK_SAREE_PRESS: 'silk_saree_press',
  DESIGNER_SUIT_PRESS: 'designer_suit_press',
  LEHENGA_PRESS: 'lehenga_press',
  SHERWANI_PRESS: 'sherwani_press',
  WEDDING_DRESS_PRESS: 'wedding_dress_press',
  
  // Starching items
  COTTON_SHIRT_STARCH: 'cotton_shirt_starch',
  COTTON_SAREE_STARCH: 'cotton_saree_starch',
  DHOTI_STARCH: 'dhoti_starch',
  KURTA_STARCH: 'kurta_starch',
  BEDSHEET_STARCH: 'bedsheet_starch',
  
  // Legacy (backward compatibility)
  MENS_SHIRT: 'mens_shirt',
  MENS_PANT: 'mens_pant',
  MENS_TSHIRT: 'mens_tshirt',
  MENS_JEANS: 'mens_jeans',
  MENS_SUIT: 'mens_suit',
  WOMENS_DRESS: 'womens_dress',
  WOMENS_BLOUSE: 'womens_blouse',
  WOMENS_SAREE: 'womens_saree',
  WOMENS_KURTI: 'womens_kurti',
  WOMENS_JEANS: 'womens_jeans',
  WOMENS_SHIRT: 'womens_shirt',
  TROUSERS: 'trousers',
  FORMAL_SHIRT: 'formal_shirt',
  SUIT_2PIECE: 'suit_2piece',
  DRESS_GOWN: 'dress_gown',
  TSHIRT: 'tshirt',
  LEATHER_SHOES: 'leather_shoes',
  SPORTS_SHOES: 'sports_shoes',
  FORMAL_SHOES: 'formal_shoes',
  BOOTS: 'boots',
  SANDALS: 'sandals',
  SHIRT_EXPRESS: 'shirt_express',
  SUIT_EXPRESS: 'suit_express',
  JEANS_EXPRESS: 'jeans_express',
  SAREE_EXPRESS: 'saree_express',
  DRESS_EXPRESS: 'dress_express'
};

// Ticket Status
const TICKET_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
  ESCALATED: 'escalated'
};

// Ticket Priority
const TICKET_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Ticket Categories
const TICKET_CATEGORIES = {
  QUALITY: 'quality',
  DELAY: 'delay',
  MISSING_ITEM: 'missing_item',
  DAMAGED: 'damaged',
  PAYMENT: 'payment',
  OTHER: 'other'
};

// Refund Status
const REFUND_STATUS = {
  REQUESTED: 'requested',
  APPROVED: 'approved',
  PROCESSED: 'processed',
  COMPLETED: 'completed',
  REJECTED: 'rejected'
};

// Refund Types
const REFUND_TYPES = {
  FULL: 'full',
  PARTIAL: 'partial',
  STORE_CREDIT: 'store_credit'
};

// Payment Methods
const PAYMENT_METHODS = {
  ONLINE: 'online',
  COD: 'cod'
};

// Staff Roles
const STAFF_ROLES = {
  WASHER: 'washer',
  IRONER: 'ironer'
};

// Worker Specializations (for staff members)
const WORKER_TYPES = {
  WASHER: 'washer',
  DRY_CLEANER: 'dry_cleaner',
  IRONER: 'ironer',
  PACKER: 'packer',
  QUALITY_CHECKER: 'quality_checker',
  GENERAL: 'general'
};

// Inventory Items
const INVENTORY_ITEMS = {
  DETERGENT: 'detergent',
  SOFTENER: 'softener',
  HANGERS: 'hangers',
  PACKAGING: 'packaging',
  CHEMICALS: 'chemicals'
};

// Notification Types
const NOTIFICATION_TYPES = {
  // Order notifications (Customer + Admin)
  ORDER_PLACED: 'order_placed',
  ORDER_ASSIGNED: 'order_assigned',
  ORDER_PICKED: 'order_picked',
  ORDER_IN_PROCESS: 'order_in_process',
  ORDER_READY: 'order_ready',
  ORDER_OUT_FOR_DELIVERY: 'order_out_for_delivery',
  ORDER_DELIVERED: 'order_delivered',
  ORDER_CANCELLED: 'order_cancelled',
  
  // Inventory (Admin + Branch Admin)
  LOW_INVENTORY: 'low_inventory',
  INVENTORY_RESTOCKED: 'inventory_restocked',
  
  // Support (Admin + Branch Admin)
  NEW_COMPLAINT: 'new_complaint',
  TICKET_ASSIGNED: 'ticket_assigned',
  TICKET_RESOLVED: 'ticket_resolved',
  
  // Payment (Admin + SuperAdmin)
  REFUND_REQUEST: 'refund_request',
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_FAILED: 'payment_failed',
  
  // Rewards (Customer)
  REWARD_POINTS: 'reward_points',
  MILESTONE_ACHIEVED: 'milestone_achieved',
  VIP_UPGRADE: 'vip_upgrade',
  
  // Leads (SuperAdmin)
  NEW_LEAD: 'new_lead',
  LEAD_CONVERTED: 'lead_converted',
  
  // Tenancy (SuperAdmin)
  NEW_TENANCY_SIGNUP: 'new_tenancy_signup',
  TENANCY_SUBSCRIPTION_EXPIRING: 'tenancy_subscription_expiring',
  TENANCY_SUBSCRIPTION_EXPIRED: 'tenancy_subscription_expired',
  TENANCY_PAYMENT_RECEIVED: 'tenancy_payment_received',
  
  // Staff (Admin + Branch Admin)
  NEW_STAFF_ADDED: 'new_staff_added',
  STAFF_REMOVED: 'staff_removed',
  
  // Branch (Admin)
  NEW_BRANCH_CREATED: 'new_branch_created',
  BRANCH_ADMIN_ASSIGNED: 'branch_admin_assigned',
  
  // System (All)
  SYSTEM_ALERT: 'system_alert',
  ANNOUNCEMENT: 'announcement',
  
  // Campaign/Promo (Customer)
  NEW_CAMPAIGN: 'new_campaign',
  COUPON_EXPIRING: 'coupon_expiring',
  WALLET_CREDITED: 'wallet_credited',
  
  // Permission & Role Management (Admin)
  PERMISSION_GRANTED: 'permission_granted',
  PERMISSION_REVOKED: 'permission_revoked',
  ROLE_UPDATED: 'role_updated',
  ADMIN_CREATED: 'admin_created',
  TENANCY_SETTINGS_UPDATED: 'tenancy_settings_updated',
  
  // Inventory Management (Admin + SuperAdmin)
  INVENTORY_REQUEST_SUBMITTED: 'inventory_request_submitted',
  INVENTORY_REQUEST_APPROVED: 'inventory_request_approved',
  INVENTORY_REQUEST_REJECTED: 'inventory_request_rejected',
  INVENTORY_REQUEST_COMPLETED: 'inventory_request_completed',
  
  // Billing & Subscription (Admin)
  SUBSCRIPTION_EXPIRING: 'subscription_expiring',
  SUBSCRIPTION_EXPIRED: 'subscription_expired',
  PAYMENT_FAILED: 'payment_failed',
  PLAN_UPGRADED: 'plan_upgraded',
  PLAN_DOWNGRADED: 'plan_downgraded',
  USAGE_LIMIT_REACHED: 'usage_limit_reached',
  INVOICE_GENERATED: 'invoice_generated',
  
  // System & Security (All Users)
  SECURITY_ALERT: 'security_alert',
  PASSWORD_CHANGED: 'password_changed',
  ACCOUNT_LOCKED: 'account_locked',
  MULTIPLE_LOGIN_ATTEMPTS: 'multiple_login_attempts',
  PERMISSION_SYNC_FAILED: 'permission_sync_failed'
};

// Recipient types for notifications
const RECIPIENT_TYPES = {
  CUSTOMER: 'customer',
  ADMIN: 'admin',
  BRANCH_ADMIN: 'branch_admin',
  SUPERADMIN: 'superadmin',
  STAFF: 'staff'
};

// Consumption Rates (per service)
const CONSUMPTION_RATES = {
  [SERVICES.WASHING]: {
    [INVENTORY_ITEMS.DETERGENT]: 50 // ml per kg
  },
  [SERVICES.DRY_CLEANING]: {
    [INVENTORY_ITEMS.CHEMICALS]: 100 // ml per item
  },
  [SERVICES.IRONING]: {} // No consumption
};

// Refund Limits (in rupees) - Admin has full refund authority
const REFUND_LIMITS = {
  [USER_ROLES.ADMIN]: Infinity  // Admin can approve any refund amount
};

// OpenRouteService API Configuration
const OPENROUTE_CONFIG = {
  BASE_URL: 'https://api.openrouteservice.org',
  ENDPOINTS: {
    DIRECTIONS: '/v2/directions/driving-car',
    GEOCODE: '/geocode/search'
  },
  MAX_RETRIES: 3,
  TIMEOUT: 10000, // 10 seconds
  DAILY_LIMIT: 2000 // Free tier limit
};

// Delivery Pricing Defaults
const DELIVERY_PRICING_DEFAULTS = {
  BASE_DISTANCE: 3,        // km - free delivery zone
  PER_KM_RATE: 5,          // ₹ per km after base
  MAX_DISTANCE: 20,        // km - max serviceable
  MINIMUM_CHARGE: 0,       // minimum delivery fee
  EXPRESS_MULTIPLIER: 1.5, // multiplier for express orders
  FALLBACK_FLAT_RATE: 50   // ₹ flat rate when API fails
};

module.exports = {
  USER_ROLES,
  LEGACY_ROLE_MAP,
  ORDER_STATUS,
  SERVICES,
  CLOTHING_CATEGORIES,
  ITEM_TYPES,
  TICKET_STATUS,
  TICKET_PRIORITY,
  TICKET_CATEGORIES,
  REFUND_STATUS,
  REFUND_TYPES,
  PAYMENT_METHODS,
  STAFF_ROLES,
  WORKER_TYPES,
  INVENTORY_ITEMS,
  NOTIFICATION_TYPES,
  RECIPIENT_TYPES,
  CONSUMPTION_RATES,
  REFUND_LIMITS,
  OPENROUTE_CONFIG,
  DELIVERY_PRICING_DEFAULTS
};