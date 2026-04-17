const Notification = require('../models/Notification');
const { NOTIFICATION_TYPES, RECIPIENT_TYPES, PLATFORM_ROLES, NOTIFICATION_ROLE_MAP } = require('../config/constants');

// Use new Socket.IO notification system instead of legacy event bus
const notificationServiceIntegration = require('./notificationServiceIntegration');

class NotificationService {
  /**
   * Create and send notification (with real-time push via DeepNoti)
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
    priority,
    data = {},
    channels = { inApp: true }
  }) {
    try {
      // Normalize channels to match Mongoose Schema
      const normalizedChannels = {};
      if (channels) {
        for (const [key, value] of Object.entries(channels)) {
          if (typeof value === 'boolean') {
            normalizedChannels[key] = { selected: value };
          } else {
            normalizedChannels[key] = value;
          }
        }
      }

      const notification = await Notification.createNotification({
        recipient: recipientId,
        recipientModel,
        recipientType,
        userId: recipientId, // For Socket.IO compatibility
        tenantId: tenancy,   // For Socket.IO compatibility
        tenancy,
        type,
        title,
        message,
        icon,
        severity,
        priority,
        data,
        channels: normalizedChannels
      });

      // Send real-time notification via Socket.IO Notification Engine
      try {
        await notificationServiceIntegration.createNotification({
          recipient: recipientId,
          recipientModel,
          recipientType,
          tenancy,
          type,
          title,
          message,
          icon,
          severity,
          priority,
          data,
          channels: normalizedChannels
        });
        console.log(`📧 Notification sent via Socket.IO: ${title} for user ${recipientId}`);
      } catch (socketIOError) {
        console.error('❌ Failed to send via Socket.IO:', socketIOError);
        console.log(`📧 Notification created (stored only): ${title} for user ${recipientId}`);
      }

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

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
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount || order.pricing?.total,
        itemCount: order.items?.length,
        serviceType: order.serviceType,
        status: order.status,
        branchName: order.branch?.name,
        link: `/customer/orders/${order._id}`
      }
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
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'picked',
        branchName: order.branch?.name,
        link: `/customer/orders/${order._id}`
      }
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
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'ready',
        branchName: order.branch?.name,
        link: `/customer/orders/${order._id}`
      }
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
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'out_for_delivery',
        link: `/customer/orders/${order._id}`
      }
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
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount || order.pricing?.total,
        status: 'delivered',
        link: `/customer/orders/${order._id}`
      }
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

  static async notifyCouponExpiring(customerId, coupon, tenancy) {
    return this.createNotification({
      recipientId: customerId,
      recipientType: RECIPIENT_TYPES.CUSTOMER,
      tenancy,
      type: NOTIFICATION_TYPES.COUPON_EXPIRING,
      title: 'Coupon Expiring Soon!',
      message: `Your coupon "${coupon.code}" expires on ${new Date(coupon.expiryDate).toLocaleDateString('en-IN')}. Use it before it's gone!`,
      icon: 'tag',
      severity: 'warning',
      data: {
        couponId: coupon._id,
        couponCode: coupon.code,
        discount: coupon.discount,
        expiryDate: coupon.expiryDate,
        link: '/customer/coupons'
      }
    });
  }

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
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        customerName: order.customer?.name,
        customerPhone: order.customer?.phone,
        totalAmount: order.totalAmount || order.pricing?.total,
        itemCount: order.items?.length,
        serviceType: order.serviceType,
        status: order.status,
        branchName: order.branch?.name,
        isExpress: order.isExpress,
        link: `/admin/orders?id=${order._id}`
      }
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
      data: {
        itemId: item._id,
        itemName: item.name,
        currentStock: item.currentStock,
        reorderLevel: item.reorderLevel || item.minStock,
        branchName: item.branch?.name,
        unit: item.unit,
        link: '/admin/inventory'
      }
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
      data: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        category: ticket.category,
        ticketPriority: ticket.priority,
        customerName: ticket.customer?.name,
        customerPhone: ticket.customer?.phone,
        status: ticket.status,
        link: `/admin/tickets/${ticket._id}`
      }
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
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        amount,
        customerName: order.customer?.name,
        paymentMethod: order.paymentMethod,
        link: '/admin/refunds'
      }
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
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        amount,
        paymentMethod: order.paymentMethod,
        customerName: order.customer?.name,
        transactionId: order.transactionId || order.paymentId,
        link: '/admin/payments'
      }
    });
  }

  static async notifySuperAdminNewTenancy(superAdminId, tenancy) {
    return this.createNotification({
      recipientId: superAdminId,
      recipientModel: 'SuperAdmin',
      recipientType: RECIPIENT_TYPES.SUPERADMIN,
      type: NOTIFICATION_TYPES.NEW_TENANCY_SIGNUP,
      title: 'New Tenancy Signup',
      message: `New laundry "${tenancy.name}" has signed up.`,
      icon: 'plus-circle',
      severity: 'success',
      data: { tenancyId: tenancy._id, link: `/superadmin/tenancies/${tenancy._id}` }
    });
  }

  static async notifySuperAdminSubscriptionUpdate(superAdminId, tenancy, type, details) {
    return this.createNotification({
      recipientId: superAdminId,
      recipientModel: 'SuperAdmin',
      recipientType: RECIPIENT_TYPES.SUPERADMIN,
      type: NOTIFICATION_TYPES.SUBSCRIPTION_UPDATED,
      title: `Subscription ${type}`,
      message: `${tenancy.name} ${details}`,
      icon: 'credit-card',
      severity: type === 'Activated' ? 'success' : 'info',
      data: { tenancyId: tenancy._id, link: `/superadmin/tenancies/${tenancy._id}` }
    });
  }

  static async notifySuperAdminTicketEscalated(superAdminId, ticket) {
    return this.createNotification({
      recipientId: superAdminId,
      recipientModel: 'SuperAdmin',
      recipientType: RECIPIENT_TYPES.SUPERADMIN,
      type: NOTIFICATION_TYPES.NEW_COMPLAINT,
      title: 'Ticket Escalated',
      message: `Ticket #${ticket.ticketNumber} has been escalated to your level.`,
      icon: 'shield-alert',
      severity: 'warning',
      data: { ticketId: ticket._id, link: `/superadmin/support/tickets/${ticket._id}` }
    });
  }


  /**
   * Notify all admins in a tenancy about an order status update (persistent)
   */
  static async notifyAdminOrderStatusUpdate(order, tenancyId) {
    const User = require('../models/User');
    const admins = await User.find({
      tenancy: tenancyId,
      role: { $in: ['admin', 'branch_admin'] },
      isActive: true
    }).select('_id');

    if (!admins || admins.length === 0) return [];

    return Promise.all(
      admins.map(admin => this.createNotification({
        recipientId: admin._id,
        recipientType: RECIPIENT_TYPES.ADMIN,
        tenancy: tenancyId,
        type: order.status,
        title: `Order Status: ${order.orderNumber}`,
        message: `Order #${order.orderNumber} status changed to ${order.status}`,
        icon: 'package',
        severity: 'info',
        data: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          status: order.status,
          link: `/admin/orders`
        }
      }))
    );
  }


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
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        customerName: order.customer?.name,
        totalAmount: order.totalAmount || order.pricing?.total,
        itemCount: order.items?.length,
        serviceType: order.serviceType,
        isExpress: order.isExpress,
        link: `/branch/orders?id=${order._id}`
      }
    });
  }

  // Duplicate SuperAdmin methods removed during cleanup

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
      type: NOTIFICATION_TYPES.TENANCY_SUBSCRIPTION_EXPIRING || 'tenancy_subscription_expiring',
      title: 'Subscription Expiring',
      message: `${tenancy.name}'s subscription expires in ${daysLeft} days`,
      icon: 'alert-triangle',
      severity: 'warning',
      data: { tenancyId: tenancy._id, link: `/tenancies/${tenancy._id}` }
    });
  }

  static async notifyAllSuperAdmins(notificationData) {
    // Use role-based routing if notification type is mapped
    const notificationType = notificationData.type;
    if (notificationType && NOTIFICATION_ROLE_MAP[notificationType]) {
      return this.notifyByPlatformRole(notificationData);
    }

    // Fallback: send to all SuperAdmins (for unmapped types)
    const SuperAdmin = require('../models/SuperAdmin');
    const superAdmins = await SuperAdmin.find({ isActive: true }).select('_id');

    console.log(`📡 Broadcasting notification "${notificationData.title}" to ${superAdmins.length} SuperAdmins`);

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

  /**
   * Role-based notification routing for platform roles.
   * Only sends notifications to SuperAdmins whose role matches the NOTIFICATION_ROLE_MAP.
   * e.g. payment notifications → superadmin + finance + auditor (not sales/support)
   */
  static async notifyByPlatformRole(notificationData) {
    const SuperAdmin = require('../models/SuperAdmin');
    const notificationType = notificationData.type;
    const allowedRoles = NOTIFICATION_ROLE_MAP[notificationType];

    if (!allowedRoles || allowedRoles.length === 0) {
      console.log(`⚠️ No role mapping for notification type: ${notificationType}, sending to all`);
      const superAdmins = await SuperAdmin.find({ isActive: true }).select('_id');
      return Promise.all(
        superAdmins.map(sa => this.createNotification({
          ...notificationData,
          recipientId: sa._id,
          recipientModel: 'SuperAdmin',
          recipientType: RECIPIENT_TYPES.SUPERADMIN
        }))
      );
    }

    // Find SuperAdmins whose role matches any of the allowed roles
    const superAdmins = await SuperAdmin.find({
      isActive: true,
      role: { $in: allowedRoles }
    }).select('_id role');

    if (superAdmins.length === 0) {
      console.log(`⚠️ No SuperAdmins found for roles: ${allowedRoles.join(', ')}`);
      return [];
    }

    console.log(`📡 Role-based notification "${notificationData.title}" → ${allowedRoles.join(', ')} (${superAdmins.length} recipients)`);

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

  /**
   * Notify all admins in a tenancy with custom data
   */
  static async notifyTenancyAdmins(tenancyId, notificationData) {
    const User = require('../models/User');
    const admins = await User.find({
      tenancy: tenancyId,
      role: { $in: ['admin', 'branch_admin'] },
      isActive: true
    }).select('_id');

    if (!admins || admins.length === 0) return [];

    return Promise.all(
      admins.map(admin => this.createNotification({
        ...notificationData,
        recipientId: admin._id,
        recipientType: RECIPIENT_TYPES.ADMIN,
        tenancy: tenancyId
      }))
    );
  }


  static async getUserNotifications(userId, options) {
    return Notification.getForUser(userId, options);
  }

  static async markAsRead(userId, notificationIds) {
    return Notification.markManyAsRead(userId, notificationIds);
  }

  static async markAllAsRead(userId) {
    return Notification.markManyAsRead(userId);
  }

  static async clearAllNotifications(userId) {
    return Notification.deleteManyForUser(userId);
  }

  static async getUnreadCount(userId) {
    return Notification.getUnreadCount(userId);
  }


  static async notifyPermissionGranted(adminId, permission, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.PERMISSION_GRANTED,
      title: 'Permissions Updated',
      message: `Your permissions have been updated by an administrator`,
      icon: 'shield-check',
      severity: 'info',
      data: {
        permission,
        type: 'permission_update',
        action: 'granted',
        // No link - permission updates should refresh current page
      }
    });
  }

  static async notifyPermissionRevoked(adminId, permission, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.PERMISSION_REVOKED,
      title: 'Permissions Updated',
      message: `Your permissions have been updated by an administrator`,
      icon: 'shield-x',
      severity: 'info',
      data: {
        permission,
        type: 'permission_update',
        action: 'revoked',
        // No link - permission updates should refresh current page
      }
    });
  }

  /**
   * Enhanced permission update notification with detailed changes
   */
  static async notifyDetailedPermissionUpdate(adminId, permissionChanges, tenancy, updatedBy = 'SuperAdmin') {
    // Parse permission changes to create detailed message
    const changedModules = Object.keys(permissionChanges);
    const totalChanges = changedModules.reduce((count, module) => {
      return count + Object.keys(permissionChanges[module]).length;
    }, 0);

    // Create dynamic title
    let title = 'Permissions Updated';
    if (changedModules.length === 1) {
      const module = changedModules[0];
      title = `${module.charAt(0).toUpperCase() + module.slice(1)} Permission Updated`;
    }

    // Create summary message
    let summaryMessage = `${updatedBy} updated your permissions`;

    if (changedModules.length > 0) {
      const moduleNames = changedModules.map(m => m.charAt(0).toUpperCase() + m.slice(1));

      if (moduleNames.length === 1) {
        const module = changedModules[0];
        const actions = Object.keys(permissionChanges[module]);
        summaryMessage += `: ${moduleNames[0]} (${actions.join(', ')})`;
      } else if (moduleNames.length <= 5) {
        summaryMessage += `: ${moduleNames.join(', ')}`;
      } else {
        summaryMessage += `: ${moduleNames.slice(0, 3).join(', ')} and ${moduleNames.length - 3} other modules`;
      }
    } else {
      summaryMessage += '.';
    }

    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: 'tenancy_permissions_updated',
      title,
      message: summaryMessage,
      priority: 'P1', // Explicitly High Priority
      icon: 'shield-check',
      severity: 'warning',
      data: {
        permissions: permissionChanges,
        updatedBy,
        totalChanges,
        changedModules,
        timestamp: new Date().toISOString(),
        type: 'detailed_permission_update'
      }
    });
  }

  /**
   * Enhanced feature update notification with detailed changes
   */
  static async notifyDetailedFeatureUpdate(adminId, featureChanges, tenancy, updatedBy = 'SuperAdmin') {
    // Parse feature changes to create detailed message
    const changedFeatures = Object.keys(featureChanges);
    const enabledFeatures = changedFeatures.filter(f => featureChanges[f] === true);
    const disabledFeatures = changedFeatures.filter(f => featureChanges[f] === false);

    let summaryMessage = `${updatedBy} updated your features: `;
    if (enabledFeatures.length > 0 && disabledFeatures.length === 0) {
      summaryMessage += `Enabled ${enabledFeatures.length} feature${enabledFeatures.length > 1 ? 's' : ''}`;
    } else if (disabledFeatures.length > 0 && enabledFeatures.length === 0) {
      summaryMessage += `Disabled ${disabledFeatures.length} feature${disabledFeatures.length > 1 ? 's' : ''}`;
    } else {
      summaryMessage += `${changedFeatures.length} feature changes`;
    }

    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: 'tenancy_features_updated',
      title: 'Features Updated by SuperAdmin',
      message: summaryMessage,
      icon: 'star',
      severity: 'success',
      data: {
        features: featureChanges,
        updatedBy,
        enabledFeatures,
        disabledFeatures,
        totalChanges: changedFeatures.length,
        timestamp: new Date().toISOString(),
        type: 'detailed_feature_update'
      }
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


  static async notifyOrderInProcess(customerId, order, tenancy) {
    return this.createNotification({
      recipientId: customerId,
      recipientType: RECIPIENT_TYPES.CUSTOMER,
      tenancy,
      type: NOTIFICATION_TYPES.ORDER_IN_PROCESS,
      title: 'Order Processing',
      message: `Your order ${order.orderNumber} is now being processed.`,
      icon: 'package',
      severity: 'info',
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: 'in_process',
        branchName: order.branch?.name,
        link: `/customer/orders/${order._id}`
      }
    });
  }

  static async notifyOrderCancelled(customerId, order, tenancy) {
    return this.createNotification({
      recipientId: customerId,
      recipientType: RECIPIENT_TYPES.CUSTOMER,
      tenancy,
      type: NOTIFICATION_TYPES.ORDER_CANCELLED,
      title: 'Order Cancelled',
      message: `Your order ${order.orderNumber} has been cancelled.`,
      icon: 'x-circle',
      severity: 'error',
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount || order.pricing?.total,
        status: 'cancelled',
        reason: order.cancellationReason,
        link: `/customer/orders/${order._id}`
      }
    });
  }

  static async notifyAdminOrderCancelled(adminId, order, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.ORDER_CANCELLED,
      title: 'Order Cancelled',
      message: `Order ${order.orderNumber} from ${order.customer?.name || 'Customer'} has been cancelled`,
      icon: 'x-circle',
      severity: 'warning',
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        customerName: order.customer?.name,
        totalAmount: order.totalAmount || order.pricing?.total,
        reason: order.cancellationReason,
        link: `/admin/orders?id=${order._id}`
      }
    });
  }

  static async notifyNewStaffAdded(adminId, staff, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.NEW_STAFF_ADDED,
      title: 'New Staff Member Added',
      message: `${staff.name} has been added as ${staff.role}`,
      icon: 'user-plus',
      severity: 'info',
      data: {
        staffName: staff.name,
        role: staff.role,
        email: staff.email,
        branchName: staff.branch?.name,
        link: '/admin/staff'
      }
    });
  }

  static async notifyStaffRemoved(adminId, staff, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.STAFF_REMOVED,
      title: 'Staff Member Removed',
      message: `${staff.name} has been removed from the team`,
      icon: 'user-minus',
      severity: 'warning',
      data: {
        staffName: staff.name,
        role: staff.role,
        link: '/admin/staff'
      }
    });
  }

  static async notifyNewBranchCreated(adminId, branch, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.NEW_BRANCH_CREATED,
      title: 'New Branch Created',
      message: `Branch "${branch.name}" has been created`,
      icon: 'building',
      severity: 'success',
      data: {
        branchName: branch.name,
        branchCode: branch.code,
        city: branch.city,
        link: '/admin/branches'
      }
    });
  }

  static async notifyBranchAdminAssigned(branchAdminId, branch, tenancy) {
    return this.createNotification({
      recipientId: branchAdminId,
      recipientType: RECIPIENT_TYPES.BRANCH_ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.BRANCH_ADMIN_ASSIGNED,
      title: 'Branch Admin Assigned',
      message: `You have been assigned as admin for branch "${branch.name}"`,
      icon: 'user-check',
      severity: 'success',
      data: {
        branchName: branch.name,
        branchId: branch._id,
        link: '/admin/branches'
      }
    });
  }

  static async notifyAccountLocked(userId, reason, tenancy) {
    return this.createNotification({
      recipientId: userId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy,
      type: NOTIFICATION_TYPES.ACCOUNT_LOCKED,
      title: 'Account Locked',
      message: `Your account has been locked. ${reason || 'Contact support for assistance.'}`,
      icon: 'shield-alert',
      severity: 'error',
      priority: 'P0',
      data: {
        reason,
        timestamp: new Date(),
        link: '/admin/security'
      }
    });
  }

  static async notifyPlanDowngraded(adminId, tenancy, oldPlan, newPlan) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy: tenancy._id,
      type: NOTIFICATION_TYPES.PLAN_DOWNGRADED,
      title: 'Plan Downgraded',
      message: `Your plan has been downgraded from ${oldPlan} to ${newPlan}`,
      icon: 'trending-down',
      severity: 'warning',
      data: {
        oldPlan,
        newPlan,
        link: '/admin/billing'
      }
    });
  }

  static async notifyMilestoneAchieved(customerId, milestone, tenancy) {
    return this.createNotification({
      recipientId: customerId,
      recipientType: RECIPIENT_TYPES.CUSTOMER,
      tenancy,
      type: NOTIFICATION_TYPES.MILESTONE_ACHIEVED,
      title: 'Milestone Achieved!',
      message: `Congratulations! You've reached ${milestone.name}`,
      icon: 'trophy',
      severity: 'success',
      data: {
        milestoneName: milestone.name,
        reward: milestone.reward,
        points: milestone.points,
        link: '/customer/rewards'
      }
    });
  }

  static async notifyVipUpgrade(customerId, tenancy) {
    return this.createNotification({
      recipientId: customerId,
      recipientType: RECIPIENT_TYPES.CUSTOMER,
      tenancy,
      type: NOTIFICATION_TYPES.VIP_UPGRADE,
      title: 'VIP Status Unlocked!',
      message: 'Congratulations! You have been upgraded to VIP status with exclusive benefits.',
      icon: 'crown',
      severity: 'success',
      data: {
        tier: 'VIP',
        link: '/customer/rewards'
      }
    });
  }

  static async notifyInvoiceGenerated(adminId, invoice, tenancy) {
    return this.createNotification({
      recipientId: adminId,
      recipientType: RECIPIENT_TYPES.ADMIN,
      tenancy: tenancy._id || tenancy,
      type: NOTIFICATION_TYPES.INVOICE_GENERATED,
      title: 'Invoice Generated',
      message: `Invoice #${invoice.invoiceNumber || invoice._id} for ₹${invoice.amount} has been generated`,
      icon: 'file-text',
      severity: 'info',
      data: {
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        link: '/admin/billing'
      }
    });
  }

  static async notifySuperAdminLeadConverted(superAdminId, lead) {
    return this.createNotification({
      recipientId: superAdminId,
      recipientModel: 'SuperAdmin',
      recipientType: RECIPIENT_TYPES.SUPERADMIN,
      type: NOTIFICATION_TYPES.LEAD_CONVERTED,
      title: 'Lead Converted',
      message: `Lead "${lead.businessName || lead.name}" has been converted to a tenant`,
      icon: 'check-circle',
      severity: 'success',
      data: {
        leadId: lead._id,
        businessName: lead.businessName || lead.name,
        email: lead.email,
        link: '/leads'
      }
    });
  }
}

module.exports = NotificationService;
