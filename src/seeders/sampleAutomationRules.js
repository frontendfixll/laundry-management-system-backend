// Sample Automation Rules for Testing
// This file contains sample rules for both Platform and Tenant levels

const samplePlatformRules = [
  {
    ruleId: 'platform_subscription_expiry_warning',
    name: 'Subscription Expiry Warning',
    description: 'Notify tenant admin when subscription is expiring in 7 days',
    scope: 'PLATFORM',
    trigger: {
      eventType: 'SUBSCRIPTION_EXPIRING',
      conditions: {
        'daysUntilExpiry': { operator: 'less_than', value: 7 }
      }
    },
    actions: [
      {
        type: 'SEND_NOTIFICATION',
        config: {
          title: 'Subscription Expiring Soon',
          message: 'Your subscription expires in {{daysUntilExpiry}} days. Please renew to avoid service interruption.',
          notificationType: 'warning',
          priority: 'high',
          targetUsers: ['tenant_admin']
        }
      },
      {
        type: 'SEND_EMAIL',
        config: {
          subject: 'Subscription Renewal Required',
          template: 'subscription_expiry_warning',
          recipients: ['tenant_admin_email']
        }
      }
    ],
    priority: 1,
    isActive: true
  },

  {
    ruleId: 'platform_subscription_expired',
    name: 'Subscription Expired - Lock Features',
    description: 'Lock tenant features when subscription expires',
    scope: 'PLATFORM',
    trigger: {
      eventType: 'SUBSCRIPTION_EXPIRED',
      conditions: {}
    },
    actions: [
      {
        type: 'LOCK_FEATURE',
        config: {
          feature: 'order_creation',
          reason: 'Subscription expired'
        }
      },
      {
        type: 'LOCK_FEATURE',
        config: {
          feature: 'customer_management',
          reason: 'Subscription expired'
        }
      },
      {
        type: 'SEND_NOTIFICATION',
        config: {
          title: 'Subscription Expired',
          message: 'Your subscription has expired. Some features have been restricted. Please renew your subscription.',
          notificationType: 'error',
          priority: 'critical',
          targetUsers: ['tenant_admin']
        }
      }
    ],
    priority: 1,
    isActive: true
  },

  {
    ruleId: 'platform_tenant_exceeded_limits',
    name: 'Tenant Exceeded Plan Limits',
    description: 'Notify when tenant exceeds their plan limits',
    scope: 'PLATFORM',
    trigger: {
      eventType: 'TENANT_EXCEEDED_LIMITS',
      conditions: {
        'limitType': 'orders_per_month'
      }
    },
    actions: [
      {
        type: 'SEND_NOTIFICATION',
        config: {
          title: 'Plan Limit Exceeded',
          message: 'You have exceeded your monthly order limit. Consider upgrading your plan.',
          notificationType: 'warning',
          priority: 'high',
          targetUsers: ['tenant_admin']
        }
      },
      {
        type: 'CREATE_TASK',
        config: {
          title: 'Review tenant plan upgrade',
          assignee: 'sales_team',
          priority: 'high'
        }
      }
    ],
    priority: 2,
    isActive: true
  }
];

const sampleTenantRules = [
  {
    ruleId: 'tenant_order_placed_notification',
    name: 'New Order Notification',
    description: 'Notify staff when a new order is placed',
    scope: 'TENANT',
    trigger: {
      eventType: 'ORDER_PLACED',
      conditions: {}
    },
    actions: [
      {
        type: 'SEND_NOTIFICATION',
        config: {
          title: 'New Order Received',
          message: 'Order #{{orderNumber}} has been placed by {{customerName}}',
          notificationType: 'info',
          priority: 'normal',
          targetUsers: ['staff', 'admin']
        }
      }
    ],
    priority: 1,
    isActive: true
  },

  {
    ruleId: 'tenant_order_delayed_alert',
    name: 'Order Delay Alert',
    description: 'Alert customer and staff when order is delayed',
    scope: 'TENANT',
    trigger: {
      eventType: 'ORDER_DELAYED',
      conditions: {
        'delayMinutes': { operator: 'greater_than', value: 30 }
      }
    },
    actions: [
      {
        type: 'SEND_NOTIFICATION',
        config: {
          title: 'Order Delayed',
          message: 'Order #{{orderNumber}} is delayed by {{delayMinutes}} minutes',
          notificationType: 'warning',
          priority: 'high',
          targetUsers: ['customer', 'staff']
        }
      },
      {
        type: 'SEND_EMAIL',
        config: {
          subject: 'Order Delay Notification',
          template: 'order_delay',
          recipients: ['customer_email']
        },
        delay: 300000 // 5 minutes delay
      }
    ],
    priority: 1,
    isActive: true
  },

  {
    ruleId: 'tenant_payment_failed_reminder',
    name: 'Payment Failed Reminder',
    description: 'Remind customer about failed payment',
    scope: 'TENANT',
    trigger: {
      eventType: 'PAYMENT_FAILED',
      conditions: {}
    },
    actions: [
      {
        type: 'SEND_NOTIFICATION',
        config: {
          title: 'Payment Failed',
          message: 'Payment for order #{{orderNumber}} failed. Please update your payment method.',
          notificationType: 'error',
          priority: 'high',
          targetUsers: ['customer']
        }
      },
      {
        type: 'SEND_NOTIFICATION',
        config: {
          title: 'Payment Reminder',
          message: 'Please retry payment for order #{{orderNumber}}',
          notificationType: 'info',
          priority: 'normal',
          targetUsers: ['customer']
        },
        delay: 3600000 // 1 hour delay
      }
    ],
    priority: 2,
    isActive: true
  },

  {
    ruleId: 'tenant_customer_inactive_followup',
    name: 'Inactive Customer Follow-up',
    description: 'Follow up with customers who haven\'t placed orders recently',
    scope: 'TENANT',
    trigger: {
      eventType: 'USER_INACTIVE',
      conditions: {
        'daysSinceLastOrder': { operator: 'greater_than', value: 30 }
      }
    },
    actions: [
      {
        type: 'SEND_NOTIFICATION',
        config: {
          title: 'We Miss You!',
          message: 'It\'s been a while since your last order. Here\'s a special discount for you!',
          notificationType: 'info',
          priority: 'low',
          targetUsers: ['customer']
        }
      },
      {
        type: 'CREATE_TASK',
        config: {
          title: 'Follow up with inactive customer',
          assignee: 'customer_service',
          priority: 'low'
        }
      }
    ],
    priority: 3,
    isActive: true
  },

  {
    ruleId: 'tenant_order_completed_feedback',
    name: 'Order Completion Feedback Request',
    description: 'Request feedback when order is completed',
    scope: 'TENANT',
    trigger: {
      eventType: 'ORDER_COMPLETED',
      conditions: {}
    },
    actions: [
      {
        type: 'SEND_NOTIFICATION',
        config: {
          title: 'Order Completed',
          message: 'Your order #{{orderNumber}} has been completed. How was your experience?',
          notificationType: 'success',
          priority: 'low',
          targetUsers: ['customer']
        },
        delay: 1800000 // 30 minutes delay
      }
    ],
    priority: 3,
    isActive: true
  }
];

module.exports = {
  samplePlatformRules,
  sampleTenantRules
};