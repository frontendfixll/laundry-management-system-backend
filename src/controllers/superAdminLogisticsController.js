const LogisticsPartner = require('../models/LogisticsPartner');
const Order = require('../models/Order');
const AuditLog = require('../models/AuditLog');

// Get all logistics partners
exports.getAllPartners = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
    
    const query = {};
    
    if (search) {
      query.$or = [
        { companyName: { $regex: search, $options: 'i' } },
        { 'contactPerson.name': { $regex: search, $options: 'i' } },
        { 'contactPerson.phone': { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [partners, total] = await Promise.all([
      LogisticsPartner.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      LogisticsPartner.countDocuments(query)
    ]);
    
    // Get order stats for all partners in one aggregation
    const partnerIds = partners.map(p => p._id);
    const orderStats = await Order.aggregate([
      {
        $match: {
          logisticsPartner: { $in: partnerIds }
        }
      },
      {
        $group: {
          _id: '$logisticsPartner',
          totalOrders: { $sum: 1 },
          completedOrders: {
            $sum: { $cond: [{ $in: ['$status', ['delivered', 'completed']] }, 1, 0] }
          }
        }
      }
    ]);
    
    // Create a map for quick lookup
    const statsMap = {};
    orderStats.forEach(stat => {
      statsMap[stat._id.toString()] = stat;
    });
    
    // Add dynamic performance data to partners
    const partnersWithStats = partners.map(partner => {
      const stats = statsMap[partner._id.toString()] || { totalOrders: 0, completedOrders: 0 };
      return {
        ...partner,
        performance: {
          ...partner.performance,
          totalOrders: stats.totalOrders,
          completedOrders: stats.completedOrders
        }
      };
    });
    
    res.json({
      success: true,
      data: partnersWithStats,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (error) {
    console.error('Get partners error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch partners' });
  }
};

// Get single partner
exports.getPartner = async (req, res) => {
  try {
    const partner = await LogisticsPartner.findById(req.params.id);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found' });
    }
    res.json({ success: true, data: partner });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch partner' });
  }
};

// Create partner
exports.createPartner = async (req, res) => {
  try {
    const partner = new LogisticsPartner(req.body);
    await partner.save();
    
    // Audit log with correct format
    try {
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'create_logistics_partner',
        category: 'settings',
        description: `Created logistics partner: ${partner.companyName}`,
        ipAddress: req.ip || req.connection?.remoteAddress || '127.0.0.1',
        userAgent: req.get('User-Agent'),
        resourceType: 'logistics_partner',
        resourceId: partner._id.toString(),
        status: 'success',
        riskLevel: 'low',
        metadata: { companyName: partner.companyName }
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError);
      // Don't fail the request if audit log fails
    }
    
    res.status(201).json({ success: true, data: partner });
  } catch (error) {
    console.error('Create partner error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create partner' });
  }
};

// Update partner
exports.updatePartner = async (req, res) => {
  try {
    const partner = await LogisticsPartner.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found' });
    }
    
    // Audit log with correct format
    try {
      await AuditLog.logAction({
        userId: req.admin._id,
        userType: 'center_admin',
        userEmail: req.admin.email,
        action: 'update_logistics_partner',
        category: 'settings',
        description: `Updated logistics partner: ${partner.companyName}`,
        ipAddress: req.ip || req.connection?.remoteAddress || '127.0.0.1',
        userAgent: req.get('User-Agent'),
        resourceType: 'logistics_partner',
        resourceId: partner._id.toString(),
        status: 'success',
        riskLevel: 'low',
        metadata: { companyName: partner.companyName }
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError);
    }
    
    res.json({ success: true, data: partner });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update partner' });
  }
};

// Toggle partner status
exports.toggleStatus = async (req, res) => {
  try {
    const partner = await LogisticsPartner.findById(req.params.id);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found' });
    }
    
    partner.isActive = !partner.isActive;
    await partner.save();
    
    res.json({ success: true, data: partner });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to toggle status' });
  }
};

// Delete partner
exports.deletePartner = async (req, res) => {
  try {
    const partner = await LogisticsPartner.findByIdAndDelete(req.params.id);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found' });
    }
    res.json({ success: true, message: 'Partner deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete partner' });
  }
};


// Get orders assigned to a partner
exports.getPartnerOrders = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const { startDate, endDate, status, type } = req.query;
    
    const query = { logisticsPartner: partnerId };
    
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (status) query.status = status;
    
    const orders = await Order.find(query)
      .populate('customer', 'name phone email')
      .populate('branch', 'name code')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
};

// Assign order to logistics partner
exports.assignOrder = async (req, res) => {
  try {
    const { orderId, partnerId, assignmentType } = req.body;
    
    const [order, partner] = await Promise.all([
      Order.findById(orderId),
      LogisticsPartner.findById(partnerId)
    ]);
    
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found' });
    }
    
    order.logisticsPartner = partnerId;
    
    // Update status based on assignment type
    if (assignmentType === 'pickup') {
      order.status = 'assigned_to_logistics_pickup';
    } else if (assignmentType === 'delivery') {
      order.status = 'assigned_to_logistics_delivery';
    }
    
    order.statusHistory.push({
      status: order.status,
      updatedBy: req.admin._id,
      updatedAt: new Date(),
      notes: `Assigned to ${partner.companyName} for ${assignmentType}`
    });
    
    await order.save();
    
    // Update partner metrics
    partner.performance.totalOrders += 1;
    await partner.save();
    
    res.json({ success: true, data: order });
  } catch (error) {
    console.error('Assign order error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign order' });
  }
};

// Get orders for export (date-wise, partner-wise)
exports.getOrdersForExport = async (req, res) => {
  try {
    const { partnerId, date, type } = req.query;
    
    const query = {};
    
    if (partnerId) query.logisticsPartner = partnerId;
    
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      if (type === 'pickup') {
        query.pickupDate = { $gte: startOfDay, $lte: endOfDay };
      } else {
        query.estimatedDeliveryDate = { $gte: startOfDay, $lte: endOfDay };
      }
    }
    
    if (type === 'pickup') {
      query.status = { $in: ['assigned_to_logistics_pickup', 'placed', 'assigned_to_branch'] };
    } else if (type === 'delivery') {
      query.status = { $in: ['assigned_to_logistics_delivery', 'ready'] };
    }
    
    const orders = await Order.find(query)
      .populate('customer', 'name phone')
      .populate('logisticsPartner', 'companyName')
      .select('orderNumber customer pickupAddress deliveryAddress pickupDate pickupTimeSlot estimatedDeliveryDate status items pricing')
      .sort({ pickupTimeSlot: 1 });
    
    // Format for export
    const exportData = orders.map(order => ({
      orderNumber: order.orderNumber,
      customerName: order.customer?.name || 'N/A',
      customerPhone: order.customer?.phone || 'N/A',
      address: type === 'pickup' 
        ? `${order.pickupAddress?.addressLine1}, ${order.pickupAddress?.city} - ${order.pickupAddress?.pincode}`
        : `${order.deliveryAddress?.addressLine1}, ${order.deliveryAddress?.city} - ${order.deliveryAddress?.pincode}`,
      phone: type === 'pickup' ? order.pickupAddress?.phone : order.deliveryAddress?.phone,
      timeSlot: order.pickupTimeSlot,
      itemCount: order.items?.length || 0,
      total: order.pricing?.total || 0,
      status: order.status
    }));
    
    res.json({ success: true, data: exportData });
  } catch (error) {
    console.error('Export orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to export orders' });
  }
};

// Get settlement report for a partner
exports.getSettlementReport = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const { month, year } = req.query;
    
    const partner = await LogisticsPartner.findById(partnerId);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Partner not found' });
    }
    
    // Calculate date range
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    // Get completed orders for this partner in the date range
    const orders = await Order.find({
      logisticsPartner: partnerId,
      createdAt: { $gte: startDate, $lte: endDate }
    });
    
    // Calculate stats
    const pickupOrders = orders.filter(o => 
      o.statusHistory.some(h => h.status === 'assigned_to_logistics_pickup')
    ).length;
    
    const deliveryOrders = orders.filter(o => 
      o.statusHistory.some(h => h.status === 'assigned_to_logistics_delivery')
    ).length;
    
    const completedOrders = orders.filter(o => 
      o.status === 'delivered'
    ).length;
    
    // Calculate amount based on rate card
    const perOrderRate = partner.rateCard?.perOrder || 0;
    const flatRate = partner.rateCard?.flatRate || 50;
    
    const totalPickupAmount = pickupOrders * (perOrderRate || flatRate);
    const totalDeliveryAmount = deliveryOrders * (perOrderRate || flatRate);
    const totalAmount = totalPickupAmount + totalDeliveryAmount;
    
    res.json({
      success: true,
      data: {
        partner: {
          _id: partner._id,
          companyName: partner.companyName,
          contactPerson: partner.contactPerson,
          rateCard: partner.rateCard
        },
        period: { month, year, startDate, endDate },
        stats: {
          totalOrders: orders.length,
          pickupOrders,
          deliveryOrders,
          completedOrders
        },
        settlement: {
          pickupAmount: totalPickupAmount,
          deliveryAmount: totalDeliveryAmount,
          totalAmount
        }
      }
    });
  } catch (error) {
    console.error('Settlement report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate report' });
  }
};

// Get all partners for dropdown
exports.getPartnersDropdown = async (req, res) => {
  try {
    const partners = await LogisticsPartner.find({ isActive: true })
      .select('companyName contactPerson.name')
      .sort({ companyName: 1 });
    
    res.json({ success: true, data: partners });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch partners' });
  }
};
