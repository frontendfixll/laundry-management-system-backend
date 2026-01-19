const Notification = require('../models/Notification');
const { NOTIFICATION_TYPES, RECIPIENT_TYPES } = require('../config/constants');

// Check if running on Vercel (serverless)
const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;

// Import socket service only if not on Vercel
let socketService;
if (!isVercel) {
  socketService = require('./socketService');
} else {
  console.log('🌐 Running on Vercel: WebSocket disabled, using fallback notifications');
}

class NotificationService {
  /**
   * Create and send notification (with real-time push if available)
   */
  static async createNotification({
    recipientId,
    recipientModel = 'User',
    recipientType,
    tenancy,
    type,
    title,
    message,
    icon = 'bell',
    severity = 'info',
    data = {},
    channels = { inApp: true }
  }) {
    try {
      const notification = await Notification.createNotification({
        recipient: recipientId,
        recipientModel,
        recipientType,
        tenancy,
        type,
        title,
        message,
        icon,
        severity,
        data,
        channels
      });

      // Send real-time notification via WebSocket (if available)
      if (socketService && !isVercel) {
        socketService.sendToUser(recipientId.toString(), {
          _id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          icon: notification.icon,
          severity: notification.severity,
          data: notification.data,
          createdAt: notification.createdAt,
          isRead: notification.isRead
        });
      } else {
        console.log(`📧 Notification created (serverless): ${title} for user ${recipientId}`);
      }

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  // ==================== CUSTOMER NOTIFICATIONS ====================
  
  static async notifyOrderPlaced(customerId, order, tenancy) {
    return this.createNotification({
      recipientId: customerId,
      recipientType: RECIPIENT_TYPES.CUSTOMER,
      tenancy,
      type: NOTIFICATION_TYPES.ORDER_PLACED,
      title: 'Order Placed Successfully',
      message: `Your order ${order.orderNumber} has been placed successfully.`,
      icon: 'shopping-bag',
      severity: 'success',
      data: { orderId: order._id, link: `/orders/${order._id}` }
    });
  }

  static async notifyOrderPicked(customerId, order, tenancy) {
    return this.createNotification({
      recipientId: customerId,
      recipientType: RECIPIENT_TYPES.CUSTOMER,
      tenancy,
      type: NOTIFICATION_TYPES.ORDER_PICKED,
      title: 'Order Picked Up',
      message: `Your order ${order.orderNumber} has been picked up.`,
      icon: 'truck',
      severity: 'info',
      data: { orderId: order._id, link: `/orders/${order._id}` }
    });
  }

  static async notifyOrderReady(customerId, order, tenancy) {
    return this.createNotification({
      recipientId: customerId,
      recipientType: RECIPIENT_TYPES.CUSTOMER,
      tenancy,
      type: NOTIFICATION_TYPES.ORDER_READY,
      title: 'Order Ready',
      message: `Your order ${order.orderNumber} is ready for delivery.`,
      icon: 'check-circle',
      severity: 'success',
      data: { orderId: order._id, link: `/orders/${order._id}` }
    });
  }

  static async notifyOrderOutForDelivery(customerId, order, tenancy) {
    return this.createNotification({
      recipientId: customerId,
      recipientType: RECIPIENT_TYPES.CUSTOMER,
      tenancy,
      type: NOTIFICATION_TYPES.ORDER_OUT_FOR_DELIVERY,
      title: 'Out for Delivery',
      message: `Your order ${order.orderNumber} is out for delivery.`,
      icon: 'truck',
      severity: 'info',
      data: { orderId: order._id, link: `/orders/${order._id}` }
    });
  }

  static async notifyOrderDelivered(customerId, order, tenancy) {
    return this.createNotification({
      recipientId: customerId,
      recipientType: RECIPIENT_TYPES.CUSTOMER,
      tenancy,
      type: NOTIFICATION_TYPES.ORDER_DELIVERED,
      title: 'Order Delivered',
      message: `Your order ${order.orderNumber} has been delivered. Thank you!`,
      icon: 'package-check',
      severity: 'success',
      data: { orderId: order._id, link: `/orders/${order._id}` }
    });
  }

  static async notifyRewardPoints(customerId, points, reason, tenancy) {
    return this.createNotification({
      recipientId: customerId,
      recipientType: RECIPIENT_TYPES.CUSTOMER,
      tenancy,
      type: NOTIFICATION_TYPES.REWARD_POINTS,
      title: 'Points Earned! 🎉',
      message: `You earned ${points} reward points. ${reason}`,
      icon: 'star',
      severity: 'success',
      data: { points, link: '/rewards' }
    });
  }

  static async notifyWalletCredited(customerId, amount, reason, tenancy) {
    return this.createNotification({
      recipientId: customerId,
      recipientType: RECIPIENT_TYPES.CUSTOMER,
      tenancy,
      type: NOTIFICATION_TYPES.WALLET_CREDITED,
      title: 'Wallet Credited',
      message: `₹${amount} has been added to your wallet. ${reason}`,
      icon: 'wallet',
      severity: 'success',
      data: { amount, link: '/wallet' }
    });
  }

  // ==================== ADMIN NOTIFICATIONS ====================

  static async notifyAdminNewOrder(adminId, order, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.ORDER_PLACED,
      title: 'New Order Received',
      message: `New order ${order.orderNumber} from ${order.customer?.name || 'Customer'}`,
      icon: 'shopping-bag',
      severity: 'info',
      data: { orderId: order._id, link: `/admin/orders` }
    });
  }

  static async notifyLowInventory(adminId, item, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.LOW_INVENTORY,
      title: 'Low Inventory Alert',
      message: `${item.name} is running low. Current stock: ${item.currentStock}`,
      icon: 'alert-triangle',
      severity: 'warning',
      data: { itemId: item._id, link: '/admin/inventory' }
    });
  }

  static async notifyNewComplaint(adminId, ticket, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.NEW_COMPLAINT,
      title: 'New Support Ticket',
      message: `Ticket #${ticket.ticketNumber}: ${ticket.subject}`,
      icon: 'message-square',
      severity: 'warning',
      data: { ticketId: ticket._id, link: `/admin/tickets/${ticket._id}` }
    });
  }

  static async notifyRefundRequest(adminId, order, amount, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.REFUND_REQUEST,
      title: 'Refund Request',
      message: `Refund of ₹${amount} requested for order ${order.orderNumber}`,
      icon: 'credit-card',
      severity: 'warning',
      data: { orderId: order._id, amount, link: `/admin/refunds` }
    });
  }

  static async notifyPaymentReceived(adminId, order, amount, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.PAYMENT_RECEIVED,
      title: 'Payment Received',
      message: `₹${amount} received for order ${order.orderNumber}`,
      icon: 'check-circle',
      severity: 'success',
      data: { orderId: order._id, amount, link: `/admin/payments` }
    });
  }

  // ==================== BRANCH ADMIN NOTIFICATIONS ====================

  static async notifyBranchAdminNewOrder(branchAdminId, order, tenancy) {
    return this.createNotification({
      recipientId: branchAdminId,
      recipientType: RECIPIENT_TYPES.BRANCH_ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.ORDER_ASSIGNED,
      title: 'New Order Assigned',
      message: `Order ${order.orderNumber} assigned to your branch`,
      icon: 'shopping-bag',
      severity: 'info',
      data: { orderId: order._id, link: `/branch/orders/${order._id}` }
    });
  }

  // ==================== SUPERADMIN NOTIFICATIONS ====================

  static async notifySuperAdminNewTenancy(superAdminId, tenancy) {
    return this.createNotification({
      recipientId: superAdminId,
      recipientModel: 'SuperAdmin',
      recipientType: RECIPIENT_TYPES.SUPERADMIN,
      type: NOTIFICATION_TYPES.NEW_TENANCY_SIGNUP,
      title: 'New Business Signup! 🎉',
      message: `${tenancy.name} just signed up for ${tenancy.subscription?.plan || 'a plan'}`,
      icon: 'building',
      severity: 'success',
      data: { tenancyId: tenancy._id, link: `/tenancies/${tenancy._id}` }
    });
  }

  static async notifySuperAdminPayment(superAdminId, tenancy, amount) {
    return this.createNotification({
      recipientId: superAdminId,
      recipientModel: 'SuperAdmin',
      recipientType: RECIPIENT_TYPES.SUPERADMIN,
      type: NOTIFICATION_TYPES.TENANCY_PAYMENT_RECEIVED,
      title: 'Payment Received',
      message: `₹${amount} received from ${tenancy.name}`,
      icon: 'credit-card',
      severity: 'success',
      data: { tenancyId: tenancy._id, amount, link: `/billing` }
    });
  }

  static async notifySuperAdminNewLead(superAdminId, lead) {
    return this.createNotification({
      recipientId: superAdminId,
      recipientModel: 'SuperAdmin',
      recipientType: RECIPIENT_TYPES.SUPERADMIN,
      type: NOTIFICATION_TYPES.NEW_LEAD,
      title: 'New Lead',
      message: `${lead.businessName} - ${lead.email}`,
      icon: 'user-plus',
      severity: 'info',
      data: { leadId: lead._id, link: `/leads` }
    });
  }

  static async notifySuperAdminSubscriptionExpiring(superAdminId, tenancy, daysLeft) {
    return this.createNotification({
      recipientId: superAdminId,
      recipientModel: 'SuperAdmin',
      recipientType: RECIPIENT_TYPES.SUPERADMIN,
      type: NOTIFICATION_TYPES.TENANCY_SUBSCRIPTION_EXPIRING,
      title: 'Subscription Expiring',
      message: `${tenancy.name}'s subscription expires in ${daysLeft} days`,
      icon: 'alert-triangle',
      severity: 'warning',
      data: { tenancyId: tenancy._id, link: `/tenancies/${tenancy._id}` }
    });
  }

  // ==================== BULK NOTIFICATIONS ====================

  static async notifyAllSuperAdmins(notificationData) {
    const SuperAdmin = require('../models/SuperAdmin');
    const superAdmins = await SuperAdmin.find({ isActive: true }).select('_id');
    
    const notifications = await Promise.all(
      superAdmins.map(sa => this.createNotification({
        ...notificationData,
        recipientId: sa._id,
        recipientModel: 'SuperAdmin',
        recipientType: RECIPIENT_TYPES.SUPERADMIN
      }))
    );
    
    return notifications;
  }

  // ==================== UTILITY METHODS ====================

  static async getUserNotifications(userId, options) {
    return Notification.getForUser(userId, options);
  }

  static async markAsRead(userId, notificationIds) {
    return Notification.markManyAsRead(userId, notificationIds);
  }

  static async markAllAsRead(userId) {
    return Notification.markManyAsRead(userId);
  }

  static async getUnreadCount(userId) {
    return Notification.getUnreadCount(userId);
  }

  // ==================== PERMISSION & ROLE MANAGEMENT ====================

  static async notifyPermissionGranted(adminId, permission, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.PERMISSION_GRANTED,
      title: 'New Permission Granted',
      message: `You have been granted ${permission.module}.${permission.action} permission`,
      icon: 'shield-check',
      severity: 'success',
      data: { permission, link: '/admin/settings' }
    });
  }

  static async notifyPermissionRevoked(adminId, permission, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.PERMISSION_REVOKED,
      title: 'Permission Revoked',
      message: `Your ${permission.module}.${permission.action} permission has been revoked`,
      icon: 'shield-x',
      severity: 'warning',
      data: { permission, link: '/admin/settings' }
    });
  }

  static async notifyRoleUpdated(adminId, oldRole, newRole, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: newRole === 'admin' ? RECIPIENT_TYPES.ADMIN : RECIPIENT_TYPES.BRANCH_ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.ROLE_UPDATED,
      title: 'Role Updated',
      message: `Your role has been changed from ${oldRole} to ${newRole}`,
      icon: 'user-check',
      severity: 'info',
      data: { oldRole, newRole, link: '/admin/dashboard' }
    });
  }

  static async notifyAdminCreated(adminId, tenancy, createdBy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.ADMIN_CREATED,
      title: 'Welcome to LaundryLobby! 🎉',
      message: `Your admin account has been created. You can now manage your laundry business.`,
      icon: 'user-plus',
      severity: 'success',
      data: { createdBy, link: '/admin/dashboard' }
    });
  }

  static async notifyTenancySettingsUpdated(adminId, settingType, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.TENANCY_SETTINGS_UPDATED,
      title: 'Business Settings Updated',
      message: `Your ${settingType} settings have been updated by SuperAdmin`,
      icon: 'settings',
      severity: 'info',
      data: { settingType, link: '/admin/settings' }
    });
  }

  // ==================== INVENTORY MANAGEMENT ====================

  static async notifyInventoryRequestSubmitted(superAdminId, request, tenancy) {
    return this.createNotification({
      recipientId: superAdminId,
      recipientModel: 'SuperAdmin',
      recipientType: RECIPIENT_TYPES.SUPERADMIN,
      type: NOTIFICATION_TYPES.INVENTORY_REQUEST_SUBMITTED,
      title: 'New Inventory Request',
      message: `${tenancy.businessName} requested ${request.itemName}`,
      icon: 'package-plus',
      severity: 'info',
      data: { 
        requestId: request._id, 
        tenancyId: tenancy._id,
        urgency: request.urgency,
        link: '/inventory-requests' 
      }
    });
  }

  static async notifyInventoryRequestApproved(adminId, request, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.INVENTORY_REQUEST_APPROVED,
      title: 'Inventory Request Approved ✅',
      message: `Your request for ${request.itemName} has been approved`,
      icon: 'check-circle',
      severity: 'success',
      data: { 
        requestId: request._id,
        estimatedCost: request.estimatedCost,
        supplier: request.supplier,
        link: '/admin/inventory/requests' 
      }
    });
  }

  static async notifyInventoryRequestRejected(adminId, request, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.INVENTORY_REQUEST_REJECTED,
      title: 'Inventory Request Rejected',
      message: `Your request for ${request.itemName} has been rejected`,
      icon: 'x-circle',
      severity: 'error',
      data: { 
        requestId: request._id,
        rejectionReason: request.rejectionReason,
        link: '/admin/inventory/requests' 
      }
    });
  }

  static async notifyInventoryRequestCompleted(adminId, request, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.INVENTORY_REQUEST_COMPLETED,
      title: 'Inventory Request Completed 🎉',
      message: `Your request for ${request.itemName} has been fulfilled`,
      icon: 'package-check',
      severity: 'success',
      data: { 
        requestId: request._id,
        link: '/admin/inventory/requests' 
      }
    });
  }

  // ==================== BILLING & SUBSCRIPTION ====================

  static async notifySubscriptionExpiring(adminId, tenancy, daysLeft) {
    const urgency = daysLeft <= 3 ? 'error' : daysLeft <= 7 ? 'warning' : 'info';
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy: tenancy._id,
      type: NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRING,
      title: `Subscription Expiring in ${daysLeft} Days`,
      message: `Your ${tenancy.subscription?.plan || 'current'} plan expires soon. Renew to avoid service interruption.`,
      icon: 'alert-triangle',
      severity: urgency,
      data: { 
        daysLeft,
        plan: tenancy.subscription?.plan,
        expiryDate: tenancy.subscription?.expiryDate,
        link: '/admin/billing' 
      }
    });
  }

  static async notifySubscriptionExpired(adminId, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy: tenancy._id,
      type: NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED,
      title: 'Subscription Expired',
      message: `Your subscription has expired. Please renew to continue using all features.`,
      icon: 'alert-circle',
      severity: 'error',
      data: { 
        plan: tenancy.subscription?.plan,
        link: '/admin/billing' 
      }
    });
  }

  static async notifyPaymentFailed(adminId, tenancy, amount, reason) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy: tenancy._id,
      type: NOTIFICATION_TYPES.PAYMENT_FAILED,
      title: 'Payment Failed',
      message: `Payment of ₹${amount} failed. ${reason}`,
      icon: 'credit-card',
      severity: 'error',
      data: { 
        amount,
        reason,
        link: '/admin/billing' 
      }
    });
  }

  static async notifyPlanUpgraded(adminId, tenancy, oldPlan, newPlan) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy: tenancy._id,
      type: NOTIFICATION_TYPES.PLAN_UPGRADED,
      title: 'Plan Upgraded Successfully! 🎉',
      message: `Your plan has been upgraded from ${oldPlan} to ${newPlan}`,
      icon: 'trending-up',
      severity: 'success',
      data: { 
        oldPlan,
        newPlan,
        link: '/admin/billing' 
      }
    });
  }

  static async notifyUsageLimitReached(adminId, tenancy, limitType, currentUsage, limit) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy: tenancy._id,
      type: NOTIFICATION_TYPES.USAGE_LIMIT_REACHED,
      title: 'Usage Limit Reached',
      message: `You've reached your ${limitType} limit (${currentUsage}/${limit}). Consider upgrading your plan.`,
      icon: 'bar-chart',
      severity: 'warning',
      data: { 
        limitType,
        currentUsage,
        limit,
        link: '/admin/billing' 
      }
    });
  }

  // ==================== SECURITY & SYSTEM ====================

  static async notifySecurityAlert(userId, alertType, details, tenancy) {
    return this.createNotification({
      recipientId: userId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.SECURITY_ALERT,
      title: 'Security Alert',
      message: `${alertType}: ${details}`,
      icon: 'shield-alert',
      severity: 'error',
      data: { 
        alertType,
        details,
        timestamp: new Date(),
        link: '/admin/security' 
      }
    });
  }

  static async notifyPasswordChanged(userId, tenancy) {
    return this.createNotification({
      recipientId: userId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.PASSWORD_CHANGED,
      title: 'Password Changed',
      message: 'Your password has been successfully changed',
      icon: 'key',
      severity: 'success',
      data: { 
        timestamp: new Date(),
        link: '/admin/profile' 
      }
    });
  }

  static async notifyMultipleLoginAttempts(userId, attemptCount, tenancy) {
    return this.createNotification({
      recipientId: userId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.MULTIPLE_LOGIN_ATTEMPTS,
      title: 'Multiple Login Attempts Detected',
      message: `${attemptCount} failed login attempts detected on your account`,
      icon: 'shield-alert',
      severity: 'warning',
      data: { 
        attemptCount,
        timestamp: new Date(),
        link: '/admin/security' 
      }
    });
  }

  static async notifyPermissionSyncFailed(adminId, error, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.PERMISSION_SYNC_FAILED,
      title: 'Permission Sync Failed',
      message: 'There was an issue syncing your permissions. Please contact support if problems persist.',
      icon: 'alert-triangle',
      severity: 'warning',
      data: { 
        error: error.message,
        timestamp: new Date(),
        link: '/admin/support' 
      }
    });
  }
}

module.exports = NotificationService;
