const Order = require('../models/Order');
const User = require('../models/User');
const Branch = require('../models/Branch');
const NotificationService = require('./notificationService');
const socketService = require('./socketService');
const { ORDER_STATUS, NOTIFICATION_TYPES } = require('../config/constants');

class OrderService {
  // Update order status with notifications
  static async updateOrderStatus(orderId, newStatus, updatedBy, notes = '') {
    try {
      const order = await Order.findById(orderId)
        .populate('customer', '_id name')
        .populate('branch', 'manager');

      if (!order) {
        throw new Error('Order not found');
      }

      const oldStatus = order.status;

      // Update order status
      await order.updateStatus(newStatus, updatedBy, notes);

      // Handle payment status updates based on order status
      await this.handlePaymentStatusUpdate(order, newStatus);

      // Send notifications based on status
      await this.sendStatusNotifications(order, newStatus);

      // Send real-time WebSocket notifications
      await this.sendRealtimeNotifications(order, oldStatus, newStatus);

      return order;
    } catch (error) {
      console.error('Error updating order status:', error);
      throw error;
    }
  }

  // Send real-time WebSocket notifications for order status updates
  static async sendRealtimeNotifications(order, oldStatus, newStatus) {
    try {
      console.log(`🔔 Sending real-time notifications for order ${order.orderNumber}: ${oldStatus} → ${newStatus}`);

      // Notify customer
      socketService.sendEventToUser(order.customer._id.toString(), 'orderStatusUpdated', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        oldStatus: oldStatus,
        newStatus: newStatus,
        message: `Your order #${order.orderNumber} is now ${newStatus}`,
        timestamp: new Date()
      });

      // Notify all admins in tenancy
      if (order.tenancy) {
        socketService.sendToTenancyRecipients(order.tenancy, 'admin', {
          type: 'orderStatusUpdated',
          orderId: order._id,
          orderNumber: order.orderNumber,
          oldStatus: oldStatus,
          newStatus: newStatus,
          customerName: order.customer.name,
          timestamp: new Date()
        });
      }

      console.log(`✅ Real-time notifications sent for order ${order.orderNumber}`);
    } catch (error) {
      console.error('Error sending real-time notifications:', error);
      // Don't throw - WebSocket failure shouldn't break order update
    }
  }

  // Handle payment status updates based on order status
  static async handlePaymentStatusUpdate(order, newStatus) {
    try {
      // When order is delivered, mark payment as paid (especially for COD)
      if (newStatus === ORDER_STATUS.DELIVERED) {
        if (order.paymentStatus !== 'paid') {
          order.paymentStatus = 'paid';
          order.paymentDetails = {
            ...order.paymentDetails,
            paidAt: new Date(),
            transactionId: order.paymentDetails?.transactionId || `COD-${order.orderNumber}`
          };
          await order.save();
        }
      }
      
      // When order is cancelled, handle refund if already paid
      if (newStatus === ORDER_STATUS.CANCELLED) {
        if (order.paymentStatus === 'paid' && order.paymentMethod !== 'cod') {
          // Mark for refund processing (actual refund handled separately)
          order.paymentStatus = 'refunded';
          await order.save();
        } else if (order.paymentStatus === 'pending') {
          // No payment was made, just mark as cancelled
          order.paymentStatus = 'failed';
          await order.save();
        }
      }
    } catch (error) {
      console.error('Error handling payment status update:', error);
      // Don't throw - payment status update shouldn't break main flow
    }
  }

  // Send notifications based on order status
  static async sendStatusNotifications(order, status) {
    try {
      const customerId = order.customer._id;

      switch (status) {
        case ORDER_STATUS.PLACED:
          await NotificationService.notifyOrderPlaced(customerId, order);
          break;

        case ORDER_STATUS.ASSIGNED_TO_BRANCH:
          // Notify customer
          await NotificationService.createNotification({
            recipientId: customerId,
            type: NOTIFICATION_TYPES.ORDER_ASSIGNED,
            title: 'Order Assigned to Branch',
            message: `Your order ${order.orderNumber} has been assigned to our processing facility.`,
            data: { orderId: order._id }
          });

          // Notify branch manager
          if (order.branch && order.branch.manager) {
            await NotificationService.notifyNewOrderToBranch(order.branch.manager, order);
          }
          break;

        case ORDER_STATUS.PICKED:
          await NotificationService.notifyOrderPicked(customerId, order);
          break;

        case ORDER_STATUS.IN_PROCESS:
          await NotificationService.createNotification({
            recipientId: customerId,
            type: NOTIFICATION_TYPES.ORDER_IN_PROCESS,
            title: 'Order Being Processed',
            message: `Your order ${order.orderNumber} is now being processed at our facility.`,
            data: { orderId: order._id }
          });
          break;

        case ORDER_STATUS.READY:
          await NotificationService.notifyOrderReady(customerId, order);
          break;

        case ORDER_STATUS.OUT_FOR_DELIVERY:
          await NotificationService.notifyOrderOutForDelivery(customerId, order);
          break;

        case ORDER_STATUS.DELIVERED:
          await NotificationService.notifyOrderDelivered(customerId, order);
          
          // Update customer stats
          await this.updateCustomerStats(customerId, order);
          break;

        case ORDER_STATUS.CANCELLED:
          await NotificationService.createNotification({
            recipientId: customerId,
            type: NOTIFICATION_TYPES.ORDER_CANCELLED,
            title: 'Order Cancelled',
            message: `Your order ${order.orderNumber} has been cancelled.`,
            data: { orderId: order._id }
          });
          break;
      }
    } catch (error) {
      console.error('Error sending status notifications:', error);
      // Don't throw error here as it shouldn't break the main flow
    }
  }

  // Update customer statistics after order completion
  static async updateCustomerStats(customerId, order) {
    try {
      console.log('========================================');
      console.log('UPDATE CUSTOMER STATS CALLED');
      console.log('Customer ID:', customerId);
      console.log('Order ID:', order._id);
      console.log('Order Number:', order.orderNumber);
      console.log('Order Status:', order.status);
      console.log('Order Tenancy:', order.tenancy);
      console.log('Order Total:', order.pricing?.total);
      console.log('========================================');
      
      const customer = await User.findById(customerId);
      if (!customer) return;

      // Award loyalty points through loyalty program
      try {
        console.log('🎯 Attempting to award loyalty points...');
        const LoyaltyService = require('./loyaltyService');
        await LoyaltyService.awardPointsForOrder(customerId, order);
      } catch (loyaltyError) {
        console.error('Error awarding loyalty points:', loyaltyError);
        // Don't fail the whole process if loyalty fails
      }
      
      // Process referral reward on first order
      try {
        await this.processReferralReward(customer, order);
      } catch (referralError) {
        console.error('Error processing referral reward:', referralError);
        // Don't fail the whole process if referral fails
      }

      // Add reward points for VIP customers (legacy system)
      if (customer.isVIP) {
        const points = Math.floor(order.pricing.total / 100); // 1 point per ₹100
        customer.rewardPoints += points;

        if (points > 0) {
          await NotificationService.createNotification({
            recipientId: customerId,
            type: NOTIFICATION_TYPES.REWARD_POINTS,
            title: 'Reward Points Earned',
            message: `You earned ${points} reward points for order ${order.orderNumber}!`,
            data: { orderId: order._id, pointsEarned: points }
          });
        }
      }

      // Update total orders count
      customer.totalOrders += 1;

      // Check for milestone achievements
      await this.checkMilestones(customer, order);

      await customer.save();
    } catch (error) {
      console.error('Error updating customer stats:', error);
    }
  }
  
  // Process referral reward when referee completes first order
  static async processReferralReward(customer, order) {
    // Check if customer was referred and hasn't claimed reward yet
    if (!customer.referralCode || customer.referralRewardClaimed) {
      return;
    }
    
    console.log('🎁 Processing referral reward for:', customer.email);
    console.log('   Referral Code:', customer.referralCode);
    
    const { Referral, ReferralProgram } = require('../models/Referral');
    
    // Find the referral
    const referral = await Referral.findOne({
      code: customer.referralCode,
      referee: customer._id
    }).populate('program');
    
    if (!referral) {
      console.log('   ❌ Referral not found');
      return;
    }
    
    // Check if program is still valid
    if (!referral.program || !referral.program.isValid()) {
      console.log('   ❌ Referral program not valid');
      return;
    }
    
    // Check minimum order value
    if (order.pricing?.total < referral.program.minOrderValue) {
      console.log(`   ❌ Order value (₹${order.pricing?.total}) below minimum (₹${referral.program.minOrderValue})`);
      return;
    }
    
    // Record conversion
    await referral.recordConversion(order);
    console.log('   ✅ Conversion recorded');
    
    // Give rewards to both referrer and referee
    await referral.giveRewards();
    console.log('   ✅ Rewards given');
    
    // Mark customer as having claimed referral reward
    customer.referralRewardClaimed = true;
    
    // Update referral program stats
    referral.program.totalRewardsGiven += 1;
    await referral.program.save();
    
    // Send notifications
    const referrer = await User.findById(referral.referrer);
    
    // Notify referrer
    if (referrer) {
      await NotificationService.createNotification({
        recipientId: referrer._id,
        type: NOTIFICATION_TYPES.REWARD_POINTS,
        title: 'Referral Reward Earned! 🎉',
        message: `Your friend ${customer.name} completed their first order! You earned ${referral.program.referrerReward.type === 'credit' ? '₹' : ''}${referral.program.referrerReward.value}${referral.program.referrerReward.type === 'discount' ? '%' : ''} ${referral.program.referrerReward.type}.`,
        data: { 
          referralId: referral._id,
          rewardType: referral.program.referrerReward.type,
          rewardValue: referral.program.referrerReward.value
        }
      });
    }
    
    // Notify referee (current customer)
    await NotificationService.createNotification({
      recipientId: customer._id,
      type: NOTIFICATION_TYPES.REWARD_POINTS,
      title: 'Referral Bonus Applied! 🎁',
      message: `Congratulations! Your referral bonus of ${referral.program.refereeReward.type === 'credit' ? '₹' : ''}${referral.program.refereeReward.value}${referral.program.refereeReward.type === 'discount' ? '%' : ''} ${referral.program.refereeReward.type} has been applied.`,
      data: { 
        referralId: referral._id,
        rewardType: referral.program.refereeReward.type,
        rewardValue: referral.program.refereeReward.value
      }
    });
    
    console.log('   ✅ Referral reward processing complete');
  }

  // Check and notify about customer milestones
  static async checkMilestones(customer, order) {
    const milestones = [5, 10, 25, 50, 100];
    
    if (milestones.includes(customer.totalOrders)) {
      await NotificationService.createNotification({
        recipientId: customer._id,
        type: NOTIFICATION_TYPES.MILESTONE_ACHIEVED,
        title: 'Milestone Achieved!',
        message: `Congratulations! You've completed ${customer.totalOrders} orders with us. Thank you for your loyalty!`,
        data: { milestone: customer.totalOrders }
      });

      // Auto-upgrade to VIP after 25 orders
      if (customer.totalOrders >= 25 && !customer.isVIP) {
        customer.isVIP = true;
        
        await NotificationService.createNotification({
          recipientId: customer._id,
          type: NOTIFICATION_TYPES.VIP_UPGRADE,
          title: 'Welcome to VIP!',
          message: 'You are now a VIP customer! Enjoy priority processing, special discounts, and reward points on every order.',
          data: { upgradedAt: new Date() }
        });
      }
    }
  }

  // Get order analytics for dashboard
  static async getOrderAnalytics(branchId = null, startDate = null, endDate = null) {
    try {
      const query = {};
      if (branchId) query.branch = branchId;
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
      }

      const [
        totalOrders,
        completedOrders,
        cancelledOrders,
        totalRevenue,
        averageOrderValue,
        statusDistribution
      ] = await Promise.all([
        Order.countDocuments(query),
        Order.countDocuments({ ...query, status: ORDER_STATUS.DELIVERED }),
        Order.countDocuments({ ...query, status: ORDER_STATUS.CANCELLED }),
        Order.aggregate([
          { $match: { ...query, status: ORDER_STATUS.DELIVERED } },
          { $group: { _id: null, total: { $sum: '$pricing.total' } } }
        ]).then(result => result[0]?.total || 0),
        Order.aggregate([
          { $match: { ...query, status: ORDER_STATUS.DELIVERED } },
          { $group: { _id: null, avg: { $avg: '$pricing.total' } } }
        ]).then(result => Math.round(result[0]?.avg || 0)),
        Order.aggregate([
          { $match: query },
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ])
      ]);

      return {
        totalOrders,
        completedOrders,
        cancelledOrders,
        totalRevenue,
        averageOrderValue,
        statusDistribution,
        completionRate: totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0
      };
    } catch (error) {
      console.error('Error getting order analytics:', error);
      throw error;
    }
  }

  // Get orders requiring attention (delayed, stuck, etc.)
  static async getOrdersRequiringAttention(branchId = null) {
    try {
      const twoDaysAgo = new Date();
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const query = {
        status: { 
          $nin: [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED] 
        },
        createdAt: { $lt: twoDaysAgo }
      };

      if (branchId) query.branch = branchId;

      const delayedOrders = await Order.find(query)
        .populate('customer', 'name phone')
        .populate('branch', 'name code')
        .sort({ createdAt: 1 })
        .limit(20);

      return delayedOrders;
    } catch (error) {
      console.error('Error getting orders requiring attention:', error);
      throw error;
    }
  }
}

module.exports = OrderService;