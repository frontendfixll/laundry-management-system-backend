const Notification = require('../models/Notification');
const { NOTIFICATION_TYPES, RECIPIENT_TYPES } = require('../config/constants');
const sseService = require('./sseService');

class NotificationService {
  /**
   * Create and send notification (with real-time SSE push)
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

      // Send real-time notification via SSE
      sseService.sendToRecipient(recipientId.toString(), recipientType, {
        _id: notification._id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        icon: notification.icon,
        severity: notification.severity,
        data: notification.data,
        createdAt: notification.createdAt
      });

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
      data: { orderId: order._id, link: `/admin/orders/${order._id}` }
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
}

module.exports = NotificationService;
